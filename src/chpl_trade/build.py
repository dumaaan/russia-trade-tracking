"""Turn the raw files into tidy CSV tables in data/processed/.

Output:
  trade_by_code.csv  one row per flow, country, year, CHPL code (USD)
  trade_totals.csv   CHPL basket total per flow, country, year (USD)
"""

import json

import pandas as pd

from . import config
from .fetch import chpl_codes

OLD_TO_NEW = {old: new for new, old in config.HS2017_EQUIVALENT.items()}


def _to_chpl(code):
    return OLD_TO_NEW.get(code, code)


def load_fx():
    fx = pd.read_csv(config.RAW / "ecb_usd_per_eur.csv")
    return dict(zip(fx["year"], fx["usd_per_eur"]))


def load_comext(partner):
    """Read a JSON-stat file from Comext into rows of (hs6, year, eur)."""
    d = json.loads((config.RAW / "comext" / f"eu27_exports_to_{partner}.json").read_text())
    dims = d["id"]
    sizes = d["size"]
    index = {dim: {v: k for k, v in d["dimension"][dim]["category"]["index"].items()} for dim in dims}
    rows = []
    for flat, value in d["value"].items():
        flat = int(flat)
        pos = {}
        for dim, size in reversed(list(zip(dims, sizes))):
            pos[dim] = flat % size
            flat //= size
        rows.append(
            {
                "hs6": index["product"][pos["product"]],
                "year": int(index["time"][pos["time"]]),
                "eur": float(value),
            }
        )
    return pd.DataFrame(rows)


def build_eu_exports():
    fx = load_fx()
    frames = []
    for iso2, info in config.COUNTRIES.items():
        df = load_comext(iso2)
        df["usd"] = df["eur"] * df["year"].map(fx)
        df["country"] = info["name"]
        frames.append(df)
    df = pd.concat(frames)
    df["flow"] = "EU-27 exports to country"
    df["source"] = "Comext DS-045409 (EUR, converted with ECB annual average rate)"
    return df


def build_exports_to_russia():
    rows = []
    for iso2, info in config.COUNTRIES.items():
        for year in config.YEARS:
            path = config.RAW / "comtrade" / f"{iso2}_exports_to_RU_{year}.json"
            for r in json.loads(path.read_text())["data"]:
                rows.append(
                    {
                        "hs6": r["cmdCode"],
                        "year": int(r["refYear"]),
                        "usd": float(r["primaryValue"]),
                        "country": info["name"],
                    }
                )
    df = pd.DataFrame(rows)
    df["flow"] = "Country exports to Russia"
    df["source"] = "UN Comtrade, reported by country (USD)"
    return df


def build():
    df = pd.concat([build_eu_exports(), build_exports_to_russia()], ignore_index=True)
    df["source_hs6"] = df["hs6"]
    df["hs6"] = df["hs6"].map(_to_chpl)
    df = df[df["hs6"].isin(chpl_codes())]

    chpl = pd.read_csv(config.CHPL_CSV, dtype={"hs6": str})
    df = df.merge(chpl[["hs6", "tier"]], on="hs6", how="left")
    df["in_basket"] = ~df["hs6"].isin(config.EXCLUDED_FROM_BASKET)

    by_code = (
        df.groupby(["flow", "country", "year", "hs6", "tier", "in_basket"], as_index=False)["usd"]
        .sum()
        .sort_values(["flow", "country", "year", "hs6"])
    )

    totals = (
        by_code[by_code["in_basket"]]
        .groupby(["flow", "country", "year"], as_index=False)["usd"]
        .sum()
    )
    # Make sure every year is present, also when no trade is reported.
    grid = pd.MultiIndex.from_product(
        [totals["flow"].unique(), totals["country"].unique(), config.YEARS],
        names=["flow", "country", "year"],
    ).to_frame(index=False)
    totals = grid.merge(totals, how="left").fillna({"usd": 0.0})
    totals["usd_million"] = (totals["usd"] / 1e6).round(2)

    config.PROCESSED.mkdir(parents=True, exist_ok=True)
    by_code.to_csv(config.PROCESSED / "trade_by_code.csv", index=False)
    totals.to_csv(config.PROCESSED / "trade_totals.csv", index=False)
    return by_code, totals


if __name__ == "__main__":
    _, totals = build()
    print(totals.pivot_table(index="year", columns=["country", "flow"], values="usd_million"))
