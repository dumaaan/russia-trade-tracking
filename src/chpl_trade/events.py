"""Enforcement events: did the flows fall, move to neighbour codes, or move to other countries?

For each dated event, monthly values in two windows: the 6 months before the event month and the
6 months after it (the event month itself is left out). The same two windows one year earlier
show the change that the season and the trend alone would give.

Monthly series (US dollars):
- eu   EU-27 exports to the route countries and their neighbours (Comext, converted at the ECB
       monthly rate);
- ru   the route countries' exports to Russia (Comtrade; Kazakhstan 2024 from its statistics
       bureau, see bns.py);
- cn   the route countries' imports from China (Comtrade, as the importing country reports them).
Goods groups:
- listed   the 49 listed codes;
- sib      the other codes of the same HS4 headings ("neighbour codes");
- ban      the two codes of the April 2026 EU ban (8457.10, 8517.62);
- bansib   the other codes of headings 8457 and 8517.

Output: data/processed/events_monthly.csv, data/processed/events.json.
"""

import csv
import io
import json
from datetime import date

import pandas as pd

from . import comtrade as ct
from . import config
from .control import LEFT_OUT, OLD_HEADING, _stamp, headings
from .fetch import COMEXT_URL, _get, chpl_codes, query_codes

RAW = config.RAW / "events"
START = "2021-01"
ECB_M_URL = "https://data-api.ecb.europa.eu/service/data/EXR/M.USD.EUR.SP00.A"
ROUTE = {"KZ": 398, "KG": 417, "UZ": 860}
NEIGHBOURS = ["TJ", "GE", "AZ", "TR", "AE"]
NAMES = {"KZ": "Kazakhstan", "KG": "Kyrgyzstan", "UZ": "Uzbekistan", "TJ": "Tajikistan", "GE": "Georgia",
         "AZ": "Azerbaijan", "TR": "Türkiye", "AE": "United Arab Emirates"}
BAN = ["845710", "851762"]
BAN_HEADINGS = ["8457", "8517"]
WINDOW = 6
MIN_AFTER = 3

# Checked dates only (see reports/Detour data sources and methods.md). "month" is the month in
# which the measure took effect; "focus" is the country it was aimed at (None: all three).
EVENTS = [
    {"id": "kz-checks", "date": "2023-03-24", "focus": "KZ", "label": "Kazakhstan announces stronger checks on re-exports to Russia",
     "url": "https://themoscowtimes.com/2023/03/24/a80602"},
    {"id": "eu-11", "date": "2023-06-24", "focus": None, "label": "EU 11th package: anti-circumvention tool (Art. 12f) in force",
     "url": "https://eur-lex.europa.eu/eli/reg/2023/1214/oj"},
    {"id": "dec-2023", "date": "2023-12-22", "focus": None, "label": "US EO 14114 (secondary sanctions on banks); EU 'no Russia' clause (19 Dec)",
     "url": "https://home.treasury.gov/news/press-releases/jy1994"},
    {"id": "keremet", "date": "2025-01-15", "focus": "KG", "label": "US designates Keremet Bank (Kyrgyzstan)",
     "url": "https://home.treasury.gov/news/press-releases/jy2785"},
    {"id": "a7a5", "date": "2025-08-20", "focus": "KG", "label": "UK sanctions Capital Bank, Grinex and the A7A5 network (Kyrgyzstan)",
     "url": "https://24.kg/english/340437_UK_imposes_sanctions_on_Kyrgyzstans_Capital_Bank_and_crypto_exchanges"},
    {"id": "eu-ban", "date": "2026-04-24", "focus": "KG", "label": "EU bans exports of 8457.10 and 8517.62 to Kyrgyzstan",
     "url": "https://eur-lex.europa.eu/eli/reg/2026/506/oj"},
]


def months(start, end):
    y, m = map(int, start.split("-"))
    ey, em = map(int, end.split("-"))
    out = []
    while (y, m) <= (ey, em):
        out.append(f"{y:04d}-{m:02d}")
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return out


def shift(month, k):
    y, m = map(int, month.split("-"))
    m += k
    while m < 1:
        y, m = y - 1, m + 12
    while m > 12:
        y, m = y + 1, m - 12
    return f"{y:04d}-{m:02d}"


def this_month():
    t = date.today()
    return f"{t.year:04d}-{t.month:02d}"


# ---------------------------------------------------------------- download

def fetch_comext(partner, refresh=False):
    out = RAW / f"comext_eu27_to_{partner}_M.json"
    if out.exists() and not refresh:
        return out
    out.parent.mkdir(parents=True, exist_ok=True)
    params = [("format", "JSON"), ("reporter", "EU27_2020"), ("partner", partner), ("flow", "2"),
              ("indicators", "VALUE_IN_EUROS"), ("freq", "M")]
    params += [("product", c) for c in sorted(set(query_codes()) | LEFT_OUT) + headings()]
    params += [("time", m) for m in months(START, this_month())]
    out.write_text(json.dumps(_stamp(_get(COMEXT_URL, params).json())))
    return out


def fetch_fx(refresh=False):
    out = RAW / "ecb_usd_per_eur_monthly.csv"
    if out.exists() and not refresh:
        return out
    out.parent.mkdir(parents=True, exist_ok=True)
    text = _get(ECB_M_URL, {"format": "csvdata", "startPeriod": START}).text
    rows = [(r["TIME_PERIOD"], r["OBS_VALUE"]) for r in csv.DictReader(io.StringIO(text))]
    out.write_text("month,usd_per_eur\n" + "\n".join(f"{a},{b}" for a, b in rows) + "\n")
    return out


def fetch_all(refresh=False):
    fetch_fx(refresh)
    for p in [*ROUTE, *NEIGHBOURS]:
        print(f"Comext monthly (events): EU-27 -> {NAMES[p]}")
        fetch_comext(p, refresh)


# ---------------------------------------------------------------- build

def _groups(codes):
    """{code: value} for one series and month -> the four goods groups."""
    old_to_new = {old: new for new, old in config.HS2017_EQUIVALENT.items()}
    basket = [c for c in chpl_codes() if c not in config.EXCLUDED_FROM_BASKET]
    v = {}
    for c, x in codes.items():
        c = old_to_new.get(c, OLD_HEADING.get(c, c))
        v[c] = v.get(c, 0.0) + x
    heads = {OLD_HEADING.get(h, h) for h in headings()}
    listed = sum(v.get(c, 0.0) for c in basket)
    left = sum(v.get(c, 0.0) for c in LEFT_OUT)
    hs4 = sum(v.get(h, 0.0) for h in heads)
    ban = sum(v.get(c, 0.0) for c in BAN)
    ban_heads = sum(v.get(h, 0.0) for h in BAN_HEADINGS)
    ban_listed = sum(v.get(c, 0.0) for c in basket if c[:4] in BAN_HEADINGS)
    return {"listed": listed, "sib": hs4 - listed - left, "ban": ban, "bansib": ban_heads - ban_listed}


def _comext(partner, fx):
    d = json.loads((RAW / f"comext_eu27_to_{partner}_M.json").read_text())
    dims, sizes = d["id"], d["size"]
    index = {k: {v: c for c, v in d["dimension"][k]["category"]["index"].items()} for k in dims}
    by_month = {}
    for flat, value in d["value"].items():
        flat = int(flat)
        pos = {}
        for dim, size in reversed(list(zip(dims, sizes))):
            pos[dim] = flat % size
            flat //= size
        m = index["time"][pos["time"]]
        by_month.setdefault(m, {})[index["product"][pos["product"]]] = float(value) * fx[m]
    return by_month


def build():
    fx = pd.read_csv(RAW / "ecb_usd_per_eur_monthly.csv")
    fx = dict(zip(fx["month"], fx["usd_per_eur"]))
    last_eu = None
    rows = []
    for p in [*ROUTE, *NEIGHBOURS]:
        bm = _comext(p, fx)
        last_eu = max([last_eu or "", *bm])
        for m in months(START, this_month()):
            if m not in fx or m > max(bm):
                continue
            for g, x in _groups(bm.get(m, {})).items():
                rows.append({"leg": "eu", "country": p, "month": m, "group": g, "usd": x})
    # Kazakhstan 2024: the statistics bureau's final figures (Comtrade has only Jan-Feb).
    bns_path = config.PROCESSED / "bns_kz_monthly.csv"
    bns = pd.read_csv(bns_path, dtype={"hs6": str}) if bns_path.exists() else None
    unreported = []
    for p, m49 in ROUTE.items():
        for leg, flow, partner in (("ru", "X", config.RUSSIA_M49), ("cn", "M", 156)):
            for m in months(START, this_month()):
                period = m.replace("-", "")
                if leg == "ru" and p == "KZ" and m.startswith("2024") and bns is not None:
                    b = bns[(bns.partner == "RU") & (bns.month == m) & bns.usd.notna()]
                    codes = dict(zip(b.hs6, b.usd))
                    for h in {c[:4] for c in codes}:
                        codes[h] = sum(x for c, x in codes.items() if len(c) == 6 and c.startswith(h))
                elif ct.released("M", m49, period):
                    codes = {r["cmdCode"]: float(r["primaryValue"]) for r in ct.records("M", flow, m49, partner, period)}
                    if not codes:
                        # Released, but not one row for 25 headings: the month has no partner
                        # detail (Kazakhstan's imports, 2020-2022), so it is missing, not zero.
                        unreported.append(f"{leg}|{p}|{m}")
                        continue
                else:
                    if m <= this_month():
                        unreported.append(f"{leg}|{p}|{m}")
                    continue
                for g, x in _groups(codes).items():
                    rows.append({"leg": leg, "country": p, "month": m, "group": g, "usd": x})
    df = pd.DataFrame(rows)
    config.PROCESSED.mkdir(parents=True, exist_ok=True)
    df.to_csv(config.PROCESSED / "events_monthly.csv", index=False)

    series = {(r.leg, r.country, r.group): {} for r in df.itertuples()}
    for r in df.itertuples():
        series[(r.leg, r.country, r.group)][r.month] = r.usd

    def window(s, first, n=WINDOW):
        ms = months(first, shift(first, n - 1))
        vals = [s.get(m) for m in ms]
        return None if any(v is None for v in vals) else sum(vals) / n

    def cell(keys, em):
        """Windows for the sum of several series (a pooled comparison group); None if any is missing."""
        ss = [series.get(k) for k in keys]
        if any(x is None for x in ss):
            return None
        n = 0
        while n < WINDOW and all(shift(em, n + 1) in x for x in ss):
            n += 1
        if n < MIN_AFTER:
            return {"before": None, "after": None, "n": n}
        tot = lambda first, k: (lambda v: None if any(x is None for x in v) else sum(v))([window(x, first, k) for x in ss])
        return {"before": tot(shift(em, -WINDOW), WINDOW), "after": tot(shift(em, 1), n), "n": n}

    table = []
    for e in EVENTS:
        em = e["month"] if "month" in e else e["date"][:7]
        if e["id"] == "eu-ban":
            continue  # the ban has its own chapter
        rows_for = [e["focus"]] if e["focus"] else list(ROUTE)
        for c in rows_for:
            others = [x for x in ROUTE if x != c]
            comp_eu = others if e["focus"] else ["TR", "AE", "GE", "AZ"]
            table.append({
                "event": e["id"], "country": c,
                "q1": {leg: cell([(leg, c, "listed")], em) for leg in ("eu", "cn", "ru")},
                "q2": {"ru": cell([("ru", c, "sib")], em), "eu": cell([("eu", c, "sib")], em)},
                "q3": {"eu": cell([("eu", x, "listed") for x in comp_eu], em),
                       "ru": cell([("ru", x, "listed") for x in others], em) if e["focus"] else None,
                       "eu_who": comp_eu, "ru_who": others if e["focus"] else []},
                "spark": [series.get(("ru", c, "listed"), {}).get(m) for m in months(shift(em, -12), shift(em, 12))],
                "spark_start": shift(em, -12),
            })

    # The April 2026 ban, in the ban chapter's windows: banned codes against the other codes of
    # headings 8457 and 8517, against the same months of 2025.
    ban_before = months("2025-04", "2026-03")
    after_ms = lambda s: [m for m in months("2026-05", this_month()) if m in s]
    ban_nb = {}
    for leg in ("eu", "cn", "ru"):
        for c in ("KG", "KZ"):
            for g in ("ban", "bansib"):
                s = series.get((leg, c, g))
                if not s:
                    continue
                am = after_ms(s)
                ya = [shift(m, -12) for m in am]
                if len(am) < MIN_AFTER or any(m not in s for m in ya):
                    continue
                ban_nb[f"{leg}|{c}|{g}"] = {"after": sum(s[m] for m in am) / len(am), "year_ago": sum(s[m] for m in ya) / len(ya), "n": len(am)}

    out = []
    for e in EVENTS:
        em = e["date"][:7]
        res = {}
        for (leg, c, g), s in series.items():
            # After the event: up to WINDOW months, at least MIN_AFTER; the year-earlier windows use
            # the same number of months, so the season is the same.
            n = 0
            while n < WINDOW and shift(em, n + 1) in s:
                n += 1
            if n < MIN_AFTER:
                res[f"{leg}|{c}|{g}"] = {"before": None, "after": None, "before_ya": None, "after_ya": None, "after_months": n}
                continue
            b, a = window(s, shift(em, -WINDOW)), window(s, shift(em, 1), n)
            by, ay = window(s, shift(em, -WINDOW - 12)), window(s, shift(em, 1 - 12), n)
            res[f"{leg}|{c}|{g}"] = {"before": b, "after": a, "before_ya": by, "after_ya": ay, "after_months": n}
        out.append({**e, "month": em, "results": res})
    meta = {"events": [{k: v for k, v in e.items() if k != "results"} | {"month": e["month"]} for e in out],
            "table": table, "ban_neighbours": ban_nb, "window": WINDOW, "names": NAMES, "route": list(ROUTE), "neighbours": NEIGHBOURS,
            "unreported": unreported, "last_eu": last_eu}
    (config.PROCESSED / "events.json").write_text(json.dumps(meta, indent=1) + "\n")
    meta["results"] = {e["id"]: e["results"] for e in out}
    return df, meta


if __name__ == "__main__":
    fetch_all()
    df, meta = build()
    pct = lambda a, b: "—" if a is None or b in (None, 0) else f"{100 * (a / b - 1):+.0f}%"
    for e in meta["events"]:
        print(f"\n{e['month']} {e['label']}")
        for k, r in meta["results"][e["id"]].items():
            leg, c, g = k.split("|")
            if g not in ("listed", "sib") or c not in ROUTE:
                continue
            print(f"  {k:18s} change {pct(r['after'], r['before']):>7s}   year before {pct(r['after_ya'], r['before_ya']):>7s}   ({r['after_months']} months after)")
