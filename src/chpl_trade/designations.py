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
people. Only listings under Russia-related programmes count, and only organisations whose listed
countries are at least half route countries (a Russian bank with a branch in Kazakhstan is left
out); other countries are kept in "also_listed_with". A designation date is the earliest listing or start date of the entity on that list. The
OFAC file gives no such date; there, the date is the day OpenSanctions first saw the entity (it
reads the lists every day, so from 2022 this is within a day or two of the designation). The column
"date_source" says which. The timeline starts on 24 February 2022.

Output: data/processed/designations.csv (list, entity id, name, country, schema, month, programme).
"""

import json
import re
from datetime import date

import pandas as pd
import requests

from . import config
from .fetch import keep_recent

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
        if keep_recent(out, refresh, days=30):  # 116 MB: once a month is enough
            continue
        print(f"OpenSanctions: {ds}")
        with requests.get(URL.format(ds=ds), stream=True, timeout=300, headers={"User-Agent": "research-script"}) as r:
            r.raise_for_status()
            with open(out, "wb") as f:
                for chunk in r.iter_content(1 << 20):
                    f.write(chunk)


# Russia-related programmes. BIS Entity List additions of Kazakh, Kyrgyz and Uzbek firms after 24 February
# 2022 came in BIS rules against diversion to Russia, but many cite only the general rule (§744.11), so
# the Entity List (US-BIS-EL) counts too. Not counted: terrorism, Global Magnitsky, Iran, North Korea,
# organised crime, and the BIS Unverified and Denied Persons lists (not sanctions designations).
RUSSIA_RELATED = re.compile(r"russia|ukrain|\bukr\b|\brus\b|14024|13662|14071|746\.8|744\.21|belarus|US-BIS-EL", re.I)
SANCTION_TEXT = ("program", "programId", "reason", "provisions", "summary", "authority")


def _scan(ds):
    """Organisations with a link to KZ/KG/UZ, and for every listed entity its earliest listing date and
    the text of its listings (programme, reason), to tell Russia-related listings from others."""
    orgs, dates, text = {}, {}, {}
    with open(RAW / f"{ds}.ftm.json") as f:
        for line in f:
            e = json.loads(line)
            sch, pr = e.get("schema"), e.get("properties", {})
            if sch in ORG_SCHEMAS:
                cs = sorted({c for k in ("country", "jurisdiction", "mainCountry") for c in pr.get(k, [])})
                route = [COUNTRIES[c] for c in cs if c in COUNTRIES]
                if route:
                    orgs[e["id"]] = {"name": (pr.get("name") or [""])[0], "country": route[0], "schema": sch,
                                     "first_seen": (e.get("first_seen") or "")[:10],
                                     "route_share": len(route) / len(cs), "other": [c.upper() for c in cs if c not in COUNTRIES]}
            elif sch == "Sanction":
                ds_dates = sorted(d[:10] for k in ("listingDate", "startDate") for d in pr.get(k, []) if len(d) >= 7)
                prog = (pr.get("program") or pr.get("programId") or [""])[0]
                words = " ".join(v for k in SANCTION_TEXT for v in pr.get(k, []))
                for ent in pr.get("entity", []):
                    text[ent] = text.get(ent, "") + " " + words
                    prev = dates.get(ent)
                    if ds_dates and (not prev or not prev[0] or ds_dates[0] < prev[0]):
                        dates[ent] = (ds_dates[0], prog)
                    elif not prev:
                        dates[ent] = (None, prog)
    return orgs, dates, text


def build():
    rows, dropped = [], {"not Russia-related": 0, "mostly other countries": 0}
    for ds, label in LISTS.items():
        orgs, dates, text = _scan(ds)
        for eid, o in orgs.items():
            d, prog = dates.get(eid, (None, ""))
            src = "list"
            if not d and o["first_seen"]:
                d, src = o["first_seen"], "first seen by OpenSanctions"
            if not d or d < START:
                continue
            # Only listings under Russia-related programmes (not, for example, terrorism listings).
            if not RUSSIA_RELATED.search(text.get(eid, "") + " " + prog):
                dropped["not Russia-related"] += 1
                continue
            # Only organisations whose listed countries are mostly route countries: a Russian bank with a
            # branch in Kazakhstan is not a Kazakh organisation.
            if o["route_share"] < 0.5:
                dropped["mostly other countries"] += 1
                continue
            rows.append({"list": label, "dataset": ds, "id": eid, "name": o["name"], "country": o["country"],
                         "schema": o["schema"], "date": d, "month": d[:7], "date_source": src,
                         "programme": prog, "also_listed_with": " ".join(o["other"])})
    df = pd.DataFrame(rows).sort_values(["date", "list", "name"])
    config.PROCESSED.mkdir(parents=True, exist_ok=True)
    df.to_csv(config.PROCESSED / "designations.csv", index=False)
    meta = {"source": "OpenSanctions, CC BY-NC 4.0", "lists": LISTS, "built": date.today().isoformat(),
            "start": START, "first_seen_dates": int((df["date_source"] != "list").sum()), "left_out": dropped}
    (config.PROCESSED / "designations_meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    return df, meta


if __name__ == "__main__":
    fetch()
    df, meta = build()
    print(df.groupby(["list", "country"]).size().unstack(fill_value=0))
    print("dates from first seen:", meta["first_seen_dates"], "| left out:", meta["left_out"])
    y = df.dropna(subset=["date"]).assign(year=lambda d: d["date"].str[:4])
    print(y.groupby(["year", "country"]).size().unstack(fill_value=0).tail(8))
