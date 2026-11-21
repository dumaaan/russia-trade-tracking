"""Kazakhstan's own monthly statistics of trade with EAEU countries (Bureau of National Statistics).

Comtrade has no monthly data from Kazakhstan for March-December 2024. The Bureau publishes the
same figures (its 1-TS company reports; Comtrade takes them from it): one archive a year of
monthly .xls tables, and one .xlsx for the current year. This module reads Kazakhstan's monthly
exports to Russia and to Kyrgyzstan by HS6 code, in US dollars and tonnes.

Table page: https://stat.gov.kz/ru/industries/economy/foreign-market/spreadsheets/?name=40111
The 2024 archive is a RAR file; reading it needs the `unrar` program.

Output: data/processed/bns_kz_monthly.csv (partner, month, hs6, usd, tonnes).
"""

import glob
import re
import shutil
import subprocess

import pandas as pd

from . import config
from .fetch import _get

RAW = config.RAW / "bns"
FILES = {
    # year: (url, file name)
    2024: ("https://stat.gov.kz/api/iblock/element/347504/file/ru/", "eaeu_2024.rar"),
}
PARTNERS = {"РОССИЯ": "RU", "КЫРГЫЗСТАН": "KG"}


def fetch(refresh=False):
    RAW.mkdir(parents=True, exist_ok=True)
    for year, (url, name) in FILES.items():
        out = RAW / name
        if out.exists() and not refresh:
            continue
        print(f"BNS: {name}")
        out.write_bytes(_get(url, {}).content)


def _unpack(year):
    """The archive's monthly tables, unpacked once. Returns {month: path of the 6-digit table}."""
    _, name = FILES[year]
    dest = RAW / f"{year}"
    if not dest.exists():
        if not shutil.which("unrar"):
            raise RuntimeError("Reading the BNS archive needs the 'unrar' program.")
        dest.mkdir()
        subprocess.run(["unrar", "x", "-o+", "-inul", str(RAW / name), str(dest) + "/"], check=True)
    out = {}
    for f in glob.glob(str(dest / "*" / "[0-9][0-9]" / "*_2_00.xls")):
        out[int(re.search(r"/(\d\d)/", f).group(1))] = f
    return out


def _norm(s):
    # The tables mix Latin and Cyrillic letters in some names (e.g. "АРМЕHИЯ").
    return str(s).strip().upper().replace("H", "Н").replace("P", "Р").replace("A", "А").replace("O", "О")


def _read_month(path, year, month):
    import xlrd
    sh = xlrd.open_workbook(path).sheet_by_index(0)
    title = " ".join(str(v) for r in range(4) for v in sh.row_values(r))
    assert str(year) in title, f"{path}: not {year}"
    rows, code = [], None
    for r in range(sh.nrows):
        v = sh.row_values(r)
        c = str(v[0]).strip()
        if re.fullmatch(r"\d{6}", c):
            code = c
            continue
        p = PARTNERS.get(_norm(v[1]))
        if code and p:
            usd, t = v[5], v[3]
            if usd in ("", "-"):
                continue
            if str(usd).strip().lower() in ("x", "х"):
                rows.append({"partner": p, "month": f"{year}-{month:02d}", "hs6": code, "usd": None, "tonnes": None, "confidential": True})
                continue
            rows.append({"partner": p, "month": f"{year}-{month:02d}", "hs6": code, "usd": float(usd) * 1000,
                         "tonnes": float(t) if t not in ("", "-") else None, "confidential": False})
    return rows


def build():
    rows = []
    for year in FILES:
        for month, path in sorted(_unpack(year).items()):
            rows += _read_month(path, year, month)
    df = pd.DataFrame(rows)
    config.PROCESSED.mkdir(parents=True, exist_ok=True)
    df.to_csv(config.PROCESSED / "bns_kz_monthly.csv", index=False)
    return df


if __name__ == "__main__":
    fetch()
    df = build()
    print(df.groupby(["partner", "month"]).usd.sum().div(1e6).round(1).unstack("partner").to_string())
    print("confidential cells:", int(df.confidential.sum()))
