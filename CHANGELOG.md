# Changelog

All method changes are listed here with a date, so that readers can see why a number changed.

## 0.2.0 — 2026-11-18

### Method changes
- **Baseline.** The main baseline is now the 2019–2021 average (before: 2021 only). The site
  can still show 2021. Multiples now always state their baseline.
- **Missing data.** A year with no data from the source is now missing (NaN), not zero.
  A code with no row in a year that the source reports is still zero trade.
- **Comtrade rows.** The pipeline keeps only total rows (all transport modes, all customs
  procedures, no second partner). The current data had no breakdown rows, so no value changed.
- **Ratio.** The ratio "exports to Russia ÷ EU exports" is now called a *scale ratio*. It is not
  a re-export share, because other suppliers (mainly China) also feed the exports to Russia.

### Added
- Download guard: the pipeline stops when a Comtrade preview call returns 500 records
  (the preview cap), because the result can then be incomplete.
- Source dates: Comext update date, Comtrade release date per reporter and year, and the
  download date. New files `availability.csv` and `sources.json`.
- EUR values next to USD values.
- Site: one filter row for goods (all, each tier, the two EU-ban codes), currency and baseline;
  numbered event marks with sources; cross-checks with published figures; data availability
  table; CSV downloads; mark for the two codes in the April 2026 EU export ban on Kyrgyzstan.
- LICENSE (MIT for code), CITATION.cff, this changelog.

### Data
- All data downloaded again on 2026-11-18. Values did not change.

## 0.1.0 — 2026-11-18

- First version: EU-27 exports of 49 CHPL codes to Kazakhstan and Kyrgyzstan (Comext) and their
  exports of the same codes to Russia (Comtrade), 2019–2025. PNG charts and a static site.
