"""EU exports of the listed goods to the route countries, by member state (Eurostat Comext).

One Comext query a route country (27 reporters x listed codes x years). No Comtrade calls.
The 27 member states add up to the EU-27 totals used everywhere else on the site.

The importers' own records by member state are NOT compared here: importers record goods by
country of origin, the EU by the member state that ships them, so a gap by member state shows
where goods were made, not whether they went missing.
"""

import json
from collections import defaultdict
from datetime import datetime, timezone

import pandas as pd

from . import config
from .fetch import COMEXT_URL, _get, keep_comext, query_codes

MEMBERS = {
    "AT": "Austria", "BE": "Belgium", "BG": "Bulgaria", "CY": "Cyprus", "CZ": "Czechia", "DE": "Germany",
    "DK": "Denmark", "EE": "Estonia", "ES": "Spain", "FI": "Finland", "FR": "France", "GR": "Greece",
    "HR": "Croatia", "HU": "Hungary", "IE": "Ireland", "IT": "Italy", "LT": "Lithuania", "LU": "Luxembourg",
    "LV": "Latvia", "MT": "Malta", "NL": "Netherlands", "PL": "Poland", "PT": "Portugal", "RO": "Romania",
    "SE": "Sweden", "SI": "Slovenia", "SK": "Slovakia",
}
# Member states with a land border with Russia or Belarus.
BORDER = {"EE", "FI", "LT", "LV", "PL"}


def _raw(partner):
    return config.RAW / "comext" / f"members_exports_to_{partner}.json"


def fetch(partner, refresh=False):
    out = _raw(partner)
    if keep_comext(out, refresh):
        return out
    out.parent.mkdir(parents=True, exist_ok=True)
    params = [("format", "JSON"), ("partner", partner), ("flow", "2"), ("indicators", "VALUE_IN_EUROS"), ("freq", "A")]
    params += [("reporter", r) for r in MEMBERS]
    params += [("product", c) for c in query_codes()]
    params += [("time", str(y)) for y in config.YEARS]
    body = _get(COMEXT_URL, params).json()
    body["_downloaded"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    out.write_text(json.dumps(body))
    return out


def fetch_all(refresh=False):
    for iso2 in config.COUNTRIES:
        print(f"Comext: member states -> {iso2}")
        fetch(iso2, refresh)


def _cells(body):
    """Yield one dict a cell of a Comext JSON-stat response."""
    ids, size, dim = body["id"], body["size"], body["dimension"]
    cats = [{v: k for k, v in dim[i]["category"]["index"].items()} for i in ids]
    for k, v in body["value"].items():
        k, idx = int(k), []
        for s in reversed(size):
            idx.append(k % s)
            k //= s
        idx.reverse()
        yield {ids[i]: cats[i][idx[i]] for i in range(len(ids))}, v


def build():
    fx = pd.read_csv(config.RAW / "ecb_usd_per_eur.csv")
    usd_per_eur = dict(zip(fx["year"].astype(int), fx["usd_per_eur"]))
    old_to_new = {old: new for new, old in config.HS2017_EQUIVALENT.items()}
    excluded = set(config.EXCLUDED_FROM_BASKET) | {config.HS2017_EQUIVALENT[c] for c in config.EXCLUDED_FROM_BASKET
                                                    if c in config.HS2017_EQUIVALENT}
    acc = defaultdict(float)
    for iso2 in config.COUNTRIES:
        body = json.loads(_raw(iso2).read_text())
        for d, eur in _cells(body):
            if d["product"] in excluded:
                continue
            hs6 = old_to_new.get(d["product"], d["product"])
            if hs6 in excluded:
                continue
            y = int(d["time"])
            acc[(iso2, d["reporter"], y, hs6)] += eur * usd_per_eur[y]
    rows = [{"dest": k[0], "member": k[1], "year": k[2], "hs6": k[3], "usd": round(v, 2)} for k, v in acc.items() if v]
    out = pd.DataFrame(rows).sort_values(["dest", "member", "year", "hs6"])
    path = config.PROCESSED / "eu_members.csv"
    out.to_csv(path, index=False)
    build_imports(excluded, old_to_new)
    return path


# UN M49 codes of the member states, as the importers report them in Comtrade.
M49 = {40: "AT", 56: "BE", 100: "BG", 191: "HR", 196: "CY", 203: "CZ", 208: "DK", 233: "EE", 246: "FI", 251: "FR",
       276: "DE", 300: "GR", 348: "HU", 372: "IE", 380: "IT", 428: "LV", 440: "LT", 442: "LU", 470: "MT", 528: "NL",
       616: "PL", 620: "PT", 642: "RO", 703: "SK", 705: "SI", 724: "ES", 752: "SE"}


def build_imports(excluded, old_to_new):
    """The route countries' own records of imports from each member state (Comtrade store, no calls).
    Years without partner detail (Kazakhstan 2020-2022) are left out, not set to zero."""
    import sqlite3
    listed = set(pd.read_csv(config.CHPL_CSV, dtype={"hs6": str}).hs6) - set(excluded)
    rep = {398: "KZ", 417: "KG", 860: "UZ"}
    acc, have = defaultdict(float), set()
    db = sqlite3.connect(config.RAW / "comtrade.sqlite")
    q = "select reporter, partner, period, cmd, value from obs where freq='A' and flow='M' and reporter in (398, 417, 860)"
    for r, p, per, cmd, val in db.execute(q):
        if p not in M49 or cmd in excluded:
            continue
        hs6 = old_to_new.get(cmd, cmd)
        if hs6 not in listed:
            continue
        acc[(rep[r], M49[p], int(per))] += val or 0.0
        have.add((rep[r], int(per)))
    rows = [{"dest": d, "member": m, "year": y, "usd": round(acc.get((d, m, y), 0.0), 2)}
            for (d, y) in sorted(have) for m in MEMBERS]
    path = config.PROCESSED / "eu_members_imports.csv"
    pd.DataFrame(rows).to_csv(path, index=False)
    return path


if __name__ == "__main__":
    fetch_all()
    print(build())
