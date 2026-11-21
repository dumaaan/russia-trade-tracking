"""Excess growth: did the listed goods grow faster than similar goods that are not on the list?

For each flow (EU-27 exports to the country; the country's exports to Russia), each country and
each year, four series:
- listed      the 49 listed codes (the basket);
- listed_nb   the same without bearings (HS 8482), which are most of Kazakhstan's pre-war base;
- other_ch    the other goods of chapters 84, 85 and 90: chapter total minus the listed codes in
              them. Chapter 88 (aircraft) is left out of this control: single aircraft sales of
              $100-500M (EU to Uzbekistan, Azerbaijan, Kazakhstan) would move it from year to year;
- other_hs4   the other goods of the same HS4 headings: heading total minus listed (a tighter
              control, but trade can move between codes of one heading).
The codes left out of the basket (8541.4x) are left out of the controls too.

Excess growth = (listed / listed pre-war) / (other / other pre-war). It is a difference-in-
differences in ratio form: x1 means the listed goods grew as fast as the other goods. A ratio of
two series in the same currency does not depend on prices or exchange rates.

Output: data/processed/excess.csv, data/processed/excess_meta.json.
"""

import json

import pandas as pd

from . import comtrade as ct
from . import config
from .build import load_fx
from .control import DESTINATIONS, LEFT_OUT, OLD_HEADING, RAW, _comext_frame, _stamp, headings
from .fetch import COMEXT_URL, _get, chpl_codes

CHAPTERS = ["84", "85", "88", "90"]  # downloaded
CONTROL_CHAPTERS = ["84", "85", "90"]  # used for the chapter control
COUNTRIES = {k: v for k, v in DESTINATIONS.items() if v[1] is not None}  # KG UZ KZ GE AZ MN
EAEU = {"KZ", "KG"}


def fetch_comext_chapters(partner, refresh=False):
    out = RAW / f"comext_eu27_to_{partner}_CHAPTERS.json"
    if out.exists() and not refresh:
        return out
    out.parent.mkdir(parents=True, exist_ok=True)
    params = [("format", "JSON"), ("reporter", "EU27_2020"), ("partner", partner), ("flow", "2"),
              ("indicators", "VALUE_IN_EUROS"), ("freq", "A")]
    params += [("product", c) for c in CHAPTERS]
    params += [("time", str(y)) for y in config.YEARS]
    out.write_text(json.dumps(_stamp(_get(COMEXT_URL, params).json())))
    return out


def fetch_all(refresh=False):
    for p, (name, _, _) in COUNTRIES.items():
        print(f"Comext chapters: EU-27 -> {name}")
        fetch_comext_chapters(p, refresh)


def _series(codes):
    """codes: {code: value} for one flow, country and year -> the four series (None if no data)."""
    old_to_new = {old: new for new, old in config.HS2017_EQUIVALENT.items()}
    basket = [c for c in chpl_codes() if c not in config.EXCLUDED_FROM_BASKET]
    v = {}
    for c, x in codes.items():
        c = old_to_new.get(c, OLD_HEADING.get(c, c))
        v[c] = v.get(c, 0.0) + x
    listed = sum(v.get(c, 0.0) for c in basket)
    bearings = sum(v.get(c, 0.0) for c in basket if c.startswith("8482"))
    left = sum(v.get(c, 0.0) for c in LEFT_OUT)
    chap = sum(v.get(c, 0.0) for c in CONTROL_CHAPTERS)
    listed_in_ch = sum(v.get(c, 0.0) for c in basket if c[:2] in CONTROL_CHAPTERS)
    hs4 = sum(v.get(h, 0.0) for h in {OLD_HEADING.get(h, h) for h in headings()})
    return {
        "listed": listed, "listed_nb": listed - bearings,
        "other_ch": chap - listed_in_ch - left, "other_hs4": hs4 - listed - left,
    }


def build():
    fx = load_fx()
    rows, missing = [], []
    for p, (name, m49, group) in COUNTRIES.items():
        # EU leg: HS6 + HS4 from the share module's file, chapters from this module's file.
        df = pd.concat([_comext_frame(p), _comext_frame(p, "_CHAPTERS")], ignore_index=True)
        for y in config.YEARS:
            d = df[df["year"] == y]
            if d.empty:
                missing.append(f"eu|{p}|{y}")
                continue
            codes = dict(zip(d["code"], d["eur"] * fx[y]))
            for k, x in _series(codes).items():
                rows.append({"flow": "eu", "dest": p, "year": y, "series": k, "usd": x})
        # Russia leg: the country's exports, as it reports them. A year with no chapter rows at all
        # is a year with no report.
        for y in config.YEARS:
            recs = ct.records("A", "X", m49, config.RUSSIA_M49, y)
            codes = {r["cmdCode"]: float(r["primaryValue"]) for r in recs}
            if not any(c in codes for c in CHAPTERS + ["TOTAL"]):
                missing.append(f"ru|{p}|{y}")
                continue
            for k, x in _series(codes).items():
                rows.append({"flow": "ru", "dest": p, "year": y, "series": k, "usd": x})
    out = pd.DataFrame(rows).sort_values(["flow", "dest", "series", "year"])
    config.PROCESSED.mkdir(parents=True, exist_ok=True)
    out.to_csv(config.PROCESSED / "excess.csv", index=False)
    meta = {
        "countries": {k: {"name": v[0], "group": v[2], "eaeu": k in EAEU} for k, v in COUNTRIES.items()},
        "chapters": CONTROL_CHAPTERS, "headings": sorted({OLD_HEADING.get(h, h) for h in headings()}),
        "missing": missing,
    }
    (config.PROCESSED / "excess_meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    return out, meta


def excess(out, flow, dest, listed="listed", other="other_ch", base=(2019, 2020, 2021)):
    t = out[(out.flow == flow) & (out.dest == dest)].pivot(index="year", columns="series", values="usd")
    if t.empty:
        return pd.Series(dtype=float)
    b = t.loc[[y for y in base if y in t.index]].mean()
    return (t[listed] / b[listed]) / (t[other] / b[other])


if __name__ == "__main__":
    fetch_all()
    out, meta = build()
    print("missing:", meta["missing"])
    for flow in ("eu", "ru"):
        print(f"\nExcess growth, {flow}, listed vs other goods of chapters 84/85/90")
        print(pd.DataFrame({d: excess(out, flow, d) for d in COUNTRIES}).round(2).to_string())
