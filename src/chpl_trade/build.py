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


EU_FLOW = "EU-27 exports to country"
RU_FLOW = "Country exports to Russia"


def build_eu_exports():
    fx = load_fx()
    frames = []
    for iso2, info in config.COUNTRIES.items():
        df = load_comext(iso2)
        df["usd"] = df["eur"] * df["year"].map(fx)
        df["country"] = info["name"]
        frames.append(df)
    df = pd.concat(frames)
    df["flow"] = EU_FLOW
    df["source"] = "Comext DS-045409 (EUR, converted with ECB annual average rate)"
    return df


def build_exports_to_russia():
    rows = []
    for iso2, info in config.COUNTRIES.items():
        for year in config.YEARS:
            path = config.RAW / "comtrade" / f"{iso2}_exports_to_RU_{year}.json"
            for r in json.loads(path.read_text())["data"]:
                # Keep only total rows: all transport modes, all customs
                # procedures, no second partner. Other rows are breakdowns
                # of the same trade and would count it two times.
                if (r["motCode"], r["customsCode"], r["partner2Code"]) != (0, "C00", 0):
                    continue
                rows.append(
                    {
                        "hs6": r["cmdCode"],
                        "year": int(r["refYear"]),
                        "usd": float(r["primaryValue"]),
                        "country": info["name"],
                    }
                )
    df = pd.DataFrame(rows)
    df["flow"] = RU_FLOW
    df["source"] = "UN Comtrade, reported by country (USD)"
    return df


def availability():
    """One row per flow, country and year: is there data, and from which release."""
    rows = []
    for iso2, info in config.COUNTRIES.items():
        d = json.loads((config.RAW / "comext" / f"eu27_exports_to_{iso2}.json").read_text())
        years = load_comext(iso2).groupby("year").size()
        for year in config.YEARS:
            rows.append({
                "flow": EU_FLOW, "country": info["name"], "year": year,
                "source": "Comext DS-045409",
                "available": bool(years.get(year, 0) > 0),
                "codes_reported": int(years.get(year, 0)),
                "hs_edition": "CN " + str(year),
                "released": d.get("updated", "")[:10],
            })
        for year in config.YEARS:
            rel = json.loads((config.RAW / "comtrade" / f"{iso2}_release_{year}.json").read_text())
            rel = rel.get("data") or []
            data = json.loads((config.RAW / "comtrade" / f"{iso2}_exports_to_RU_{year}.json").read_text())["data"]
            rows.append({
                "flow": RU_FLOW, "country": info["name"], "year": year,
                "source": "UN Comtrade",
                "available": bool(rel),
                "codes_reported": len({r["cmdCode"] for r in data}),
                "hs_edition": {"H5": "HS 2017", "H6": "HS 2022"}.get(rel[0]["classificationCode"], rel[0]["classificationCode"]) if rel else "",
                "released": rel[0]["lastReleased"][:10] if rel else "",
            })
    return pd.DataFrame(rows)


def source_dates():
    """When each source was last updated and when we downloaded it."""
    out = {"comext": {}, "comtrade": {}}
    for iso2, info in config.COUNTRIES.items():
        d = json.loads((config.RAW / "comext" / f"eu27_exports_to_{iso2}.json").read_text())
        out["comext"][info["name"]] = {"updated": d.get("updated", "")[:10], "downloaded": d.get("_downloaded", "")[:10]}
        rel = {}
        downloaded = ""
        for year in config.YEARS:
            r = json.loads((config.RAW / "comtrade" / f"{iso2}_release_{year}.json").read_text()).get("data") or []
            rel[str(year)] = r[0]["lastReleased"][:10] if r else None
            body = json.loads((config.RAW / "comtrade" / f"{iso2}_exports_to_RU_{year}.json").read_text())
            downloaded = max(downloaded, body.get("_downloaded", "")[:10])
        out["comtrade"][info["name"]] = {"released": rel, "downloaded": downloaded}
    return out


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

    avail = availability()
    totals = (
        by_code[by_code["in_basket"]]
        .groupby(["flow", "country", "year"], as_index=False)["usd"]
        .sum()
    )
    # Every flow, country and year is in the table. When the source has data
    # for that year, a code with no row is real zero trade. When the source has
    # no data for that year, the value is missing (NaN), not zero.
    grid = avail[["flow", "country", "year", "available"]]
    totals = grid.merge(totals, how="left")
    totals.loc[totals["available"] & totals["usd"].isna(), "usd"] = 0.0
    totals.loc[~totals["available"], "usd"] = float("nan")
    totals = totals.drop(columns="available")
    totals["usd_million"] = (totals["usd"] / 1e6).round(2)

    # Also give EUR values. Comtrade reports USD; Comext values were EUR and
    # were converted to USD, so this converts them back with the same rate.
    fx = load_fx()
    for t in (by_code, totals):
        t["eur"] = t["usd"] / t["year"].map(fx)

    config.PROCESSED.mkdir(parents=True, exist_ok=True)
    by_code.to_csv(config.PROCESSED / "trade_by_code.csv", index=False)
    totals.to_csv(config.PROCESSED / "trade_totals.csv", index=False)
    avail.to_csv(config.PROCESSED / "availability.csv", index=False)
    (config.PROCESSED / "sources.json").write_text(json.dumps(source_dates(), indent=2) + "\n")
    return by_code, totals


if __name__ == "__main__":
    _, totals = build()
    print(totals.pivot_table(index="year", columns=["country", "flow"], values="usd_million"))
