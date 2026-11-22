"""Test of the first EU anti-circumvention ban (Article 12f, Regulation (EU) 2026/506).

On 23 April 2026 the EU banned exports to Kyrgyzstan of CN 8457 10 (machining centres) and
CN 8517 62 (data transmission apparatus), in force on 24 April 2026. This module downloads
monthly data and compares the months after the ban with the months before it:

- EU-27 exports to Kyrgyzstan of the two banned codes (does the ban work?);
- EU-27 exports to Kyrgyzstan of the other CHPL codes (control goods);
- EU-27 exports of the banned codes to neighbouring countries (do sellers move?);
- Kyrgyzstan's and Kazakhstan's exports of the banned codes to Russia (the second leg).

Output: data/processed/ban_monthly.csv and data/processed/ban_summary.json.
"""

import argparse
import csv
import io
import json
from datetime import date, datetime, timezone

import pandas as pd

from . import config
from . import comtrade as ct
from .fetch import COMEXT_URL, _get, keep_comext, keep_recent, query_codes

ECB_M_URL = "https://data-api.ecb.europa.eu/service/data/EXR/M.USD.EUR.SP00.A"

BAN_DATE = "2026-04-23"
BAN_MONTH = "2026-04"            # the transition month, left out of both windows
BANNED = ["845710", "851762"]
TARGET = "KG"
START = "2024-01"
BEFORE = ("2025-04", "2026-03")  # 12 months before the ban
# Countries where EU sellers could move the banned goods (Comext partner codes).
NEIGHBOURS = {
    "KZ": "Kazakhstan", "UZ": "Uzbekistan", "TJ": "Tajikistan",
    "GE": "Georgia", "AZ": "Azerbaijan", "TR": "Türkiye", "AE": "United Arab Emirates",
}
# Second-leg reporters (Comtrade M49 codes).
LEG2 = {"KG": 417, "UZ": 860, "KZ": 398}

RAW = config.RAW / "monthly"


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


def this_month():
    t = date.today()
    return f"{t.year:04d}-{t.month:02d}"


def _stamp(body):
    body["_downloaded"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    return body


# ---------------------------------------------------------------- download

def fetch_comext_monthly(partner, refresh=False):
    """EU-27 monthly exports (EUR) to one partner, all CHPL codes, START to now."""
    out = RAW / f"comext_eu27_to_{partner}.json"
    if keep_comext(out, refresh):
        return out
    out.parent.mkdir(parents=True, exist_ok=True)
    params = [("format", "JSON"), ("reporter", "EU27_2020"), ("partner", partner), ("flow", "2"),
              ("indicators", "VALUE_IN_EUROS"), ("freq", "M")]
    params += [("product", c) for c in query_codes()]
    params += [("time", m) for m in months(START, this_month())]
    out.write_text(json.dumps(_stamp(_get(COMEXT_URL, params).json())))
    return out


def fetch_fx_monthly(refresh=False):
    out = RAW / "ecb_usd_per_eur_monthly.csv"
    if keep_recent(out, refresh):
        return out
    out.parent.mkdir(parents=True, exist_ok=True)
    text = _get(ECB_M_URL, {"format": "csvdata", "startPeriod": START}).text
    with open(out, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["month", "usd_per_eur"])
        for row in csv.DictReader(io.StringIO(text)):
            w.writerow([row["TIME_PERIOD"], row["OBS_VALUE"]])
    return out


def fetch_all(refresh=False):
    fetch_fx_monthly(refresh)
    for p in [TARGET, *NEIGHBOURS]:
        print(f"Comext monthly: EU-27 -> {p}")
        fetch_comext_monthly(p, refresh)


# ---------------------------------------------------------------- build

def _comext_rows(partner):
    d = json.loads((RAW / f"comext_eu27_to_{partner}.json").read_text())
    dims, sizes = d["id"], d["size"]
    index = {k: {v: c for c, v in d["dimension"][k]["category"]["index"].items()} for k in dims}
    rows = []
    for flat, value in d["value"].items():
        flat = int(flat)
        pos = {}
        for dim, size in reversed(list(zip(dims, sizes))):
            pos[dim] = flat % size
            flat //= size
        rows.append({"hs6": index["product"][pos["product"]], "month": index["time"][pos["time"]], "eur": float(value)})
    return pd.DataFrame(rows, columns=["hs6", "month", "eur"]), d.get("updated", "")[:10]


def build():
    old_to_new = {old: new for new, old in config.HS2017_EQUIVALENT.items()}
    fx = pd.read_csv(RAW / "ecb_usd_per_eur_monthly.csv")
    fx = dict(zip(fx["month"], fx["usd_per_eur"]))
    frames = []
    comext_updated = ""
    for p in [TARGET, *NEIGHBOURS]:
        df, comext_updated = _comext_rows(p)
        df["usd"] = df["eur"] * df["month"].map(fx)
        df["flow"] = "eu"
        df["country"] = p
        frames.append(df)
    eu = pd.concat(frames)
    comext_last = eu["month"].max()

    # last month each reporter has released (Comtrade release list in the shared store)
    latest = {}
    for iso2, m49 in LEG2.items():
        p = ct.latest_period("M", m49)
        latest[iso2] = f"{p[:4]}-{p[4:6]}"
    rows = []
    unreported = []  # (flows, reporter, month) not released: the month is missing, not zero
    # The store also holds HS4 and HS2 totals for other modules; this module reads the listed codes only.
    wanted = set(query_codes())
    # Kazakhstan 2024: Comtrade has only January and February; the statistics bureau has every month.
    bns_path = config.PROCESSED / "bns_kz_monthly.csv"
    bns = pd.read_csv(bns_path, dtype={"hs6": str}) if bns_path.exists() else None
    for iso2 in LEG2:
        for m in months(START, latest[iso2]):
            if iso2 == "KZ" and m.startswith("2024") and bns is not None:
                b = bns[(bns.partner == "RU") & (bns.month == m) & bns.usd.notna() & bns.hs6.isin(wanted)]
                rows += [{"hs6": c, "month": m, "usd": float(v), "flow": "ru", "country": iso2} for c, v in zip(b.hs6, b.usd)]
                if not ct.released("M", LEG2[iso2], m.replace("-", "")):
                    unreported.append((("cn",), iso2, m))  # the bureau's file has EAEU trade only
                continue
            data = [r for r in ct.records("M", "X", LEG2[iso2], config.RUSSIA_M49, m.replace("-", "")) if r["cmdCode"] in wanted]
            released = ct.released("M", LEG2[iso2], m.replace("-", ""))
            if not released:
                unreported.append((("ru", "cn"), iso2, m))  # not released: missing; released with no rows: zero trade
            for r in data:
                if (r["motCode"], r["customsCode"], r["partner2Code"]) != (0, "C00", 0):
                    continue
                rows.append({"hs6": r["cmdCode"], "month": m, "usd": float(r["primaryValue"]), "flow": "ru", "country": iso2})
    # Imports from China, as each route country reports them.
    for iso2 in LEG2:
        for m in months(START, latest[iso2]):
            if not ct.released("M", LEG2[iso2], m.replace("-", "")):
                continue
            for r in ct.records("M", "M", LEG2[iso2], 156, m.replace("-", "")):
                if r["cmdCode"] not in wanted:
                    continue
                rows.append({"hs6": r["cmdCode"], "month": m, "usd": float(r["primaryValue"]), "flow": "cn", "country": iso2})
    ru = pd.DataFrame(rows)
    df = pd.concat([eu, ru], ignore_index=True)
    df["hs6"] = df["hs6"].map(lambda c: old_to_new.get(c, c))
    df = df[~df["hs6"].isin(config.EXCLUDED_FROM_BASKET)]
    df["group"] = df["hs6"].map(lambda c: "banned" if c in BANNED else "other")

    # Monthly totals per flow, country, group, plus each banned code on its own.
    tot = df.groupby(["flow", "country", "group", "month"], as_index=False)["usd"].sum()
    per = df[df["group"] == "banned"].groupby(["flow", "country", "hs6", "month"], as_index=False)["usd"].sum()
    per = per.rename(columns={"hs6": "group"})
    out = pd.concat([tot, per], ignore_index=True)

    # Fill the month grid: within the data range, a missing row is zero trade.
    last = {"eu": comext_last, **{f"ru-{k}": v for k, v in latest.items()}, **{f"cn-{k}": v for k, v in latest.items()}}
    grid = []
    for (flow, country, group), _ in out.groupby(["flow", "country", "group"]):
        end = last["eu"] if flow == "eu" else last[f"{flow}-{country}"]
        for m in months(START, end):
            grid.append((flow, country, group, m))
    g = pd.DataFrame(grid, columns=["flow", "country", "group", "month"])
    out = g.merge(out, how="left").fillna({"usd": 0.0})
    for flows, iso2, m in unreported:
        out.loc[out["flow"].isin(flows) & (out["country"] == iso2) & (out["month"] == m), "usd"] = float("nan")
    out = out.sort_values(["flow", "country", "group", "month"])
    config.PROCESSED.mkdir(parents=True, exist_ok=True)
    out.to_csv(config.PROCESSED / "ban_monthly.csv", index=False)

    summary = summarise(out, last)
    summary.update({
        "ban_date": BAN_DATE, "banned": BANNED, "before": list(BEFORE), "transition": BAN_MONTH,
        "comext_updated": comext_updated, "comext_last_month": comext_last, "comtrade_last_month": latest,
        "neighbours": NEIGHBOURS,
        "rows": list(LEG2),
        "names": {"KG": "Kyrgyzstan", **NEIGHBOURS},
        "unreported": [f"{i} {m}" for f, i, m in unreported if "ru" in f],
    })
    (config.PROCESSED / "ban_summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    return out, summary


def summarise(df, last):
    """Average monthly value before and after the ban, and the same months a year earlier."""
    res = {}
    for (flow, country, group), g in df.groupby(["flow", "country", "group"]):
        s = g.set_index("month")["usd"]
        end = last["eu"] if flow == "eu" else last[f"{flow}-{country}"]
        after = months("2026-05", end)
        before = months(*BEFORE)
        year_ago = [f"{int(m[:4]) - 1}-{m[5:]}" for m in after]
        def avg(ms):
            v = s.reindex(ms)
            if not ms or v.isna().all():
                return None
            return float(v.mean())  # a missing month is left out, not counted as zero
        b, a, y = avg(before), avg(after), avg(year_ago)
        res[f"{flow}|{country}|{group}"] = {
            "before_avg": b, "after_avg": a, "year_ago_avg": y,
            "after_months": len(after),
            "change_pct": None if not b or a is None else 100 * (a / b - 1),
            "change_vs_year_ago_pct": None if not y or a is None else 100 * (a / y - 1),
        }
    # Control-goods comparison for the target: change of banned codes relative to the other codes.
    k = lambda grp: res.get(f"eu|{TARGET}|{grp}")
    bn, ot = k("banned"), k("other")
    if bn and ot and bn["before_avg"] and ot["before_avg"]:
        res["relative_to_control_pct"] = 100 * ((bn["after_avg"] / bn["before_avg"]) / (ot["after_avg"] / ot["before_avg"]) - 1)
    return {"series": res}


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--refresh", action="store_true")
    args = p.parse_args()
    fetch_all(args.refresh)
    _, s = build()
    for key in [f"eu|{TARGET}|banned", f"eu|{TARGET}|other", *[f"eu|{TARGET}|{c}" for c in BANNED],
                *[f"eu|{n}|banned" for n in NEIGHBOURS], "ru|KG|banned", "ru|KG|other", "ru|KZ|banned"]:
        v = s["series"].get(key)
        if v:
            print(f"{key:22s} before {(v['before_avg'] or 0)/1e3:9.1f}k  after {(v['after_avg'] or 0)/1e3:9.1f}k  "
                  f"change {v['change_pct'] if v['change_pct'] is None else round(v['change_pct'])}%  "
                  f"vs year ago {v['change_vs_year_ago_pct'] if v['change_vs_year_ago_pct'] is None else round(v['change_vs_year_ago_pct'])}%")
    print("relative to control:", round(s["series"].get("relative_to_control_pct", float("nan"))), "%")
