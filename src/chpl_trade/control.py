"""Listed goods as a share of all trade.

For each flow, the value of the listed (CHPL) goods divided by the value of all goods:
- EU-27 exports (Comext) to the four route countries, three comparison countries and all
  countries outside the EU;
- each country's exports to Russia (Comtrade), as the country reports them.
If all trade with a country grows, the share stays flat; it rises only when the listed goods
grow faster than everything else.

Output: data/processed/control.csv (listed codes by HS6, and the total of all goods).
"""

import argparse
import json
from datetime import datetime, timezone

import pandas as pd

from . import config
from .build import load_fx
from . import comtrade as ct
from .fetch import COMEXT_URL, _get, chpl_codes, query_codes

RAW = config.RAW / "control"

# Comext partner code -> name, and Comtrade reporter code (None: no second leg)
DESTINATIONS = {
    "KG": ("Kyrgyzstan", 417, "route"),
    "UZ": ("Uzbekistan", 860, "route"),
    "KZ": ("Kazakhstan", 398, "route"),
    "GE": ("Georgia", 268, "comparison"),
    "AZ": ("Azerbaijan", 31, "comparison"),
    "MN": ("Mongolia", 496, "comparison"),
    "EXT_EU27_2020": ("All countries outside the EU", None, "comparison"),
}

# HS 2017 headings that became other headings in HS 2022 (parts of aircraft: 8803 -> 8807).
OLD_HEADING = {"8803": "8807"}
# Codes left out of both groups: 8541.4x (photosensitive devices). In HS 2017 they were one code
# with solar cells and LEDs; listed or not, they cannot be compared across the two editions.
LEFT_OUT = {"854140", "854141", "854142", "854143", "854149"}


def headings():
    hs4 = sorted({c[:4] for c in chpl_codes()})
    return hs4 + [old for old, new in OLD_HEADING.items() if new in hs4]


def hs6_codes():
    return sorted(set(query_codes()) | LEFT_OUT)


def _stamp(body):
    body["_downloaded"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    return body


def fetch_comext(partner, refresh=False):
    out = RAW / f"comext_eu27_to_{partner}.json"
    if out.exists() and not refresh:
        return out
    out.parent.mkdir(parents=True, exist_ok=True)
    params = [("format", "JSON"), ("reporter", "EU27_2020"), ("partner", partner), ("flow", "2"),
              ("indicators", "VALUE_IN_EUROS"), ("freq", "A")]
    params += [("product", c) for c in headings() + hs6_codes()]
    params += [("time", str(y)) for y in config.YEARS]
    out.write_text(json.dumps(_stamp(_get(COMEXT_URL, params).json())))
    return out


def fetch_comext_total(partner, refresh=False):
    out = RAW / f"comext_eu27_to_{partner}_TOTAL.json"
    if out.exists() and not refresh:
        return out
    out.parent.mkdir(parents=True, exist_ok=True)
    params = [("format", "JSON"), ("reporter", "EU27_2020"), ("partner", partner), ("flow", "2"),
              ("indicators", "VALUE_IN_EUROS"), ("freq", "A"), ("product", "TOTAL")]
    params += [("time", str(y)) for y in config.YEARS]
    out.write_text(json.dumps(_stamp(_get(COMEXT_URL, params).json())))
    return out


def fetch_all(refresh=False):
    for p, (name, m49, _) in DESTINATIONS.items():
        print(f"Comext: EU-27 -> {name}")
        fetch_comext(p, refresh)
        fetch_comext_total(p, refresh)


def _comext_frame(partner, suffix=""):
    d = json.loads((RAW / f"comext_eu27_to_{partner}{suffix}.json").read_text())
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
    basket = [c for c in chpl_codes() if c not in config.EXCLUDED_FROM_BASKET]
    frames, missing = [], []
    for p, (name, m49, _) in DESTINATIONS.items():
        for suffix in ("", "_TOTAL"):
            df = _comext_frame(p, suffix)
            df["usd"] = df["eur"] * df["year"].map(fx)
            df["flow"], df["dest"] = "eu", p
            frames.append(df[["flow", "dest", "year", "code", "usd"]])
        if m49:
            for y in config.YEARS:
                rows = ct.records("A", "X", m49, config.RUSSIA_M49, y)
                if not any(r["cmdCode"] == "TOTAL" for r in rows):
                    missing.append(("ru", p, y))  # no total reported for that year
                for r in rows:
                    frames.append(pd.DataFrame([{"flow": "ru", "dest": p, "year": int(r["refYear"]), "code": r["cmdCode"], "usd": float(r["primaryValue"])}]))
    df = pd.concat(frames, ignore_index=True)
    df["code"] = df["code"].map(lambda c: old_to_new.get(c, c))
    listed = df[df["code"].isin(basket)].assign(kind="listed")
    total = df[df["code"] == "TOTAL"].assign(kind="total")
    out = pd.concat([listed, total], ignore_index=True)
    out = out.groupby(["flow", "dest", "year", "kind", "code"], as_index=False)["usd"].sum()
    out = out.sort_values(["flow", "dest", "kind", "code", "year"])
    config.PROCESSED.mkdir(parents=True, exist_ok=True)
    out.to_csv(config.PROCESSED / "control.csv", index=False)
    meta = {
        "destinations": {k: {"name": v[0], "group": v[2], "russia": v[1] is not None} for k, v in DESTINATIONS.items()},
        "missing": [f"{f}|{d}|{y}" for f, d, y in missing],
    }
    (config.PROCESSED / "control_meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    return out, meta


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--refresh", action="store_true")
    a = ap.parse_args()
    fetch_all(a.refresh)
    out, meta = build()
    t = out.groupby(["flow", "dest", "kind", "year"])["usd"].sum().unstack("year")
    share = (t.xs("listed", level="kind") / t.xs("total", level="kind") * 100).round(2)
    print("Listed goods, % of all goods")
    print(share.to_string())
    print("missing:", meta["missing"])
