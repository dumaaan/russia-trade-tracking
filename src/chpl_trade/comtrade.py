"""One shared UN Comtrade client for every module.

Modules do not call the API. They declare what they need with `need(...)`; `sync()` then
downloads only what is missing or newly revised, in as few calls as possible, and every module
reads the result from one local store (`data/raw/comtrade.sqlite`).

How calls are kept low:
- Releases: one `getDA` call per frequency for all reporters, at most once a day. A period that a
  reporter has not released is not requested.
- Store and coverage: every requested cell (reporter, partner, period, code) is recorded, also
  when Comtrade returns no row for it (zero trade). It is requested again only when Comtrade
  releases a newer version of that period.
- Batching: with an API key, one call carries many reporters, partners and codes and up to 12
  periods, with filters for total rows only (no breakdown by transport mode or customs procedure).
- Quota guard: a daily call counter stops cleanly before the limit; everything already received
  is kept, and the next run continues from there. HTTP 429 waits and tries again.

The API key is read from the COMTRADE_KEY environment variable or from the project's .env file
(git ignores it). Without a key the client uses the free preview API (1 period, 500 rows a call).

    python -m chpl_trade.comtrade status      # what is stored, calls used today
    python -m chpl_trade.comtrade plan        # the calls a full run would make (no calls)
"""

import itertools
import os
import sqlite3
import sys
import time
from datetime import datetime, timezone

import requests

from . import config

DB = config.RAW / "comtrade.sqlite"
BASE = "https://comtradeapi.un.org"
TOTAL_FILTER = {"motCode": 0, "customsCode": "C00", "partner2Code": 0}

KEYED = {"periods": 12, "rows": 90_000, "daily": 500, "margin": 20}
PREVIEW = {"periods": 1, "rows": 450, "daily": 500, "margin": 20}


class QuotaReached(RuntimeError):
    """The daily call limit is reached. Data received so far is stored."""


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def api_key():
    if os.environ.get("COMTRADE_KEY"):
        return os.environ["COMTRADE_KEY"].strip()
    env = config.ROOT / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("COMTRADE_KEY="):
                return line.split("=", 1)[1].strip()
    return None


def _db():
    config.RAW.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB)
    con.executescript("""
        CREATE TABLE IF NOT EXISTS obs (freq TEXT, flow TEXT, reporter INT, partner INT, period TEXT, cmd TEXT,
            value REAL, PRIMARY KEY (freq, flow, reporter, partner, period, cmd));
        CREATE TABLE IF NOT EXISTS cover (freq TEXT, flow TEXT, reporter INT, partner INT, period TEXT, cmd TEXT,
            fetched_at TEXT, PRIMARY KEY (freq, flow, reporter, partner, period, cmd));
        CREATE TABLE IF NOT EXISTS release (freq TEXT, reporter INT, period TEXT, classification TEXT,
            last_released TEXT, PRIMARY KEY (freq, reporter, period));
        CREATE TABLE IF NOT EXISTS release_checked (freq TEXT, reporter INT, checked_at TEXT, PRIMARY KEY (freq, reporter));
        CREATE TABLE IF NOT EXISTS calls (day TEXT PRIMARY KEY, n INT);
        CREATE TABLE IF NOT EXISTS wgt (freq TEXT, flow TEXT, reporter INT, partner INT, period TEXT, cmd TEXT,
            net_wgt REAL, wgt_est INT, qty REAL, qty_unit INT, qty_est INT,
            PRIMARY KEY (freq, flow, reporter, partner, period, cmd));
    """)
    return con


# ------------------------------------------------------------------ needs

_NEEDS = set()


_WNEEDS = set()


def need_weight(freq, flow, reporters, partners, periods, cmds):
    """Declare cells whose net weight and quantity a module will read (also a value need)."""
    need(freq, flow, reporters, partners, periods, cmds)
    for r, p, t, c in itertools.product(reporters, partners, periods, cmds):
        _WNEEDS.add((freq, flow, int(r), int(p), str(t), str(c)))


def need(freq, flow, reporters, partners, periods, cmds):
    """Declare cells a module will read. freq 'A' or 'M'; periods 'YYYY' or 'YYYYMM'."""
    for r, p, t, c in itertools.product(reporters, partners, periods, cmds):
        _NEEDS.add((freq, flow, int(r), int(p), str(t), str(c)))


# ------------------------------------------------------------------ HTTP

class Client:
    def __init__(self, con=None, verbose=True):
        self.con = con or _db()
        self.key = api_key()
        self.lim = KEYED if self.key else PREVIEW
        self.verbose = verbose

    def _calls_today(self):
        day = datetime.now(timezone.utc).date().isoformat()
        row = self.con.execute("SELECT n FROM calls WHERE day=?", (day,)).fetchone()
        return day, (row[0] if row else 0)

    def _count_call(self):
        day, n = self._calls_today()
        self.con.execute("INSERT OR REPLACE INTO calls VALUES (?, ?)", (day, n + 1))
        self.con.commit()

    def _get(self, path, params):
        day, n = self._calls_today()
        if n >= self.lim["daily"] - self.lim["margin"]:
            raise QuotaReached(f"{n} Comtrade calls today; the limit is {self.lim['daily']}. Run again tomorrow.")
        prefix = "/data/v1" if self.key else "/public/v1"
        headers = {"Ocp-Apim-Subscription-Key": self.key} if self.key else {}
        for attempt in range(6):
            r = requests.get(BASE + prefix + path, params=params, headers=headers, timeout=300)
            self._count_call()
            if r.status_code == 200:
                return r.json()
            if r.status_code == 403 and "quota" in r.text.lower():
                raise QuotaReached("Comtrade answered 'Quota Exceeded'. Data received so far is stored.")
            if r.status_code in (429, 500, 502, 503, 504):
                wait = float(r.headers.get("Retry-After", 0)) or 5 * 2 ** attempt
                time.sleep(min(wait, 120))
                continue
            r.raise_for_status()
        raise RuntimeError(f"Comtrade kept failing for {path} {params}")

    # -------------------------------------------------------------- releases

    def refresh_releases(self, freq, reporters, max_age_hours=20):
        """One getDA call for all reporters whose release list is older than max_age_hours."""
        stale = []
        for r in sorted(set(reporters)):
            row = self.con.execute("SELECT checked_at FROM release_checked WHERE freq=? AND reporter=?", (freq, r)).fetchone()
            if not row or (datetime.now(timezone.utc) - datetime.fromisoformat(row[0])).total_seconds() > max_age_hours * 3600:
                stale.append(r)
        for i in range(0, len(stale), 20):
            chunk = stale[i:i + 20]
            if self.verbose:
                print(f"Comtrade releases ({freq}): {len(chunk)} reporters, 1 call")
            body = self._get(f"/getDA/C/{freq}/HS", {"reporterCode": ",".join(map(str, chunk))})
            now = _now()
            for x in body.get("data") or []:
                self.con.execute("INSERT OR REPLACE INTO release VALUES (?,?,?,?,?)",
                                 (freq, x["reporterCode"], str(x["period"]), x["classificationCode"], x["lastReleased"]))
            for r in chunk:
                self.con.execute("INSERT OR REPLACE INTO release_checked VALUES (?,?,?)", (freq, r, now))
            self.con.commit()

    # -------------------------------------------------------------- planning

    def _released(self, freq):
        return {(r, p): lr for r, p, lr in self.con.execute(
            "SELECT reporter, period, last_released FROM release WHERE freq=?", (freq,))}

    def missing(self, needs):
        """Needed cells that are released but not stored, or stored before the latest release."""
        out = []
        by_freq = {}
        for n in needs:
            by_freq.setdefault(n[0], []).append(n)
        for freq, cells in by_freq.items():
            rel = self._released(freq)
            cov = {(fl, r, p, t, c): f for fl, r, p, t, c, f in self.con.execute(
                "SELECT flow, reporter, partner, period, cmd, fetched_at FROM cover WHERE freq=?", (freq,))}
            for (_, fl, r, p, t, c) in cells:
                lr = rel.get((r, t))
                if lr is None:
                    continue  # not released: nothing to download
                f = cov.get((fl, r, p, t, c))
                if f is None or f < lr:
                    out.append((freq, fl, r, p, t, c))
        return out

    def missing_weight(self, wneeds):
        """Weight-needed cells with a stored non-zero value but no stored weight row. Cells with no
        trade have no weight to get, so they cost nothing."""
        if not wneeds:
            return []
        have_w = set(self.con.execute("SELECT freq, flow, reporter, partner, period, cmd FROM wgt"))
        have_v = {tuple(r[:6]) for r in self.con.execute("SELECT freq, flow, reporter, partner, period, cmd, value FROM obs") if r[6]}
        return [n for n in wneeds if n in have_v and n not in have_w]

    def plan(self, needs, wneeds=()):
        """Group missing cells into calls: reporters x partners x periods x codes, within the limits."""
        miss = sorted(set(self.missing(needs)) | set(self.missing_weight(wneeds)))
        groups = {}
        for (freq, fl, r, p, t, c) in miss:
            g = groups.setdefault((freq, fl), {"R": set(), "P": set(), "T": set(), "C": set()})
            g["R"].add(r); g["P"].add(p); g["T"].add(t); g["C"].add(c)
        calls = []
        for (freq, fl), g in sorted(groups.items()):
            R, P, T, C = sorted(g["R"]), sorted(g["P"]), sorted(g["T"]), sorted(g["C"])
            per = self.lim["periods"]
            for ti in range(0, len(T), per):
                tp = T[ti:ti + per]
                # split codes, then reporters, until a call stays under the row limit
                c_chunk = max(1, min(len(C), self.lim["rows"] // max(1, len(R) * len(P) * len(tp))))
                for ci in range(0, len(C), c_chunk):
                    cc = C[ci:ci + c_chunk]
                    r_chunk = max(1, min(len(R), self.lim["rows"] // max(1, len(P) * len(tp) * len(cc))))
                    for ri in range(0, len(R), r_chunk):
                        calls.append({"freq": freq, "flow": fl, "R": R[ri:ri + r_chunk], "P": P, "T": tp, "C": cc})
        return calls, len(miss)

    # -------------------------------------------------------------- download

    def run(self, calls):
        done = 0
        for k in calls:
            params = {"reporterCode": ",".join(map(str, k["R"])), "partnerCode": ",".join(map(str, k["P"])),
                      "period": ",".join(k["T"]), "flowCode": k["flow"], "cmdCode": ",".join(k["C"]),
                      "includeDesc": "false", **TOTAL_FILTER}
            if self.verbose:
                print(f"Comtrade {k['freq']} {k['flow']}: {len(k['R'])} reporters, {len(k['P'])} partners, "
                      f"{len(k['T'])} periods, {len(k['C'])} codes")
            body = self._get(f"/{'get' if self.key else 'preview'}/C/{k['freq']}/HS", params)
            data = body.get("data")
            if data is None:
                raise RuntimeError(f"Comtrade error: {str(body)[:300]}")
            if len(data) >= (500 if not self.key else 100_000):
                raise RuntimeError("A call reached the row limit; the result can be incomplete. Make the batches smaller.")
            now = _now()
            for x in data:
                if (x.get("motCode", 0), x.get("customsCode", "C00"), x.get("partner2Code", 0)) != (0, "C00", 0):
                    continue
                key = (k["freq"], k["flow"], x["reporterCode"], x["partnerCode"], str(x["period"]), x["cmdCode"])
                self.con.execute("INSERT OR REPLACE INTO obs VALUES (?,?,?,?,?,?,?)", (*key, x["primaryValue"]))
                self.con.execute("INSERT OR REPLACE INTO wgt VALUES (?,?,?,?,?,?,?,?,?,?,?)", (
                    *key, x.get("netWgt"), int(bool(x.get("isNetWgtEstimated"))), x.get("qty"),
                    x.get("qtyUnitCode"), int(bool(x.get("isQtyEstimated")))))
            rel = self._released(k["freq"])
            self.con.executemany("INSERT OR REPLACE INTO cover VALUES (?,?,?,?,?,?,?)", [
                (k["freq"], k["flow"], r, p, t, c, now)
                for r, p, t, c in itertools.product(k["R"], k["P"], k["T"], k["C"]) if (r, t) in rel])
            self.con.commit()
            done += 1
        return done


def sync(needs=None, dry=False, verbose=True, wneeds=None):
    """Download what the declared needs are missing. Returns (calls planned, calls made)."""
    needs = set(needs if needs is not None else _NEEDS)
    wneeds = set(wneeds if wneeds is not None else (_WNEEDS if needs is _NEEDS or needs == _NEEDS else ()))
    cl = Client(verbose=verbose)
    for freq in sorted({n[0] for n in needs}):
        cl.refresh_releases(freq, {n[2] for n in needs if n[0] == freq})
    calls, nmiss = cl.plan(needs, wneeds)
    if verbose:
        _, used = cl._calls_today()
        print(f"Comtrade: {len(needs)} cells needed, {nmiss} missing or revised, {len(calls)} calls planned "
              f"({'API key' if cl.key else 'preview, no key'}; {used} calls used today)")
    if dry or not calls:
        return len(calls), 0
    try:
        made = cl.run(calls)
    except QuotaReached as e:
        print(f"Comtrade: stopped. {e}")
        made = -1
    return len(calls), made


# ------------------------------------------------------------------ reading

def weights(freq, flow, reporter, partner, period):
    """{cmd: (net weight kg, estimated?, quantity, unit code, estimated?)} for one cell group."""
    con = _db()
    q = ("SELECT cmd, net_wgt, wgt_est, qty, qty_unit, qty_est FROM wgt WHERE freq=? AND flow=? AND reporter=? "
         "AND partner=? AND period=?")
    return {c: (w, bool(we), qn, qu, bool(qe)) for c, w, we, qn, qu, qe in
            con.execute(q, (freq, flow, int(reporter), int(partner), str(period)))}


def released(freq, reporter, period):
    con = _db()
    return con.execute("SELECT last_released, classification FROM release WHERE freq=? AND reporter=? AND period=?",
                       (freq, int(reporter), str(period))).fetchone()


def latest_period(freq, reporter):
    con = _db()
    row = con.execute("SELECT MAX(period) FROM release WHERE freq=? AND reporter=?", (freq, int(reporter))).fetchone()
    return row[0] if row else None


def records(freq, flow, reporter, partners, period, cmds=None):
    """Stored total rows as Comtrade-like dicts. Empty list: released and no trade (or not stored)."""
    con = _db()
    partners = [int(partners)] if isinstance(partners, (int, str)) else [int(p) for p in partners]
    q = (f"SELECT partner, cmd, value FROM obs WHERE freq=? AND flow=? AND reporter=? AND period=? "
         f"AND partner IN ({','.join('?' * len(partners))})")
    rows = con.execute(q, (freq, flow, int(reporter), str(period), *partners)).fetchall()
    out = []
    for p, c, v in rows:
        if cmds is not None and c not in cmds:
            continue
        out.append({"reporterCode": int(reporter), "partnerCode": p, "period": str(period), "refYear": int(str(period)[:4]),
                    "cmdCode": c, "primaryValue": v, "motCode": 0, "customsCode": "C00", "partner2Code": 0})
    return out


def fetched_at(freq, reporter):
    con = _db()
    row = con.execute("SELECT MAX(fetched_at) FROM cover WHERE freq=? AND reporter=?", (freq, int(reporter))).fetchone()
    return row[0] if row else None


def status():
    con = _db()
    day = datetime.now(timezone.utc).date().isoformat()
    n = con.execute("SELECT n FROM calls WHERE day=?", (day,)).fetchone()
    print(f"API key: {'yes' if api_key() else 'no (preview)'}; calls today: {n[0] if n else 0}")
    for freq, flow, k in con.execute("SELECT freq, flow, COUNT(*) FROM obs GROUP BY freq, flow"):
        print(f"stored rows {freq} {flow}: {k}")
    for freq, k in con.execute("SELECT freq, COUNT(*) FROM release GROUP BY freq"):
        print(f"release entries {freq}: {k}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    if cmd == "status":
        status()
    elif cmd == "plan":
        # Use the imported module (not this __main__ copy), so the needs land in one registry.
        from chpl_trade import comtrade as ct
        from chpl_trade.needs import declare_all
        declare_all()
        ct.sync(dry=True)
    else:
        print(__doc__)
