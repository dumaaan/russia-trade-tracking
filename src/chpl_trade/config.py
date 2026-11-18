"""Project settings: years, countries, file paths and HS code mapping."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
RAW = DATA / "raw"
PROCESSED = DATA / "processed"
FIGURES = ROOT / "figures"
CHPL_CSV = DATA / "chpl_hs_codes.csv"

YEARS = list(range(2019, 2026))
SANCTIONS_YEAR = 2022
# Pre-war baseline: the average of these years. 2021 alone is a second option.
BASELINE_YEARS = [2019, 2020, 2021]

# Country codes: ISO2 for Comext, UN M49 for Comtrade.
COUNTRIES = {
    "KZ": {"name": "Kazakhstan", "m49": 398},
    "KG": {"name": "Kyrgyzstan", "m49": 417},
}
RUSSIA_M49 = 643

# EU-27 member states as Comtrade partner codes (for the mirror check).
# France is 251 in Comtrade; 250 ("Metropolitan France") is not used by KZ or KG.
EU27_M49 = {
    "AT": 40, "BE": 56, "BG": 100, "HR": 191, "CY": 196, "CZ": 203, "DK": 208,
    "EE": 233, "FI": 246, "FR": 251, "DE": 276, "GR": 300, "HU": 348, "IE": 372,
    "IT": 380, "LV": 428, "LT": 440, "LU": 442, "MT": 470, "NL": 528, "PL": 616,
    "PT": 620, "RO": 642, "SK": 703, "SI": 705, "ES": 724, "SE": 752,
}
# Codes per import call: about 20 rows per code (one per EU partner) keeps
# each call far below the 500-record preview cap.
IMPORT_CODES_PER_CALL = 12

# The CHPL (Feb 2024) uses HS 2022 codes. Data for 2019-2021 uses HS 2017.
# These CHPL codes have a different HS 2017 code. We add the old code to the
# query and count it as the CHPL code.
HS2017_EQUIVALENT = {
    "880730": "880330",  # Other parts of aeroplanes/helicopters (UAVs added in HS 2022)
    "852589": "852580",  # Cameras: HS 2022 split 852580 into 852581-852589
    "854149": "854140",  # Photosensitive devices: HS 2017 code also has solar cells and LEDs
}

# 854140 (HS 2017) includes solar cells and LEDs, so it is much wider than
# 854149 (HS 2022). We keep the code in the data but not in the main basket,
# because it makes the 2019-2021 values too high.
EXCLUDED_FROM_BASKET = {"854149"}
