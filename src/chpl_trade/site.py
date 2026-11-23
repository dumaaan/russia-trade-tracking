"""Write the website data (GitHub Pages serves docs/).

docs/data.js sets window.CHPL_DATA, so the page also works when you open
docs/index.html directly from disk (no fetch, no server).
docs/data/*.csv are the download files linked from the page.
"""

import json
import math
import shutil
from datetime import date

import pandas as pd

from . import config

DOCS = config.ROOT / "docs"
FLOWS = {"EU-27 exports to country": "eu", "Country exports to Russia": "ru", "Country imports from EU-27": "mi"}

# Dated events for the chart notes. Keep each one short and give a source.
EVENTS = [
    {"date": "2022-02-24", "short": "Invasion", "label": "Russia invades Ukraine; EU export bans widen",
     "url": "https://finance.ec.europa.eu/eu-and-world/sanctions-restrictive-measures/sanctions-adopted-following-russias-military-aggression-against-ukraine_en"},
    {"date": "2023-05-19", "short": "9 codes listed", "label": "FinCEN–BIS alert: first 9 high-priority HS codes",
     "url": "https://www.fincen.gov/news/news-releases/supplemental-alert-fincen-and-us-department-commerces-bureau-industry-and"},
    {"date": "2023-09-19", "short": "45 codes", "label": "Common list grows to 45 HS codes in 4 tiers",
     "url": "https://www.thompsonhinesmartrade.com/2023/09/u-s-uk-and-eu-announce-updated-list-of-controlled-high-priority-items-restricted-for-export-to-russia/"},
    {"date": "2024-02-23", "short": "50 codes", "label": "List grows to 50 codes (CNC tools, Tier 4.B)",
     "url": "https://www.bis.gov/licensing/country-guidance/common-high-priority-items-list-chpl"},
    {"date": "2025-01-15", "short": "Keremet Bank", "label": "US sanctions Keremet Bank (Kyrgyzstan)", "country": "Kyrgyzstan",
     "url": "https://www.akchabar.kg/en/article/banki-qfocdypwkrljimms/posledstviya-sankczij-keremet-bank-poteryal-svyshe-40-klientskikh-sredstv"},
    {"date": "2026-04-23", "short": "EU ban", "label": "EU bans exports of 8457.10 and 8517.62 to Kyrgyzstan (first use of Art. 12f)", "country": "Kyrgyzstan",
     "url": "https://www.nortonrosefulbright.com/en/knowledge/publications/ac68233a/beyond-the-no-russia-clause-kyrgyzstan-becomes-the-first-test"},
]

# The two codes in the first EU Art. 12f export ban (Kyrgyzstan, April 2026).
ART12F_CODES = ["845710", "851762"]


def _num(v, nd=4):
    return None if v is None or (isinstance(v, float) and math.isnan(v)) else round(float(v), nd)


def ban_data():
    """Monthly series and summary for the April 2026 ban, if the ban module has run."""
    mpath, spath = config.PROCESSED / "ban_monthly.csv", config.PROCESSED / "ban_summary.json"
    if not (mpath.exists() and spath.exists()):
        return None
    m = pd.read_csv(mpath)
    summary = json.loads(spath.read_text())
    return {
        "before": summary["before"], "transition": summary["transition"],
        "monthly": [[r.flow, r.country, r.group, r.month, _num(r.usd, 0)] for r in m.itertuples()],
        "summary": summary,
    }


def control_data():
    """Listed and similar goods by destination, if the control module has run."""
    cpath, mpath = config.PROCESSED / "control.csv", config.PROCESSED / "control_meta.json"
    if not (cpath.exists() and mpath.exists()):
        return None
    c = pd.read_csv(cpath, dtype={"code": str})
    return {
        "rows": [[r.flow, r.dest, int(r.year), r.kind, r.code, _num(r.usd / 1e6)] for r in c.itertuples()],
        "meta": json.loads(mpath.read_text()),
    }


def excess_data():
    """Listed goods against the other goods of the same chapters and headings, if the excess module has run."""
    path, mpath = config.PROCESSED / "excess.csv", config.PROCESSED / "excess_meta.json"
    if not (path.exists() and mpath.exists()):
        return None
    d = pd.read_csv(path)
    return {
        "rows": [[r.flow, r.dest, int(r.year), r.series, _num(r.usd / 1e6)] for r in d.itertuples()],
        "meta": json.loads(mpath.read_text()),
    }


def mirror_cn_data():
    """China leg of the mirror check, if the mirror_cn module has run."""
    path, mpath = config.PROCESSED / "mirror_cn.csv", config.PROCESSED / "mirror_cn_meta.json"
    if not (path.exists() and mpath.exists()):
        return None
    d = pd.read_csv(path)
    return {
        "rows": [[r.country, int(r.year), r.side, _num(r.listed / 1e6), _num(r.total / 1e6)] for r in d.itertuples()],
        "meta": json.loads(mpath.read_text()),
    }


def unit_value_data():
    """US dollars per kg on each leg, by code, if the unitvalue module has run."""
    path = config.PROCESSED / "unit_values.csv"
    if not path.exists():
        return None
    d = pd.read_csv(path, dtype={"hs6": str})
    bpath = config.PROCESSED / "ban_unit_values.json"
    return {"rows": [[r.leg, r.country, int(r.year), r.hs6, _num(r.usd), _num(r.kg), bool(r.estimated)] for r in d.itertuples()],
            "ban": json.loads(bpath.read_text()) if bpath.exists() else None}


def designations_data():
    """Designated organisations (KZ, KG, UZ) and monthly listed exports to Russia, if built."""
    path, mpath = config.PROCESSED / "designations.csv", config.PROCESSED / "designations_meta.json"
    fpath = config.PROCESSED / "events_monthly.csv"
    if not (path.exists() and mpath.exists() and fpath.exists()):
        return None
    d = pd.read_csv(path)
    f = pd.read_csv(fpath)
    f = f[(f["leg"] == "ru") & (f["group"] == "listed") & (f["month"] >= "2021-01")]
    return {
        "rows": [[r.list, r.country, r.date, r.name, r.date_source != "list",
                  r.also_listed_with if isinstance(r.also_listed_with, str) else ""] for r in d.itertuples()],
        "flows": {c: [[m, _num(v)] for m, v in zip(g["month"], g["usd"])] for c, g in f.groupby("country")},
        "meta": json.loads(mpath.read_text()),
    }


def estimate_data():
    """The range of listed goods that probably reached Russia, if the estimate module has run."""
    path, mpath = config.PROCESSED / "estimate.csv", config.PROCESSED / "estimate_meta.json"
    if not (path.exists() and mpath.exists()):
        return None
    d = pd.read_csv(path)
    cols = ["country", "year", "recorded", "eu_gap", "china_gap", "low", "high", "eu_priced_share"]
    return {"rows": [[None if (isinstance(v, float) and v != v) else v for v in r] for r in d[cols].itertuples(index=False)],
            "cols": cols, "meta": json.loads(mpath.read_text())}


def china_imports_by_code():
    """Each route country's imports of the listed codes from China, as it records them (for the explorer).
    Years with no product detail (Kazakhstan 2020-2022) are left out."""
    from . import comtrade as ct
    from .fetch import chpl_codes
    o2n = {o: n for n, o in config.HS2017_EQUIVALENT.items()}
    keep = set(chpl_codes())
    rows = []
    for iso, m49 in (("KZ", 398), ("KG", 417), ("UZ", 860)):
        for y in config.YEARS:
            recs = ct.records("A", "M", m49, 156, y)
            if not any(r["cmdCode"] != "TOTAL" for r in recs):
                continue
            acc = {}
            for r in recs:
                k = o2n.get(r["cmdCode"], r["cmdCode"])
                if k in keep:
                    acc[k] = acc.get(k, 0.0) + r["primaryValue"]
            rows += [[iso, y, k, _num(v / 1e6)] for k, v in acc.items()]
    return rows


def responses_data():
    """Dated statements and measures of the route countries' governments (curated: data/responses.csv)."""
    path = config.DATA / "responses.csv"
    if not path.exists():
        return None
    d = pd.read_csv(path)
    return [[r.country, r.date, r.kind, r.actor, r.summary, r.source, r.source_type, r.checked] for r in d.itertuples()]


def weapons_data():
    """Part types of the listed codes found in Russian weapons (curated from IISS/CAR, data/weapons.csv)."""
    path = config.DATA / "weapons.csv"
    if not path.exists():
        return None
    d = pd.read_csv(path, dtype={"hs6": str, "page": str})
    return [[r.hs6, r.part, r.weapons, r.page, r.note if isinstance(r.note, str) else ""] for r in d.itertuples()]


def hs10_data():
    """Kazakhstan's exports of the listed codes by 10-digit line, a year (statistics bureau), for the explorer."""
    path = config.PROCESSED / "bns_kz_hs10.csv"
    if not path.exists():
        return None
    d = pd.read_csv(path, dtype={"hs10": str, "hs6": str})
    d["year"] = d["month"].str[:4].astype(int)
    last = d["month"].max()
    g = d.groupby(["partner", "year", "hs6", "hs10", "name", "unit"], dropna=False, as_index=False)[["usd", "tonnes", "units"]].sum(min_count=1)
    en_path = config.DATA / "hs10_en.csv"  # our English names for the lines (curated)
    en = dict(pd.read_csv(en_path, dtype={"hs10": str}).values) if en_path.exists() else {}
    return {"last": last, "en": {k: en[k] for k in d["hs10"].unique() if k in en},
            "rows": [[r.partner, int(r.year), r.hs6, r.hs10, r.name, r.unit if isinstance(r.unit, str) else "",
                      _num(r.usd), _num(r.tonnes), _num(r.units)] for r in g.itertuples()]}


def members_data():
    """EU exports of the listed goods by member state and route country, a year (totals, $M)."""
    path = config.PROCESSED / "eu_members.csv"
    if not path.exists():
        return None
    from .members import BORDER, MEMBERS
    d = pd.read_csv(path, dtype={"hs6": str})
    g = d.groupby(["dest", "member", "year"], as_index=False).usd.sum()
    # the three largest codes of each member state, route country and year (for the tooltips)
    top = (d.sort_values("usd", ascending=False).groupby(["dest", "member", "year"]).head(3)
           .sort_values(["dest", "member", "year", "usd"], ascending=[True, True, True, False]))
    ipath = config.PROCESSED / "eu_members_imports.csv"
    imp = pd.read_csv(ipath) if ipath.exists() else pd.DataFrame(columns=["dest", "member", "year", "usd"])
    return {"names": MEMBERS, "border": sorted(BORDER),
            "rows": [[r.dest, r.member, int(r.year), _num(r.usd / 1e6)] for r in g.itertuples()],
            "top": [[r.dest, r.member, int(r.year), r.hs6, _num(r.usd / 1e6)] for r in top.itertuples()],
            "imports": [[r.dest, r.member, int(r.year), _num(r.usd / 1e6)] for r in imp.itertuples()]}


def cases_data():
    """EU enforcement cases that name a route country (curated: data/cases.csv)."""
    path = config.DATA / "cases.csv"
    if not path.exists():
        return None
    d = pd.read_csv(path).fillna("")
    cols = ["case", "date", "date_kind", "country", "stage", "authority", "route", "also_named", "goods", "value",
            "outcome", "source", "source_type", "primary"]
    return [[getattr(r, c) for c in cols] for r in d.itertuples()]


def designation_effect_data():
    path = config.PROCESSED / "designation_effect.json"
    return json.loads(path.read_text()) if path.exists() else None


def events_data():
    """Event windows (three questions), if the events module has run."""
    path = config.PROCESSED / "events.json"
    return json.loads(path.read_text()) if path.exists() else None


def suppliers_data():
    """EU and China exports of the listed codes by destination, if the china module has run."""
    path, mpath = config.PROCESSED / "suppliers.csv", config.PROCESSED / "suppliers_meta.json"
    if not (path.exists() and mpath.exists()):
        return None
    d = pd.read_csv(path, dtype={"code": str})
    return {
        "rows": [[r.supplier, r.dest, int(r.year), r.code, _num(r.usd / 1e6)] for r in d.itertuples()],
        "meta": json.loads(mpath.read_text()),
    }


def export():
    by_code = pd.read_csv(config.PROCESSED / "trade_by_code.csv", dtype={"hs6": str, "tier": str})
    avail = pd.read_csv(config.PROCESSED / "availability.csv")
    fx = pd.read_csv(config.RAW / "ecb_usd_per_eur.csv")
    chpl = pd.read_csv(config.CHPL_CSV, dtype={"hs6": str, "tier": str})
    sources = json.loads((config.PROCESSED / "sources.json").read_text())

    codes = [
        [FLOWS[r.flow], r.country, int(r.year), r.hs6, _num(r.usd / 1e6)]
        for r in by_code.itertuples()
    ]
    availability = [
        {"flow": FLOWS[r.flow], "country": r.country, "year": int(r.year), "available": bool(r.available),
         "codes": int(r.codes_reported), "hs": r.hs_edition if isinstance(r.hs_edition, str) else "",
         "released": r.released if isinstance(r.released, str) else ""}
        for r in avail.itertuples()
    ]

    data = {
        "years": config.YEARS,
        "baselineYears": config.BASELINE_YEARS,
        "countries": [c["name"] for c in config.COUNTRIES.values()],
        "codes": codes,
        "availability": availability,
        "fx": dict(zip(fx["year"].astype(int).astype(str), fx["usd_per_eur"].round(6))),
        "chpl": chpl.to_dict(orient="records"),
        "chplVersion": "February 2024 (50 HS codes)",
        "excluded": sorted(config.EXCLUDED_FROM_BASKET),
        "art12f": ART12F_CODES,
        "events": EVENTS,
        "sources": sources,
        "built": date.today().isoformat(),
        "ban": ban_data(),
        "control": control_data(),
        "suppliers": suppliers_data(),
        "excess": excess_data(),
        "eventStudy": events_data(),
        "mirrorCn": mirror_cn_data(),
        "unitValues": unit_value_data(),
        "designations": designations_data(),
        "estimate": estimate_data(),
        "cnImports": china_imports_by_code(),
        "responses": responses_data(),
        "weapons": weapons_data(),
        "hs10": hs10_data(),
        "designationEffect": designation_effect_data(),
        "members": members_data(),
        "cases": cases_data(),
    }
    DOCS.mkdir(exist_ok=True)
    out = DOCS / "data.js"
    out.write_text("window.CHPL_DATA = " + json.dumps(data, separators=(",", ":")) + ";\n")

    # Download files.
    dl = DOCS / "data"
    dl.mkdir(exist_ok=True)
    for name in ["trade_totals.csv", "trade_by_code.csv", "comparison.csv", "availability.csv", "ban_monthly.csv", "control.csv", "suppliers.csv", "excess.csv", "events_monthly.csv", "bns_kz_monthly.csv", "mirror_cn.csv", "unit_values.csv", "unit_value_index.csv", "designations.csv", "estimate.csv", "bns_kz_hs10.csv", "eu_members.csv", "eu_members_imports.csv"]:
        if (config.PROCESSED / name).exists():
            shutil.copy(config.PROCESSED / name, dl / name)
    shutil.copy(config.CHPL_CSV, dl / "chpl_hs_codes.csv")
    if (config.DATA / "responses.csv").exists():
        shutil.copy(config.DATA / "responses.csv", dl / "government_responses.csv")
    if (config.DATA / "cases.csv").exists():
        shutil.copy(config.DATA / "cases.csv", dl / "eu_enforcement_cases.csv")
    if (config.DATA / "weapons.csv").exists():
        shutil.copy(config.DATA / "weapons.csv", dl / "weapon_parts_by_code.csv")
    return out


if __name__ == "__main__":
    print(export())
