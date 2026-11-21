"""Sanctions designations of organisations in Kazakhstan, Kyrgyzstan and Uzbekistan, by month.

Source: OpenSanctions (https://www.opensanctions.org), bulk files of four lists, licence
CC BY-NC 4.0 (non-commercial use, with attribution):
- us_ofac_sdn        US Treasury OFAC Specially Designated Nationals
- us_trade_csl       US Consolidated Screening List (includes the BIS Entity List)
- eu_fsf             EU Financial Sanctions Files
- gb_fcdo_sanctions  UK sanctions list

The files are FollowTheMoney entities, one JSON object a line. A "Sanction" entity links a listed
entity to its programme and dates (listing date, or start date). This module keeps organisations
only (companies, banks, other legal entities) whose country is KZ, KG or UZ; it keeps no data on
people. A designation date is the earliest listing or start date of the entity on that list. The
OFAC file gives no such date; there, the date is the day OpenSanctions first saw the entity (it
reads the lists every day, so from 2022 this is within a day or two of the designation). The column
"date_source" says which. The timeline starts on 24 February 2022.

Output: data/processed/designations.csv (list, entity id, name, country, schema, month, programme).
"""

import json
from datetime import date

import pandas as pd
import requests

from . import config

RAW = config.RAW / "opensanctions"
LISTS = {
    "us_ofac_sdn": "US OFAC",
    "us_trade_csl": "US trade list (incl. BIS)",
    "eu_fsf": "EU",
    "gb_fcdo_sanctions": "UK",
}
URL = "https://data.opensanctions.org/datasets/latest/{ds}/entities.ftm.json"
COUNTRIES = {"kz": "KZ", "kg": "KG", "uz": "UZ"}
ORG_SCHEMAS = {"Company", "Organization", "LegalEntity", "PublicBody"}
START = "2022-02-24"


def fetch(refresh=False):
    RAW.mkdir(parents=True, exist_ok=True)
    for ds in LISTS:
        out = RAW / f"{ds}.ftm.json"
        if out.exists() and not refresh:
            continue
        print(f"OpenSanctions: {ds}")
        with requests.get(URL.format(ds=ds), stream=True, timeout=300, headers={"User-Agent": "research-script"}) as r:
            r.raise_for_status()
            with open(out, "wb") as f:
                for chunk in r.iter_content(1 << 20):
                    f.write(chunk)


def _scan(ds):
    """Organisations in KZ/KG/UZ, and the sanction dates of every listed entity."""
    orgs, dates = {}, {}
    with open(RAW / f"{ds}.ftm.json") as f:
        for line in f:
            e = json.loads(line)
            sch, pr = e.get("schema"), e.get("properties", {})
            if sch in ORG_SCHEMAS:
                cs = {c for k in ("country", "jurisdiction", "mainCountry") for c in pr.get(k, [])}
                hit = sorted(COUNTRIES[c] for c in cs if c in COUNTRIES)
                if hit:
                    orgs[e["id"]] = {"name": (pr.get("name") or [""])[0], "country": hit[0], "schema": sch,
                                     "first_seen": (e.get("first_seen") or "")[:10]}
            elif sch == "Sanction":
                ds_dates = sorted(d[:10] for k in ("listingDate", "startDate") for d in pr.get(k, []) if len(d) >= 7)
                prog = (pr.get("program") or pr.get("programId") or [""])[0]
                for ent in pr.get("entity", []):
                    if ds_dates:
                        prev = dates.get(ent)
                        if not prev or ds_dates[0] < prev[0]:
                            dates[ent] = (ds_dates[0], prog)
    return orgs, dates


def build():
    rows = []
    for ds, label in LISTS.items():
        orgs, dates = _scan(ds)
        for eid, o in orgs.items():
            d, prog = dates.get(eid, (None, ""))
            src = "list"
            if not d and o["first_seen"]:
                d, src = o["first_seen"], "first seen by OpenSanctions"
            rows.append({"list": label, "dataset": ds, "id": eid, "name": o["name"], "country": o["country"],
                         "schema": o["schema"], "date": d, "month": d[:7] if d else None, "date_source": src,
                         "programme": prog})
    df = pd.DataFrame(rows)
    df = df[df["date"].notna() & (df["date"] >= START)].sort_values(["date", "list", "name"])
    config.PROCESSED.mkdir(parents=True, exist_ok=True)
    df.to_csv(config.PROCESSED / "designations.csv", index=False)
    meta = {"source": "OpenSanctions, CC BY-NC 4.0", "lists": LISTS, "built": date.today().isoformat(),
            "start": START, "first_seen_dates": int((df["date_source"] != "list").sum())}
    (config.PROCESSED / "designations_meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    return df, meta


if __name__ == "__main__":
    fetch()
    df, meta = build()
    print(df.groupby(["list", "country"]).size().unstack(fill_value=0))
    print("dates from first seen:", meta["first_seen_dates"])
    y = df.dropna(subset=["date"]).assign(year=lambda d: d["date"].str[:4])
    print(y.groupby(["year", "country"]).size().unstack(fill_value=0).tail(8))
