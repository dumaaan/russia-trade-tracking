"""Write docs/data.js for the website (GitHub Pages serves docs/).

The file sets window.CHPL_DATA, so the page also works when you open
docs/index.html directly from disk (no fetch, no server).
"""

import json
from datetime import date

import pandas as pd

from . import config

DOCS = config.ROOT / "docs"


def export():
    totals = pd.read_csv(config.PROCESSED / "trade_totals.csv")
    comp = pd.read_csv(config.PROCESSED / "comparison.csv")
    by_code = pd.read_csv(config.PROCESSED / "trade_by_code.csv", dtype={"hs6": str})
    chpl = pd.read_csv(config.CHPL_CSV, dtype={"hs6": str})

    flows = {"EU-27 exports to country": "eu", "Country exports to Russia": "ru"}

    series = {}
    for (flow, country), g in totals.groupby(["flow", "country"]):
        g = g.sort_values("year")
        series.setdefault(country, {})[flows[flow]] = [round(v, 3) for v in g["usd"] / 1e6]

    comparison = {}
    for country, g in comp.groupby("country"):
        g = g.sort_values("year")
        comparison[country] = {
            "eu_index": g["eu_index"].tolist(),
            "ru_index": g["ru_index"].tolist(),
            "ratio": g["ru_to_eu_ratio_pct"].tolist(),
        }

    codes = []
    for r in by_code.itertuples():
        codes.append([flows[r.flow], r.country, int(r.year), r.hs6, round(r.usd / 1e6, 4)])

    data = {
        "years": config.YEARS,
        "baseYear": 2021,
        "countries": [c["name"] for c in config.COUNTRIES.values()],
        "series": series,
        "comparison": comparison,
        "codes": codes,
        "chpl": chpl.to_dict(orient="records"),
        "excluded": sorted(config.EXCLUDED_FROM_BASKET),
        "built": date.today().isoformat(),
    }
    DOCS.mkdir(exist_ok=True)
    out = DOCS / "data.js"
    out.write_text("window.CHPL_DATA = " + json.dumps(data, separators=(",", ":")) + ";\n")
    return out


if __name__ == "__main__":
    print(export())
