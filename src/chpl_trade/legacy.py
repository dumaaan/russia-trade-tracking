"""One-time import of the Comtrade files downloaded before the shared store existed.

Each old file becomes stored rows plus coverage for the codes that were requested, with the
file's download time. Nothing is downloaded again that the store already has.
"""

import json
import re
from datetime import datetime, timezone

from . import comtrade, config
from .fetch import query_codes

ISO = {"KG": 417, "KZ": 398, "AM": 51, "UZ": 860, "GE": 268, "AZ": 31, "MN": 496}
RU = config.RUSSIA_M49


def _when(path, body):
    if body.get("_downloaded"):
        return body["_downloaded"]
    return datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat(timespec="seconds")


def _store(con, freq, flow, reporter, partners, period, cmds, body, when):
    for x in body.get("data") or []:
        if (x.get("motCode", 0), x.get("customsCode", "C00"), x.get("partner2Code", 0)) != (0, "C00", 0):
            continue
        con.execute("INSERT OR REPLACE INTO obs VALUES (?,?,?,?,?,?,?)",
                    (freq, flow, reporter, x["partnerCode"], str(x["period"]), x["cmdCode"], x["primaryValue"]))
    con.executemany("INSERT OR IGNORE INTO cover VALUES (?,?,?,?,?,?,?)",
                    [(freq, flow, reporter, p, period, c, when) for p in partners for c in cmds])


def import_all():
    con = comtrade._db()
    codes = query_codes()
    n = 0
    raw = config.RAW
    for f in sorted((raw / "comtrade").glob("*_exports_to_RU_*.json")):
        iso, year = re.match(r"(\w\w)_exports_to_RU_(\d{4})", f.name).groups()
        b = json.loads(f.read_text())
        _store(con, "A", "X", ISO[iso], [RU], year, codes, b, _when(f, b)); n += 1
    for f in sorted((raw / "comtrade").glob("*_imports_from_EU27_*.json")):
        iso, year = re.match(r"(\w\w)_imports_from_EU27_(\d{4})", f.name).groups()
        b = json.loads(f.read_text())
        _store(con, "A", "M", ISO[iso], list(config.EU27_M49.values()), year, codes, b, _when(f, b)); n += 1
    for f in sorted((raw / "monthly").glob("comtrade_*_to_RU_*.json")):
        iso, ym = re.match(r"comtrade_(\w\w)_to_RU_(\d{4}-\d{2})", f.name).groups()
        b = json.loads(f.read_text())
        _store(con, "M", "X", ISO[iso], [RU], ym.replace("-", ""), codes, b, _when(f, b)); n += 1
    for f in sorted((raw / "control").glob("comtrade_*_to_RU_*.json")):
        m = re.match(r"comtrade_(\w\w)_to_RU_(\d{4})(_TOTAL)?\.json", f.name)
        iso, year, tot = m.groups()
        b = json.loads(f.read_text())
        _store(con, "A", "X", ISO[iso], [RU], year, ["TOTAL"] if tot else codes, b, _when(f, b)); n += 1
    con.commit()
    return n


if __name__ == "__main__":
    print(import_all(), "files imported")
    comtrade.status()
