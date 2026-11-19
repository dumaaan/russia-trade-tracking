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
    years = [str(y) for y in config.YEARS]
    codes = query_codes()
    # Main module: Kazakhstan and Kyrgyzstan, exports to Russia and imports from the 27 EU states.
    comtrade.need("A", "X", [KZ, KG], [RU], years, codes)
    comtrade.need("A", "M", [KZ, KG], config.EU27_M49.values(), years, codes)
    # Listed goods as a share of all trade: the same codes plus the total of all goods.
    comtrade.need("A", "X", [KG, UZ, KZ, GE, AZ, MN], [RU], years, codes + ["TOTAL"])
    # China as a supplier: China's exports of the listed goods (and all goods) to the route countries
    # and to Russia, as China reports them.
    comtrade.need("A", "X", [CN], [KG, UZ, KZ, RU], years, codes + ["TOTAL"])
    # The April 2026 ban: monthly exports to Russia.
    t = date.today()
    ms = months("2024-01", f"{t.year}-{t.month:02d}")
    comtrade.need("M", "X", [KG, UZ, KZ], [RU], ms, codes)
    # The ban: each route country's monthly imports from China, as the country reports them
    # (China's own monthly data in Comtrade ends in December 2024).
    comtrade.need("M", "M", [KG, UZ, KZ], [CN], ms, codes)
