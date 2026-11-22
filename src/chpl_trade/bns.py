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
# One xlsx a year with monthly columns at 4, 6 and 10 digits (the current year is cumulative to date and
# replaced by a new file each month: the page lists the newest).
XLSX = {
    2025: ("https://stat.gov.kz/api/iblock/element/347505/file/ru/", "eaeu_2025.xlsx"),
    2026: ("https://stat.gov.kz/api/iblock/element/355038/file/ru/", "eaeu_2026_09.xlsx"),
}
MONTHS_RU = {"январь": 1, "февраль": 2, "март": 3, "апрель": 4, "май": 5, "июнь": 6, "июль": 7, "август": 8,
             "сентябрь": 9, "октябрь": 10, "ноябрь": 11, "декабрь": 12}
PARTNERS = {"РОССИЯ": "RU", "КЫРГЫЗСТАН": "KG"}


def fetch(refresh=False):
    RAW.mkdir(parents=True, exist_ok=True)
    for year, (url, name) in {**FILES, **XLSX}.items():
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
    build_hs10()
    return df


# ---------------------------------------------------------------- 10-digit lines inside the listed codes

def _listed6():
    from .fetch import query_codes
    return set(query_codes())


def _num(v):
    if v in (None, "", "-", "х", "x"):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _hs10_xls(path, year, month, keep):
    """2024 archive: one .xls a month (tab_3: 10 digits)."""
    import xlrd
    sh = xlrd.open_workbook(path).sheet_by_index(0)
    rows, code, name, unit = [], None, "", ""
    for r in range(sh.nrows):
        v = sh.row_values(r)
        c = str(v[0]).strip().replace(" ", "")
        if re.fullmatch(r"\d{10}", c):
            code, name, unit = c, str(v[1]).strip(), str(v[2]).strip()
            continue
        p = PARTNERS.get(_norm(v[1]))
        if code and p and code[:6] in keep and _num(v[5]) is not None:
            rows.append({"partner": p, "month": f"{year}-{month:02d}", "hs10": code, "name": name, "unit": unit,
                         "usd": _num(v[5]) * 1000, "tonnes": _num(v[3]), "units": _num(v[4])})
    return rows


def _hs10_xlsx(path, year, keep):
    """2025 and 2026 files: the sheet '10 знаков ТН ВЭД', 6 columns a month (export t, units, k$; import ...)."""
    import openpyxl
    ws = openpyxl.load_workbook(path, read_only=True)["10 знаков ТН ВЭД"]
    it = ws.iter_rows(values_only=True)
    for _ in range(3):
        next(it)
    head = next(it)
    next(it), next(it)
    cols = []
    for i, lab in enumerate(head):
        if not lab or "-" in str(lab):  # skip the year-to-date total ("январь-сентябрь")
            continue
        m = MONTHS_RU.get(str(lab).split("_")[0].strip().lower())
        if m:
            cols.append((i, f"{year}-{m:02d}"))
    rows, code, name, unit = [], None, "", ""
    for v in it:
        c = str(v[0]).strip() if v[0] is not None else ""
        if re.fullmatch(r"\d{10}", c):
            code, name, unit = c, str(v[1] or "").strip(), str(v[2] or "").strip()
            continue
        p = PARTNERS.get(_norm(v[1])) if v[1] else None
        if not (code and p and code[:6] in keep):
            continue
        for i, month in cols:
            usd = _num(v[i + 2])
            if usd is None:
                continue
            rows.append({"partner": p, "month": month, "hs10": code, "name": name, "unit": unit,
                         "usd": usd * 1000, "tonnes": _num(v[i]), "units": _num(v[i + 1])})
    return rows


def build_hs10():
    keep = _listed6()
    rows = []
    for year in FILES:
        dest = RAW / f"{year}"
        for f in sorted(glob.glob(str(dest / "*" / "[0-9][0-9]" / "*_3_00.xls"))):
            month = int(re.search(r"/(\d\d)/", f).group(1))
            rows += _hs10_xls(f, year, month, keep)
    for year, (_, name) in XLSX.items():
        if (RAW / name).exists():
            rows += _hs10_xlsx(RAW / name, year, keep)
    df = pd.DataFrame(rows)
    df["hs6"] = df["hs10"].str[:6]
    df.to_csv(config.PROCESSED / "bns_kz_hs10.csv", index=False)
    return df


if __name__ == "__main__":
    fetch()
    df = build()
    print(df.groupby(["partner", "month"]).usd.sum().div(1e6).round(1).unstack("partner").to_string())
    print("confidential cells:", int(df.confidential.sum()))
