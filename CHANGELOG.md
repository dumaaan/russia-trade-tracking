# Changelog

All method changes are listed here with a date, so that readers can see why a number changed.

## 0.5.0 — 2026-11-19

### Charts (review after Tufte, The Visual Display of Quantitative Information)
- **Integrity:** the route bands had a minimum width of 1.5 px. For small values this distorted
  the comparison (Lie Factor 0.34 for Kyrgyzstan 2019 against Kazakhstan). Bands are now exactly
  to scale. The route caption now says that the two legs are measured separately and that the
  second leg also carries goods from other suppliers.
- **Context:** the mirror chart shows each country's pre-war level as a dashed line, so the excess
  gap is visible on the chart.
- **Labels:** the flows and mirror charts label each line at its end (name and value) instead of
  a separate legend. The unit is on the top tick ("$500M").
- **Scale:** the comparison charts show multiples of the baseline (×1, ×2, ×5) on one shared log
  scale, instead of "index = 100" on two different scales.
- **New:** "Tier by tier", six small charts on one shared scale, so all tiers can be compared at
  once (before, only one tier at a time through the filter).
- Asset links carry a version (`?v=0.5`), so browsers load the new files.

## 0.4.0 — 2026-11-19

### Site redesign
- New hero: a route diagram drawn from the data (EU → Kazakhstan / Kyrgyzstan → Russia). Band
  widths are to scale across all years; a year control changes the year.
- New look: security-paper colour and navy ink; one type family (Archivo) with its width axis
  (wide for headings, condensed for data). No cards: the page reads as chapters along the route.
- Each chapter states its finding next to its chart; the first chapter's finding comes from the data.
- Removed the summary tiles (the route diagram shows those values), all-caps labels and middle-dot
  text. Added a skip link and keyboard access to the route bands.
- No data or method changed.

## 0.3.0 — 2026-11-18

### Added
- **Mirror check of the first leg.** New flow: Kazakhstan and Kyrgyzstan imports from the 27 EU
  states, as they report them (Comtrade, flow M). New columns in `comparison.csv`:
  `imports_from_eu_usd`, `mirror_ratio_pct`, `mirror_gap_usd`, `prewar_mirror_ratio_pct`,
  `excess_gap_usd`. New chart `figures/mirror_check.png` and a new site section.
- Cross-check with the EBRD "lost in transit" result.

### Data
- Kazakhstan gives no product detail for imports by partner for 2020–2022. These years are
  missing for the mirror check. The Kazakh pre-war ratio uses 2019 only.

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
