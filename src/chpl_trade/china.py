"""The EU and China as suppliers of the listed goods, 2019-2025.

For each destination (the four route countries, and Russia directly): EU-27 exports of the listed
codes (Comext) and China's exports of the same codes (UN Comtrade, as China reports them).

China's Comtrade data has gaps: a year whose total of all goods is zero or absent is missing
(China to Armenia, 2023 and 2024), not zero trade.

Output: data/processed/suppliers.csv (one row per supplier, destination, year, HS6 code).
"""

import json
from datetime import datetime, timezone

import pandas as pd

from . import comtrade as ct
from . import config
from .build import load_fx
from .fetch import COMEXT_URL, _get, chpl_codes, keep_comext, query_codes

RAW = config.RAW / "suppliers"
CN = 156
HK = 344  # Hong Kong: re-exports mostly Chinese goods; its exports include re-exports
# Comext partner code -> (name, UN M49)
DESTINATIONS = {
    "KG": ("Kyrgyzstan", 417), "UZ": ("Uzbekistan", 860), "KZ": ("Kazakhstan", 398),
    "RU": ("Russia", 643),
}


def fetch_comext(partner, refresh=False):
    """EU-27 exports of the listed codes; reuses the files other modules already downloaded."""
    for reuse in (config.RAW / "control" / f"comext_eu27_to_{partner}.json",
                  config.RAW / "comext" / f"eu27_exports_to_{partner}.json"):
        if keep_comext(reuse, refresh):
            return reuse
    out = RAW / f"comext_eu27_to_{partner}.json"
    if keep_comext(out, refresh):
        return out
    out.parent.mkdir(parents=True, exist_ok=True)
    params = [("format", "JSON"), ("reporter", "EU27_2020"), ("partner", partner), ("flow", "2"),
              ("indicators", "VALUE_IN_EUROS"), ("freq", "A")]
    params += [("product", c) for c in query_codes()]
    params += [("time", str(y)) for y in config.YEARS]
    body = _get(COMEXT_URL, params).json()
    body["_downloaded"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    out.write_text(json.dumps(body))
    return out


def fetch_all(refresh=False):
    for p in DESTINATIONS:
        fetch_comext(p, refresh)


def _comext(path):
    d = json.loads(path.read_text())
    dims, sizes = d["id"], d["size"]
    index = {k: {v: c for c, v in d["dimension"][k]["category"]["index"].items()} for k in dims}
    rows = []
    for flat, value in d["value"].items():
        flat = int(flat)
        pos = {}
        for dim, size in reversed(list(zip(dims, sizes))):
            pos[dim] = flat % size
            flat //= size
        rows.append({"code": index["product"][pos["product"]], "year": int(index["time"][pos["time"]]), "eur": float(value)})
    return pd.DataFrame(rows, columns=["code", "year", "eur"])


def build():
    fx = load_fx()
    old_to_new = {old: new for new, old in config.HS2017_EQUIVALENT.items()}
    basket = set(c for c in chpl_codes() if c not in config.EXCLUDED_FROM_BASKET)
    frames, missing = [], []
    for p, (name, m49) in DESTINATIONS.items():
        eu = _comext(fetch_comext(p))
        eu["usd"] = eu["eur"] * eu["year"].map(fx)
        eu["supplier"], eu["dest"] = "eu", p
        frames.append(eu[["supplier", "dest", "year", "code", "usd"]])
        for sup, rep in (("cn", CN), ("hk", HK)):
            if sup == "hk" and p == "RU":
                continue  # direct flows to Russia are outside the detour
            rows = []
            recs = {y: ct.records("A", "X", rep, m49, y) for y in config.YEARS}
            totals = {y: sum(r["primaryValue"] for r in recs[y] if r["cmdCode"] == "TOTAL") for y in config.YEARS}
            for y in config.YEARS:
                others = sorted(t for yy, t in totals.items() if yy != y and t)
                # A total of all goods that is absent, or under 5% of the other years' median, is a
                # reporting gap, not a real collapse of trade. The median, not the mean: one large
                # year (Hong Kong to Uzbekistan, 2023) must not make normal years look like gaps.
                med = others[len(others) // 2] if others else 0
                if not totals[y] or (others and totals[y] < 0.05 * med):
                    missing.append(f"{sup}|{p}|{y}")
                    continue
                rows += [{"supplier": sup, "dest": p, "year": y, "code": r["cmdCode"], "usd": r["primaryValue"]} for r in recs[y]]
            frames.append(pd.DataFrame(rows, columns=["supplier", "dest", "year", "code", "usd"]))
    df = pd.concat(frames, ignore_index=True)
    df["code"] = df["code"].map(lambda c: old_to_new.get(c, c))
    df = df[df["code"].isin(basket)]
    out = df.groupby(["supplier", "dest", "year", "code"], as_index=False)["usd"].sum()
    config.PROCESSED.mkdir(parents=True, exist_ok=True)
    out.to_csv(config.PROCESSED / "suppliers.csv", index=False)
    meta = {"destinations": {k: v[0] for k, v in DESTINATIONS.items()}, "missing": missing}
    (config.PROCESSED / "suppliers_meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    return out, meta


if __name__ == "__main__":
    fetch_all()
    out, meta = build()
    t = out.groupby(["dest", "supplier", "year"])["usd"].sum().unstack("year") / 1e6
    print(t.round(1).to_string())
    print("missing:", meta["missing"])
