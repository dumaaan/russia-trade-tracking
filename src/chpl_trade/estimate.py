"""How much of the listed goods probably reached Russia through each route country: one range a year.

Four documented parts, for each country (KZ, KG, UZ) and year (2022-2025):

1. Recorded   R    the country's own record of its exports of the 49 codes to Russia (Comtrade).
2. Records of Russia's customs (Kyrgyzstan only): KSE found $98M of these goods sold by Kyrgyz
   sellers in Russian import records for January-October 2023 (45-code list), against $25.6M in
   Kyrgyzstan's own records for the same months: a factor of 3.8. KSE's Q3 2026 tracker finds
   recorded volumes of tiers 1, 2 and 3.A 3-4 times lower than in transaction records (all
   partners). Factor range: 3 to 4.
   No such published factor exists for Kazakhstan or Uzbekistan, so none is used for them.
3. Supply side: shipments to the country that are missing from its own import records, above the
   gap it had before the war (the mirror checks): EU leg (Comext against the country's imports from
   the EU) and China leg (China's exports against the country's imports from China). Goods that
   arrive but are not recorded are the signature of re-export through a customs union (EBRD,
   "The Eurasian roundabout"). If all of them went on to Russia, R + gaps is a ceiling.
4. Price per kg: the share of R in codes priced nearer EU goods than Chinese goods. It splits the
   range by likely origin; it does not change its size.

Range:  low  = R x 3 (Kyrgyzstan), else R
        high = the larger of R x 4 (Kyrgyzstan) and R + EU gap + China gap
Every part is a published or computed number; the assumptions are only which parts count.

Output: data/processed/estimate.csv, data/processed/estimate_meta.json.
"""

import json
import math

import pandas as pd

from . import config

YEARS = [2022, 2023, 2024, 2025]
NAMES = {"KZ": "Kazakhstan", "KG": "Kyrgyzstan", "UZ": "Uzbekistan"}
KSE = {"low": 3.0, "high": 4.0, "measured": None,
       "source": "https://sanctions.kse.ua/wp-content/uploads/2024/01/Challenges-of-Export-Controls-Enforcement.pdf",
       "source_2026": "https://institute.kse.ua/news/official-trade-statistics-may-not-reflect-the-full-volume-of-imports-of-military-goods-into-russia-russian-chp-imports-tracker-for-the-third-quarter-of-2026/"}
KSE_PUBLISHED = 98e6  # Kyrgyz sellers, Jan-Oct 2023, Russian customs records


def _china_gap():
    """Imports from China missing above each country's pre-war ratio (listed codes, current USD)."""
    d = pd.read_csv(config.PROCESSED / "mirror_cn.csv")
    meta = json.loads((config.PROCESSED / "mirror_cn_meta.json").read_text())
    miss = set(meta["missing"])
    out = {}
    for c in NAMES:
        def val(side, y):
            if f"{side}|{c}|{y}" in miss or f"{side}-listed|{c}|{y}" in miss:
                return None
            r = d[(d.country == c) & (d.year == y) & (d.side == side)]
            return None if r.empty or pd.isna(r.listed.iloc[0]) else float(r.listed.iloc[0])
        sc = si = 0.0
        for y in config.BASELINE_YEARS:
            a, b = val("cn", y), val("imp", y)
            if a and b is not None:
                sc, si = sc + a, si + b
        for y in YEARS:
            a, b = val("cn", y), val("imp", y)
            out[(c, y)] = None if not sc or not a or b is None else max(0.0, a * si / sc - b)
    return out


def _eu_gap():
    d = pd.read_csv(config.PROCESSED / "comparison.csv")
    out = {}
    for c, name in NAMES.items():
        for y in YEARS:
            r = d[(d.country == name) & (d.year == y)]
            v = None if r.empty or pd.isna(r.excess_gap_usd.iloc[0]) else max(0.0, float(r.excess_gap_usd.iloc[0]))
            out[(c, y)] = v
    return out


def _recorded():
    d = pd.read_csv(config.PROCESSED / "comparison.csv")
    return {(c, y): (None if (r := d[(d.country == n) & (d.year == y)]).empty or pd.isna(r.exports_to_ru_usd.iloc[0])
                     else float(r.exports_to_ru_usd.iloc[0])) for c, n in NAMES.items() for y in YEARS}


def _eu_priced_share():
    """Share of the value to Russia in codes priced nearer EU goods than China's (China's records)."""
    uv = pd.read_csv(config.PROCESSED / "unit_values.csv", dtype={"hs6": str})
    out = {}
    for (c, y), g in uv.groupby(["country", "year"]):
        w = g.pivot_table(index="hs6", columns="leg", values=["usd_per_kg", "usd", "estimated"], aggfunc="first")
        e = t = 0.0
        for _, r in w.iterrows():
            try:
                ru, eu, cn, v, est = r[("usd_per_kg", "ru")], r[("usd_per_kg", "eu")], r[("usd_per_kg", "cn")], r[("usd", "ru")], r[("estimated", "ru")]
            except KeyError:
                continue
            if any(pd.isna(x) for x in (ru, eu, cn, v)) or est is True:
                continue
            t += v
            if abs(math.log(ru / eu)) < abs(math.log(ru / cn)):
                e += v
        # Only where the weighed codes cover at least half of the recorded value to Russia.
        rec = g[g.leg == "ru"].usd.sum()
        out[(c, int(y))] = (e / t if t else None, t / rec if rec else 0.0)
    return out


def _kse_measured():
    f = pd.read_csv(config.PROCESSED / "events_monthly.csv")
    g = f[(f.leg == "ru") & (f.group == "listed") & (f.country == "KG") & (f.month >= "2023-01") & (f.month <= "2023-10")]
    return KSE_PUBLISHED / g.usd.sum() if len(g) == 10 and g.usd.sum() else None


def build():
    rec, eu, cn, share = _recorded(), _eu_gap(), _china_gap(), _eu_priced_share()
    KSE["measured"] = _kse_measured()
    rows = []
    for c in NAMES:
        for y in YEARS:
            r = rec[(c, y)]
            if r is None:
                continue
            kse = c == "KG"
            known = [g for g in (eu[(c, y)], cn[(c, y)]) if g is not None]
            gaps = sum(known) if known else None  # None: no import detail, so no supply-side check
            low = r * KSE["low"] if kse else r
            high = max(r * KSE["high"] if kse else r, r + gaps) if gaps is not None else (r * KSE["high"] if kse else None)
            sh, cov = share.get((c, y), (None, 0.0))
            rows.append({"country": c, "year": y, "recorded": r,
                         "kse_low": r * KSE["low"] if kse else None, "kse_high": r * KSE["high"] if kse else None,
                         "eu_gap": eu[(c, y)], "china_gap": cn[(c, y)], "low": low, "high": high,
                         "eu_priced_share": sh if cov >= 0.5 else None, "price_coverage": cov})
    df = pd.DataFrame(rows)
    config.PROCESSED.mkdir(parents=True, exist_ok=True)
    df.to_csv(config.PROCESSED / "estimate.csv", index=False)
    meta = {"kse": KSE, "years": YEARS, "names": NAMES}
    (config.PROCESSED / "estimate_meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    return df, meta


if __name__ == "__main__":
    df, meta = build()
    print("KSE factor measured:", round(meta["kse"]["measured"], 2))
    show = df.copy()
    show["price_coverage"] = (show["price_coverage"] * 100).round(0)
    for k in ("recorded", "kse_low", "kse_high", "eu_gap", "china_gap", "low", "high"):
        show[k] = (show[k] / 1e6).round(1)
    show["eu_priced_share"] = (show["eu_priced_share"] * 100).round(0)
    print(show.to_string(index=False))
