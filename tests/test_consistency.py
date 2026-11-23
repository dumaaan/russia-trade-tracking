"""Consistency tests for the published data: numbers that must agree between chapters and files.

Run from the project root:  python -m unittest discover -s tests
No network and no API calls: the tests read data/processed/ and docs/data.js only.
"""

import json
import math
import re
import unittest
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
P = ROOT / "data" / "processed"
NAMES = {"KZ": "Kazakhstan", "KG": "Kyrgyzstan", "UZ": "Uzbekistan"}


def site_data():
    text = (ROOT / "docs" / "data.js").read_text()
    return json.loads(text[text.index("=") + 1:text.rindex(";")])


class TotalsAgree(unittest.TestCase):
    """The same flow must have the same total wherever it appears."""

    def test_codes_add_up_to_totals(self):
        codes = pd.read_csv(P / "trade_by_code.csv", dtype={"hs6": str})
        codes = codes[codes.in_basket]
        totals = pd.read_csv(P / "trade_totals.csv")
        s = codes.groupby(["flow", "country", "year"]).usd.sum()
        for r in totals.itertuples():
            if (r.flow, r.country, r.year) in s.index and not math.isnan(r.usd):
                self.assertAlmostEqual(s[(r.flow, r.country, r.year)], r.usd, delta=1e3 + 1e-6 * r.usd,
                                       msg=f"{r.flow} {r.country} {r.year}")

    def test_eu_exports_same_in_both_tables(self):
        """EU exports by code (main table) against the supplier table: both from Comext."""
        codes = pd.read_csv(P / "trade_by_code.csv", dtype={"hs6": str})
        codes = codes[codes.in_basket & codes.flow.str.startswith("EU-27 exports")]
        sup = pd.read_csv(P / "suppliers.csv", dtype={"code": str})
        sup = sup[sup.supplier == "eu"]
        for iso, name in NAMES.items():
            for y in range(2019, 2026):
                a = codes[(codes.country == name) & (codes.year == y)].usd.sum()
                b = sup[(sup.dest == iso) & (sup.year == y)].usd.sum()
                self.assertAlmostEqual(a, b, delta=1e3 + 1e-6 * max(a, b), msg=f"EU -> {iso} {y}")

    def test_member_states_add_up_to_eu27(self):
        """The 27 member states' exports (Comext by reporter) equal the EU-27 supplier table."""
        m = pd.read_csv(P / "eu_members.csv", dtype={"hs6": str})
        self.assertEqual(m.member.nunique(), 27)
        sup = pd.read_csv(P / "suppliers.csv", dtype={"code": str})
        sup = sup[(sup.supplier == "eu") & sup.dest.isin(NAMES.keys())]
        a = m.groupby(["dest", "year"]).usd.sum()
        b = sup.groupby(["dest", "year"]).usd.sum()
        for k in b.index:
            self.assertAlmostEqual(a.get(k, 0.0), b[k], delta=1e3 + 1e-6 * b[k], msg=str(k))

    def test_member_imports_match_mirror(self):
        """The importers' records by member state add up to the recorded imports from the EU-27."""
        i = pd.read_csv(P / "eu_members_imports.csv").groupby(["dest", "year"]).usd.sum()
        codes = pd.read_csv(P / "trade_by_code.csv", dtype={"hs6": str})
        codes = codes[codes.in_basket & codes.flow.str.startswith("Country imports from EU-27")]
        for iso, name in NAMES.items():
            for y in range(2019, 2026):
                if (iso, y) not in i.index:
                    continue
                b = codes[(codes.country == name) & (codes.year == y)].usd.sum()
                self.assertAlmostEqual(i[(iso, y)], b, delta=1e3 + 1e-3 * b, msg=f"{iso} {y}")

    def test_recorded_exports_same_in_estimate(self):
        est = pd.read_csv(P / "estimate.csv")
        comp = pd.read_csv(P / "comparison.csv")
        for r in est.itertuples():
            c = comp[(comp.country == NAMES[r.country]) & (comp.year == r.year)].exports_to_ru_usd.iloc[0]
            self.assertAlmostEqual(r.recorded, c, delta=1.0, msg=f"{r.country} {r.year}")

    def test_ban_monthly_matches_events_monthly(self):
        """Kyrgyzstan's monthly exports of the listed codes to Russia: ban table and events table."""
        ban = pd.read_csv(P / "ban_monthly.csv")
        ev = pd.read_csv(P / "events_monthly.csv")
        b = ban[(ban.flow == "ru") & (ban.country == "KG") & ban.group.isin(["banned", "other"])].groupby("month").usd.sum()
        e = ev[(ev.leg == "ru") & (ev.country == "KG") & (ev.group == "listed")].set_index("month").usd
        common = sorted(set(b.index) & set(e.index))
        self.assertGreater(len(common), 12)
        for m in common:
            if not (math.isnan(b[m]) or math.isnan(e[m])):
                self.assertAlmostEqual(b[m], e[m], delta=1.0 + 1e-6 * e[m], msg=m)


class RangesAreSound(unittest.TestCase):
    def test_estimate_low_not_above_high(self):
        est = pd.read_csv(P / "estimate.csv")
        for r in est.itertuples():
            self.assertGreaterEqual(r.low, 0)
            if not math.isnan(r.high):
                self.assertLessEqual(r.low, r.high + 1e-6, msg=f"{r.country} {r.year}")
                self.assertAlmostEqual(r.high, r.recorded + (0 if math.isnan(r.eu_gap) else r.eu_gap)
                                       + (0 if math.isnan(r.china_gap) else r.china_gap), delta=1.0)

    def test_unit_values_positive(self):
        uv = pd.read_csv(P / "unit_values.csv", dtype={"hs6": str})
        self.assertTrue((uv.usd_per_kg > 0).all())
        self.assertTrue((uv.kg > 0).all())

    def test_no_negative_trade(self):
        for f, col in (("trade_by_code.csv", "usd"), ("suppliers.csv", "usd"), ("events_monthly.csv", "usd")):
            d = pd.read_csv(P / f)
            self.assertFalse((d[col] < -1).any(), f)


class DesignationsAreClean(unittest.TestCase):
    def test_only_route_organisations_after_invasion(self):
        d = pd.read_csv(P / "designations.csv")
        self.assertTrue(d.country.isin(["KZ", "KG", "UZ"]).all())
        self.assertFalse(d.schema.isin(["Person"]).any(), "no people")
        self.assertTrue((d.date >= "2022-02-24").all())

    def test_no_foreign_banks_or_other_programmes(self):
        d = pd.read_csv(P / "designations.csv")
        self.assertFalse(d.name.str.contains("Gazprombank", case=False).any())
        self.assertFalse(d.programme.fillna("").str.contains("SDGT|GLOMAG|DPRK|US-IRAN", regex=True).any())


class CuratedAndBureauData(unittest.TestCase):
    def test_hs10_adds_up_to_hs6(self):
        """Kazakhstan's 10-digit lines to Russia add up to the bureau's 6-digit monthly totals (2024)."""
        t10 = pd.read_csv(P / "bns_kz_hs10.csv", dtype={"hs10": str, "hs6": str})
        t6 = pd.read_csv(P / "bns_kz_monthly.csv", dtype={"hs6": str})
        a = t10[(t10.partner == "RU") & t10.month.str.startswith("2024")].groupby("hs6").usd.sum()
        b = t6[(t6.partner == "RU") & t6.hs6.isin(a.index)].groupby("hs6").usd.sum()
        for k in a.index:
            self.assertAlmostEqual(a[k], b.get(k, 0.0), delta=1e3 + 1e-3 * a[k], msg=k)

    def test_hs10_matches_comtrade_2025(self):
        t10 = pd.read_csv(P / "bns_kz_hs10.csv", dtype={"hs10": str, "hs6": str})
        comp = pd.read_csv(P / "comparison.csv")
        a = t10[(t10.partner == "RU") & t10.month.str.startswith("2025")].usd.sum()
        b = comp[(comp.country == "Kazakhstan") & (comp.year == 2025)].exports_to_ru_usd.iloc[0]
        self.assertLess(abs(a - b) / b, 0.02, f"{a} against {b}")

    def test_every_hs10_line_has_an_english_name(self):
        t10 = pd.read_csv(P / "bns_kz_hs10.csv", dtype={"hs10": str})
        en = pd.read_csv(ROOT / "data" / "hs10_en.csv", dtype={"hs10": str})
        self.assertFalse(set(t10.hs10) - set(en.hs10), "lines without an English name")

    def test_designation_effect_is_sound(self):
        x = json.loads((P / "designation_effect.json").read_text())
        self.assertGreater(len(x["waves"]), 10)
        for w in x["waves"]:
            self.assertGreaterEqual(w["month"], x["start"])
            self.assertTrue(0 <= w["share_as_low"] <= 1)
            self.assertAlmostEqual(w["effect_pct"], 100 * (math.exp(w["effect"]) - 1), delta=1e-6)

    def test_payment_channels_are_classified(self):
        x = json.loads((P / "designation_effect.json").read_text())
        names = " | ".join(x["payment_names"]).lower()
        for must in ("keremet", "capital bank", "grinex", "tengricoin"):
            self.assertIn(must, names)
        self.assertNotIn("gazprom neft", names)
        n = sum(1 for w in x["waves"] if w["payment"])
        self.assertEqual(n, x["by_type"]["payment"]["all"]["n"])

    def test_responses_are_well_formed(self):
        r = pd.read_csv(ROOT / "data" / "responses.csv")
        self.assertTrue(r.country.isin(["KZ", "KG", "UZ"]).all())
        self.assertTrue(r.kind.isin(["promise", "measure", "bank", "plays down", "objection"]).all())
        self.assertTrue(r.source.str.startswith("https://").all())
        self.assertTrue(pd.to_datetime(r.date, errors="coerce").notna().all())

    def test_cases_are_well_formed(self):
        c = pd.read_csv(ROOT / "data" / "cases.csv")
        self.assertTrue(c.stage.isin(["investigation", "arrest", "charge", "sent to prosecutor", "conviction", "fine"]).all())
        self.assertTrue(c.date_kind.isin(["event", "first reported"]).all())
        self.assertTrue(c.primary.isin(["yes", "no"]).all())
        self.assertTrue(c.source.str.startswith("https://").all())
        self.assertTrue(pd.to_datetime(c.date, errors="coerce").notna().all())
        for r in c.route:
            self.assertTrue(set(r.split(";")) <= {"KZ", "KG", "UZ"}, r)
        # each case has one EU country
        self.assertTrue((c.groupby("case").country.nunique() == 1).all())

    def test_weapon_parts_are_listed_codes(self):
        w = pd.read_csv(ROOT / "data" / "weapons.csv", dtype={"hs6": str})
        listed = set(pd.read_csv(ROOT / "data" / "chpl_hs_codes.csv", dtype={"hs6": str}).hs6)
        self.assertTrue(w.hs6.isin(listed).all(), set(w.hs6) - listed)


class SiteDataIsWhole(unittest.TestCase):
    def test_sections_present(self):
        d = site_data()
        for key in ("codes", "suppliers", "control", "ban", "excess", "eventStudy", "mirrorCn", "unitValues",
                    "designations", "estimate", "cnImports", "responses", "weapons", "hs10", "designationEffect", "members", "cases"):
            self.assertIn(key, d)
            self.assertTrue(d[key], key)

    def test_no_api_key_in_site(self):
        env = ROOT / ".env"
        if not env.exists():
            self.skipTest("no .env here")
        m = re.search(r"COMTRADE_KEY=(\S+)", env.read_text())
        if not m:
            self.skipTest("no key in .env")
        for f in (ROOT / "docs").rglob("*"):
            if f.is_file() and f.suffix in (".js", ".html", ".csv", ".json"):
                self.assertNotIn(m.group(1), f.read_text(errors="ignore"), str(f))


if __name__ == "__main__":
    unittest.main()
