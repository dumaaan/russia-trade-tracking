"""China leg of the mirror check: what the route countries record as imports from China, against
what China records as exports to them.

For the listed codes (the basket) and for all goods (TOTAL), each year 2019-2025:
- cn   China's exports to the country (UN Comtrade, China as reporter);
- imp  the country's imports from China (UN Comtrade, the country as reporter).
Ratio = imp / cn. Imports are valued with freight and insurance (CIF) and record the country of
origin, so goods made in China and shipped from elsewhere count too: a ratio above 100% is normal.
Each year is compared with the country's own pre-war ratio, as in the EU leg.

A year with no rows at all is missing (Kazakhstan gives no partner detail for imports in
2020-2022), not zero. China's years with a gap (see china.py) are missing too.

Output: data/processed/mirror_cn.csv, data/processed/mirror_cn_meta.json.
"""

import json

import pandas as pd

from . import comtrade as ct
from . import config
from .china import CN
from .fetch import chpl_codes

COUNTRIES = {"KZ": ("Kazakhstan", 398), "KG": ("Kyrgyzstan", 417), "UZ": ("Uzbekistan", 860)}


def build():
    old_to_new = {old: new for new, old in config.HS2017_EQUIVALENT.items()}
    basket = {c for c in chpl_codes() if c not in config.EXCLUDED_FROM_BASKET}
    sup = json.loads((config.PROCESSED / "suppliers_meta.json").read_text())
    rows, missing = [], []
    for p, (name, m49) in COUNTRIES.items():
        for y in config.YEARS:
            for side, recs in (("cn", ct.records("A", "X", CN, m49, y)), ("imp", ct.records("A", "M", m49, CN, y))):
                if (side == "cn" and f"cn|{p}|{y}" in sup["missing"]) or not recs:
                    missing.append(f"{side}|{p}|{y}")
                    continue
                listed = sum(r["primaryValue"] for r in recs if old_to_new.get(r["cmdCode"], r["cmdCode"]) in basket)
                total = sum(r["primaryValue"] for r in recs if r["cmdCode"] == "TOTAL")
                if not any(r["cmdCode"] != "TOTAL" for r in recs):
                    # A total with no product rows (Kazakhstan's imports, 2020-2022): no detail.
                    missing.append(f"{side}-listed|{p}|{y}")
                    listed = None
                rows.append({"country": p, "year": y, "side": side, "listed": listed, "total": total or None})
    df = pd.DataFrame(rows)
    config.PROCESSED.mkdir(parents=True, exist_ok=True)
    df.to_csv(config.PROCESSED / "mirror_cn.csv", index=False)
    meta = {"countries": {k: v[0] for k, v in COUNTRIES.items()}, "missing": missing}
    (config.PROCESSED / "mirror_cn_meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    return df, meta


if __name__ == "__main__":
    df, meta = build()
    print("missing:", meta["missing"])
    for k in ("listed", "total"):
        t = df.pivot_table(index=["country", "year"], columns="side", values=k)
        t["ratio_%"] = (100 * t["imp"] / t["cn"]).round(0)
        print(f"\n{k}, $M"); print((t[["cn", "imp"]] / 1e6).round(1).join(t["ratio_%"]).to_string())
