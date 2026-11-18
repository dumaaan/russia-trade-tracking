"""Download raw data from Comext (Eurostat), UN Comtrade and the ECB.

All responses are saved in data/raw/. A second run uses the saved files.
Use --refresh to download again.
"""

import argparse
import csv
import io
import json
import time
from datetime import datetime, timezone

import requests

from . import config

COMEXT_URL = (
    "https://ec.europa.eu/eurostat/api/comext/dissemination/statistics/1.0/data/DS-045409"
)
COMTRADE_URL = "https://comtradeapi.un.org/public/v1/preview/C/A/HS"
COMTRADE_DA_URL = "https://comtradeapi.un.org/public/v1/getDA/C/A/HS"
COMTRADE_PREVIEW_CAP = 500
ECB_URL = "https://data-api.ecb.europa.eu/service/data/EXR/A.USD.EUR.SP00.A"


def chpl_codes():
    with open(config.CHPL_CSV, newline="") as f:
        return [row["hs6"] for row in csv.DictReader(f)]


def query_codes():
    """CHPL codes plus their HS 2017 equivalents."""
    codes = chpl_codes()
    return codes + [old for new, old in config.HS2017_EQUIVALENT.items() if new in codes]


def _get(url, params, tries=5):
    for attempt in range(tries):
        r = requests.get(url, params=params, timeout=120)
        if r.status_code == 200:
            return r
        # Comtrade preview has a rate limit. Wait and try again.
        time.sleep(5 * (attempt + 1))
    r.raise_for_status()
    raise RuntimeError(f"Request failed: {r.status_code} {r.text[:200]}")


def fetch_comext(partner, refresh=False):
    """EU-27 exports (flow 2) to one partner, in EUR, by HS6 and year."""
    out = config.RAW / "comext" / f"eu27_exports_to_{partner}.json"
    if out.exists() and not refresh:
        return out
    out.parent.mkdir(parents=True, exist_ok=True)
    params = [
        ("format", "JSON"),
        ("reporter", "EU27_2020"),
        ("partner", partner),
        ("flow", "2"),
        ("indicators", "VALUE_IN_EUROS"),
        ("freq", "A"),
    ]
    params += [("product", c) for c in query_codes()]
    params += [("time", str(y)) for y in config.YEARS]
    body = _get(COMEXT_URL, params).json()
    body["_downloaded"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    out.write_text(json.dumps(body))
    return out


def fetch_comtrade(reporter_iso2, year, refresh=False):
    """Exports of one reporter to Russia, in USD, by HS6, for one year."""
    m49 = config.COUNTRIES[reporter_iso2]["m49"]
    out = config.RAW / "comtrade" / f"{reporter_iso2}_exports_to_RU_{year}.json"
    if out.exists() and not refresh:
        return out
    out.parent.mkdir(parents=True, exist_ok=True)
    params = {
        "reporterCode": m49,
        "partnerCode": config.RUSSIA_M49,
        "period": year,
        "flowCode": "X",
        "cmdCode": ",".join(query_codes()),
    }
    r = _get(COMTRADE_URL, params)
    body = r.json()
    if "data" not in body:
        raise RuntimeError(f"Comtrade error for {reporter_iso2} {year}: {body}")
    # The public preview returns at most 500 records and does not say when it
    # cuts the result. A full result means that rows can be missing.
    if len(body["data"]) >= COMTRADE_PREVIEW_CAP:
        raise RuntimeError(
            f"Comtrade returned {len(body['data'])} records for {reporter_iso2} {year}. "
            "This is the preview cap, so the result can be incomplete. Split the query."
        )
    body["_downloaded"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    out.write_text(json.dumps(body))
    time.sleep(2)
    return out


def fetch_comtrade_imports_from_eu(reporter_iso2, year, refresh=False):
    """Imports of one reporter from the 27 EU member states, in USD, by HS6, for one year.

    This is the mirror of the EU export data: the same trade, as the importer
    records it. The query is split into groups of codes so that no call comes
    near the 500-record preview cap (codes x 27 partners).
    """
    m49 = config.COUNTRIES[reporter_iso2]["m49"]
    out = config.RAW / "comtrade" / f"{reporter_iso2}_imports_from_EU27_{year}.json"
    if out.exists() and not refresh:
        return out
    out.parent.mkdir(parents=True, exist_ok=True)
    codes = query_codes()
    partners = ",".join(str(c) for c in config.EU27_M49.values())
    data = []
    for i in range(0, len(codes), config.IMPORT_CODES_PER_CALL):
        chunk = codes[i : i + config.IMPORT_CODES_PER_CALL]
        params = {
            "reporterCode": m49,
            "partnerCode": partners,
            "period": year,
            "flowCode": "M",
            "cmdCode": ",".join(chunk),
        }
        body = _get(COMTRADE_URL, params).json()
        if "data" not in body:
            raise RuntimeError(f"Comtrade error for {reporter_iso2} imports {year}: {body}")
        if len(body["data"]) >= COMTRADE_PREVIEW_CAP:
            raise RuntimeError(
                f"Comtrade returned {len(body['data'])} records for {reporter_iso2} imports {year}. "
                "This is the preview cap. Make IMPORT_CODES_PER_CALL smaller."
            )
        data.extend(body["data"])
        time.sleep(2)
    out.write_text(json.dumps({
        "data": data,
        "_downloaded": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }))
    return out


def fetch_comtrade_release(reporter_iso2, year, refresh=False):
    """Release information (first/last release, HS edition) for one reporter-year.

    An empty result means that the reporter has not reported that year.
    """
    m49 = config.COUNTRIES[reporter_iso2]["m49"]
    out = config.RAW / "comtrade" / f"{reporter_iso2}_release_{year}.json"
    if out.exists() and not refresh:
        return out
    out.parent.mkdir(parents=True, exist_ok=True)
    body = _get(COMTRADE_DA_URL, {"reporterCode": m49, "period": year}).json()
    out.write_text(json.dumps(body))
    time.sleep(1)
    return out


def fetch_fx(refresh=False):
    """ECB annual average USD per EUR."""
    out = config.RAW / "ecb_usd_per_eur.csv"
    if out.exists() and not refresh:
        return out
    out.parent.mkdir(parents=True, exist_ok=True)
    params = {
        "format": "csvdata",
        "startPeriod": config.YEARS[0],
        "endPeriod": config.YEARS[-1],
    }
    text = _get(ECB_URL, params).text
    rows = csv.DictReader(io.StringIO(text))
    with open(out, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["year", "usd_per_eur"])
        for row in rows:
            w.writerow([row["TIME_PERIOD"], row["OBS_VALUE"]])
    return out


def fetch_all(refresh=False):
    fetch_fx(refresh)
    for iso2 in config.COUNTRIES:
        print(f"Comext: EU-27 -> {iso2}")
        fetch_comext(iso2, refresh)
        for year in config.YEARS:
            print(f"Comtrade: {iso2} -> RU {year}")
            fetch_comtrade(iso2, year, refresh)
            fetch_comtrade_release(iso2, year, refresh)
            print(f"Comtrade: {iso2} imports from EU-27 {year}")
            fetch_comtrade_imports_from_eu(iso2, year, refresh)


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--refresh", action="store_true", help="download again")
    fetch_all(p.parse_args().refresh)
