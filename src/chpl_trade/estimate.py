"""How much of the listed goods reached Russia through each route country: two separate measures.

1. Through the country (physical route), for each country (KZ, KG, UZ) and year (2022-2025):
   low   R     the country's own record of its exports of the 49 codes to Russia (Comtrade);
   high  R + missing imports: shipments to the country that are missing from its own import records,
         above the gap it had before the war, on the EU leg (Comext against the country's imports
         from the EU) and the China leg (China's exports against the country's imports from China).
         Goods that arrive but are not recorded are the signature of re-export through a customs
         union (EBRD, "The Eurasian roundabout"). If all of them went on to Russia, this is the
         ceiling; some can stay in the country unrecorded.
   The price-per-kg split gives the share of R in codes priced nearer EU goods than Chinese goods.

2. Sold by the country's companies (any route): Russia's customs records by country of seller
   (KSE, January 2024, Appendix 3): Kyrgyz sellers $98M of battlefield goods in January-October
   2023. By country of dispatch, Kyrgyzstan, Kazakhstan and Uzbekistan are not in the top 10 (the
   10th is $75M), and KSE notes that its data do not include all trade inside the EAEU. So these
   records measure the middleman role, not the physical route, and they are not used in measure 1.

Output: data/processed/estimate.csv, data/processed/estimate_meta.json.
"""

import json
import math

import pandas as pd

from . import config

YEARS = [2022, 2023, 2024, 2025]
NAMES = {"KZ": "Kazakhstan", "KG": "Kyrgyzstan", "UZ": "Uzbekistan"}
# Russia's customs records (KSE, "Challenges of Export Controls Enforcement", January 2024, Appendix 3),
# January-October 2023, battlefield goods.
SELLERS = {
    "source": "https://sanctions.kse.ua/wp-content/uploads/2024/01/Challenges-of-Export-Controls-Enforcement.pdf",
    "period": "January-October 2023",
    "KG": 98e6,              # Kyrgyz sellers, rank 9 of the seller table
    "seller_10th": 78e6,     # the 10th seller country (Thailand): KZ and UZ sellers are under this
    "dispatch_10th": 75e6,   # the 10th dispatch country (South Korea): KG, KZ and UZ are under this
    "measured_recorded_KG": None,  # Kyrgyzstan's own record for the same months (filled in build)
}


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


def _recorded_kg_jan_oct_2023():
    f = pd.read_csv(config.PROCESSED / "events_monthly.csv")
    g = f[(f.leg == "ru") & (f.group == "listed") & (f.country == "KG") & (f.month >= "2023-01") & (f.month <= "2023-10")]
    return float(g.usd.sum()) if len(g) == 10 else None


def build():
    rec, eu, cn, share = _recorded(), _eu_gap(), _china_gap(), _eu_priced_share()
    SELLERS["measured_recorded_KG"] = _recorded_kg_jan_oct_2023()
    rows = []
    for c in NAMES:
        for y in YEARS:
            r = rec[(c, y)]
            if r is None:
                continue
            known = [g for g in (eu[(c, y)], cn[(c, y)]) if g is not None]
            gaps = sum(known) if known else None  # None: no import detail, so no supply-side check
            low = r
            high = r + gaps if gaps is not None else None
            sh, cov = share.get((c, y), (None, 0.0))
            rows.append({"country": c, "year": y, "recorded": r,
                         "eu_gap": eu[(c, y)], "china_gap": cn[(c, y)], "low": low, "high": high,
                         "eu_priced_share": sh if cov >= 0.5 else None, "price_coverage": cov})
    df = pd.DataFrame(rows)
    config.PROCESSED.mkdir(parents=True, exist_ok=True)
    df.to_csv(config.PROCESSED / "estimate.csv", index=False)
    meta = {"sellers": SELLERS, "years": YEARS, "names": NAMES}
    (config.PROCESSED / "estimate_meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    return df, meta


if __name__ == "__main__":
    df, meta = build()
    print("Kyrgyzstan's own record, Jan-Oct 2023:", round(meta["sellers"]["measured_recorded_KG"] / 1e6, 1), "M; Kyrgyz sellers in Russian records: 98M")
    show = df.copy()
    show["price_coverage"] = (show["price_coverage"] * 100).round(0)
    for k in ("recorded", "eu_gap", "china_gap", "low", "high"):
        show[k] = (show[k] / 1e6).round(1)
    show["eu_priced_share"] = (show["eu_priced_share"] * 100).round(0)
    print(show.to_string(index=False))
