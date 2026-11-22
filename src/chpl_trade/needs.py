"""Every Comtrade cell the project reads, declared in one place.

`declare_all()` registers the needs of all modules; `comtrade.sync()` then plans one download for
all of them together, so overlapping needs cost nothing extra.
"""

from datetime import date

from . import comtrade, config
from .fetch import query_codes

# Reporters (UN M49)
KG, KZ, UZ, GE, AZ, MN = 417, 398, 860, 268, 31, 496
CN = 156
HK = 344
RU = config.RUSSIA_M49


def months(start, end):
    y, m = map(int, start.split("-"))
    ey, em = map(int, end.split("-"))
    out = []
    while (y, m) <= (ey, em):
        out.append(f"{y:04d}{m:02d}")
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return out


def declare_all():
    t = date.today()
    years = [str(y) for y in config.YEARS]
    codes = query_codes()
    # Main module: Kazakhstan and Kyrgyzstan, exports to Russia and imports from the 27 EU states.
    comtrade.need("A", "X", [KZ, KG, UZ], [RU], years, codes)
    comtrade.need("A", "M", [KZ, KG, UZ], config.EU27_M49.values(), years, codes)
    # Listed goods as a share of all trade: the same codes plus the total of all goods.
    comtrade.need("A", "X", [KG, UZ, KZ, GE, AZ, MN], [RU], years, codes + ["TOTAL"])
    # Unit values (value per kg): weights for the listed codes, annual, on the two Comtrade legs.
    # Both are flow X, so the planner joins them into one request. The EU leg is from Comext.
    comtrade.need_weight("A", "X", [KG, UZ, KZ], [RU], years, codes)
    comtrade.need_weight("A", "X", [CN], [KG, UZ, KZ], years, codes)
    # Price per kg around the April 2026 ban: monthly weights from April 2025 (the ban chapter's first
    # month). All listed codes cost no more calls than the two banned codes: a call is limited by
    # 12 months, not by codes.
    bms = months("2025-04", f"{t.year}-{t.month:02d}")
    comtrade.need_weight("M", "X", [KG, UZ, KZ], [RU], bms, codes)
    comtrade.need_weight("M", "M", [KG, UZ, KZ], [CN], bms, codes)
    # Hong Kong as a supplier: its exports to the route countries (with weight, at no extra cost),
    # and the route countries' imports from Hong Kong, for the mirror check.
    comtrade.need_weight("A", "X", [HK], [KG, UZ, KZ], years, codes + ["TOTAL"])
    comtrade.need("A", "M", [KG, UZ, KZ], [HK], years, codes + ["TOTAL"])
    # China leg of the mirror check: the route countries' imports from China, as they report them
    # (China's side is the "China as a supplier" need below).
    comtrade.need("A", "M", [KG, UZ, KZ], [CN], years, codes + ["TOTAL"])
    # Price per kg of imports from China as the importer records them (a check on China's own prices).
    comtrade.need_weight("A", "M", [KG, UZ, KZ], [CN], years, codes)
    # Excess growth: the chapters (84, 85, 88, 90) and the HS4 headings of the listed codes, so that
    # "other goods" = chapter (or heading) minus the listed codes.
    from .control import headings
    comtrade.need("A", "X", [KG, UZ, KZ, GE, AZ, MN], [RU], years, ["84", "85", "88", "90"] + headings())
    # China as a supplier: China's exports of the listed goods (and all goods) to the route countries
    # and to Russia, as China reports them.
    comtrade.need("A", "X", [CN], [KG, UZ, KZ, RU], years, codes + ["TOTAL"])
    # The April 2026 ban: monthly exports to Russia.
    t = date.today()
    ms = months("2024-01", f"{t.year}-{t.month:02d}")
    comtrade.need("M", "X", [KG, UZ, KZ], [RU], ms, codes)
    # Events: monthly exports to Russia from 2022, with the HS4 headings of the listed codes (for
    # moves to neighbour codes); China's monthly exports to the route countries for 2022-2024
    # (China's own monthly data in Comtrade ends in December 2024).
    ems = months("2021-01", f"{t.year}-{t.month:02d}")
    comtrade.need("M", "X", [KG, UZ, KZ], [RU], ems, codes + headings())
    comtrade.need("M", "X", [CN], [KG, UZ, KZ], months("2022-01", "2024-12"), codes + headings())
    # The ban: each route country's monthly imports from China, as the country reports them
    # (China's own monthly data in Comtrade ends in December 2024).
    comtrade.need("M", "M", [KG, UZ, KZ], [CN], ems, codes + headings())
