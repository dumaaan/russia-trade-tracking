"""Download raw data from Comext (Eurostat) and the ECB. UN Comtrade data comes from comtrade.py.

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


_COMEXT_UPDATED = None


def comext_updated():
    """When Eurostat last updated the Comext dataset (one small query a run)."""
    global _COMEXT_UPDATED
    if _COMEXT_UPDATED is None:
        params = [("format", "JSON"), ("reporter", "EU27_2020"), ("partner", "KG"), ("flow", "2"), ("freq", "A"),
                  ("indicators", "VALUE_IN_EUROS"), ("product", "TOTAL"), ("time", str(config.YEARS[-1]))]
        _COMEXT_UPDATED = _get(COMEXT_URL, params).json().get("updated", "")
    return _COMEXT_UPDATED


def keep_comext(path, refresh=False):
    """True: use the saved Comext file. False: download it again, because it is missing, the run asks
    for it (--refresh), or Eurostat has updated the dataset since the file was saved. Without a
    connection to Eurostat, the saved file is kept."""
    if refresh or not path.exists():
        return False
    try:
        saved = json.loads(path.read_text()).get("updated", "")
    except ValueError:
        return False
    try:
        return saved >= comext_updated()
    except Exception:  # no connection: keep what we have
        return True


def keep_recent(path, refresh=False, days=7):
    """True: use a saved file younger than `days` (ECB rates, sanctions lists change often)."""
    if refresh or not path.exists():
        return False
    age = datetime.now(timezone.utc).timestamp() - path.stat().st_mtime
    return age < days * 86400


def fetch_comext(partner, refresh=False):
    """EU-27 exports (flow 2) to one partner, in EUR, by HS6 and year."""
    out = config.RAW / "comext" / f"eu27_exports_to_{partner}.json"
    if keep_comext(out, refresh):
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


def fetch_fx(refresh=False):
    """ECB annual average USD per EUR."""
    out = config.RAW / "ecb_usd_per_eur.csv"
    if keep_recent(out, refresh):
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


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--refresh", action="store_true", help="download again")
    fetch_all(p.parse_args().refresh)
