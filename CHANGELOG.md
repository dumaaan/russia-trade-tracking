# Changelog

All method changes are listed here with a date, so that readers can see why a number changed.

## 1.4.0 — 2026-11-19

### Changed after a third design review (Tufte principles)
- **Key numbers:** the 2022–2025 total of shipments missing from import records is now a sentence
  under the table, not a row in a table of yearly values.
- **Cross-checks:** the Kyrgyz multiples and pre-war base also show their 2025-price values, so one
  flow does not show two unexplained numbers on the page.
- **EU and China chapter:** one shared log scale. The same height is the same money in every
  panel, and the gap between the lines is the China/EU ratio, also for Armenia and Kyrgyzstan.
- **Ban table:** the column header explains the bright bars and the ban line.
- **Share chapter:** charts at about half the height, with fewer ticks.
- **Goods table:** true zeros are blank, values under $0.05M show as a light "<0.1", and the
  header explains the dash in the multiple column.
- **Lines:** Kyrgyzstan is a solid line in a lighter tint of the leg colour, not a dash.
- **Scatterplot:** sits next to its explanation; the box fits the square plot.
- **First chart:** the three steps of the goods list are one mark ("List: 9 → 45 → 50 codes").
- **Tier heading:** one claim (the largest tier); the growth ranking stays in the paragraph.

## 1.3.0 — 2026-11-19

### Changed after a second design review (Tufte principles)
- **Prices:** money now shows in 2025 prices by default. US dollars are deflated with the US
  CPI-U (BLS CUUR0000SA0, annual average; 2025 has 11 months, because BLS published no October
  2025 figure), euros with the euro-area HICP (Eurostat prc_hicp_aind). A new filter switches
  back to current prices. The key-numbers table is always in 2025 US dollars. The ban table and
  the cross-checks stay in current US dollars. Multiples fall: Kazakhstan to Russia is ×2.1, not
  ×2.6; Kyrgyzstan to Russia is ×8.8, not ×11.
- **Small bases:** a pre-war value under $0.5M a year (under $50k a month in the ban table) gets
  no multiple or percent. Charts leave out such index lines and say why; the goods table shows a
  dash; the ban table shows the change in dollars. Headlines rank only tiers with a usable base.
- **Ban headline:** compares the months after the ban with the same months of 2025, not with the
  12 months before, so the season does not count as an effect. The table shows how many months
  of data exist after the ban, and the seasonal comparison comes first.
- **EU and China chapter:** the four countries share one scale, two panels a row.
- **Comparison chapter:** a connected scatterplot (EU exports against exports to Russia, one point
  a year, log scales, equal-value line) replaces the "share of EU exports" ratio chart.
- **Colour:** blue is always the EU leg, orange the Russia leg; countries differ by marker, dash
  and name, not by colour (comparison and mirror charts).
- **Filters:** a line above each chart says which goods, prices and base it shows. On phones the
  filter bar no longer sticks to the top.
- **Labels:** tier charts are labelled at the line ends (no legend); the mirror chart labels each
  pre-war line; the event list drops its number badges; the intro explains 50 codes vs 49.
- **Map:** EU bands bow south, away from the Russia legs; bands under 1% of the year's largest
  band carry no number; value labels keep clear of the place dots.
- **Goods table:** the trend lines in one tier share a scale.
- **Type:** section headings use normal width and a lighter weight.

## 1.2.0 — 2026-11-19

### Changed: the detour only
- Removed direct EU-to-Russia and China-to-Russia flows from the hero map, the key-numbers table
  and the supplier chapter. The site now covers only goods that go through Kazakhstan,
  Kyrgyzstan, Uzbekistan and Armenia.

## 1.1.0 — 2026-11-19

### Changed after a design review (Tufte principles)
- **Hero:** a flow map replaces the two-leg diagram. Bands from the EU and from China to
  Kazakhstan, Kyrgyzstan, Uzbekistan and Armenia, from those four countries to Russia, and the
  direct flows to Russia, on one width scale for all years, with values on the bands.
  Base map: world-atlas 110m (Natural Earth), drawn with D3 and TopoJSON from cdnjs.
- **Key numbers:** an aligned table (2019–21 average, latest year, change) instead of sentences.
- **Ban chapter:** a supertable instead of 12 charts: for each country and flow, a monthly
  sparkline on its own scale, the averages before and after the ban in dollars, the change, and
  the change against the same months of 2025.
- **Share chapter:** column headers once; the comparison countries as a small table.
- **Which goods:** a supertable for one country and flow, all years, grouped by tier, with short
  plain names, each tier's use and the use of the two banned codes, with sources.
- **Words on the charts:** low points labelled on the mirror chart, notes in data gaps (Kazakhstan
  2020–2022, China to Armenia 2023–2024), short event labels at the top of event lines.
- **Labels:** the comparison charts are labelled at the line ends (no legend); end labels stay
  above the year axis.
- **Credibility:** the EU's +800% / +1,200% Kyrgyz figures now cite their original source,
  Regulation (EU) 2026/506, recital 34. The tier heading gives size and growth together.

## 1.0.0 — 2026-11-19

### Changed: headings state the finding
- Every chapter heading now states its finding. Headings with numbers are built from the data,
  so they stay true when the filters or the data change.
- New summary under the route diagram: EU and China direct exports to Russia, Kyrgyzstan's and
  Kazakhstan's exports to Russia against 2019–21, and the mirror gap above the pre-war level
  since 2022 (all 49 codes, USD).
- "Which goods" tooltips: what the goods are and what they are used for, with the source
  (EU List of Common High Priority Items, Feb 2024; Regulation (EU) 2026/506, recital 34).

## 0.10.0 — 2026-11-19

### Added: China as a supplier
- New module `src/chpl_trade/china.py` and chapter "China, not the EU, supplies most of these
  goods": EU-27 exports (Comext) and China's exports (Comtrade, as China reports) of the listed
  codes to Kyrgyzstan, Armenia, Uzbekistan, Kazakhstan and Russia, 2019–2025. Heading and finding
  are computed from the data and follow the filters.
- China's Comtrade data for Armenia in 2023–2024 is a reporting gap (a total of all goods near
  zero or absent): these years are missing.
- Ban chapter: a third column, each route country's monthly imports from China (as the country
  reports them; China's own monthly data in Comtrade ends in December 2024).
- Money above $1,000M is shown in billions.
- New Comtrade needs cost 8 calls with the shared client.

## 0.9.0 — 2026-11-19

### Changed: one shared UN Comtrade client
- New `src/chpl_trade/comtrade.py`. Modules no longer call Comtrade; they declare their needs
  (`needs.py`), and one `sync()` downloads only what is missing or newly revised, then every
  module reads from one local store (`data/raw/comtrade.sqlite`).
- Releases: one call per frequency for all reporters, at most once a day.
- Batching with an API key (read from `COMTRADE_KEY` or `.env`, which git ignores): many
  reporters, partners and codes and up to 12 periods per call, total rows only. Without a key the
  free preview API is used.
- Quota guard: a daily call counter stops before the limit; data already received is kept.
- `make plan` shows the calls a run would make; `make status` shows what is stored.
- The old download files were imported into the store (`legacy.py`), so nothing was downloaded
  again. A full run now needs 2 calls when nothing is new (before: about 500).
- Outputs are unchanged.

## 0.8.0 — 2026-11-19

### Added: listed goods as a share of all trade
- New module `src/chpl_trade/control.py` and site chapter "Listed goods as a share of all trade":
  the value of the listed goods as a percent of the value of all goods in the same flow.
  If all trade grows, the share stays flat; it rises only when the listed goods grow faster.
- Destinations: the four route countries (Kyrgyzstan, Armenia, Uzbekistan, Kazakhstan) and
  comparison countries (Georgia, Azerbaijan, Mongolia, all countries outside the EU).
  Flows: EU-27 exports (Comext) and each country's exports to Russia (Comtrade), 2019–2025.
- Layout: one row per country, the two legs in two columns, as in the ban chapter; one linear
  scale for each column. The goods filter applies.
- A first version compared listed goods with "similar goods" (other codes in the same 4-digit
  headings). It was replaced: many of those goods (laptops, smartphones) also went to Russia,
  and a few products decided the result.
- Not yet downloaded (daily Comtrade limit): Azerbaijan's and Mongolia's total exports to Russia.

## 0.7.0 — 2026-11-19

### Changed
- Ban chapter: a switch for the two banned codes or the other 47 codes, and one row for each of
  four countries (Kyrgyzstan, Armenia, Uzbekistan, Kazakhstan) with EU exports to the country and
  the country's exports to Russia side by side. Both charts in a row share one money scale; every
  tick shows its unit.
- Added Armenia's and Uzbekistan's monthly exports to Russia (Comtrade).
- A month counts as missing only when the reporter has not released it (Comtrade release list).
  A released month with no rows is zero trade.
- Removed the guiding questions and comment paragraphs from the ban chapter.
- Removed the "Data and method" section from the site.

## 0.6.0 — 2026-11-19

### Added: test of the April 2026 ban
- New module `src/chpl_trade/ban.py` and site chapter "Did the April 2026 ban work?".
  Monthly data: Comext (EU-27 exports, January 2024 to September 2026) and Comtrade
  (Kyrgyzstan's and Kazakhstan's exports to Russia, January 2024 to August 2026).
- Method: average monthly value in April 2025 to March 2026 (before) against May 2026 onwards
  (after); April 2026, the month of the ban, is left out. Control goods: the other 47 codes to
  Kyrgyzstan. Displacement: the two codes to eight neighbouring countries. Also compared with the
  same months of 2025. New files `ban_monthly.csv` and `ban_summary.json`.
- First result: EU exports of the two codes to Kyrgyzstan fell 89% (other codes −14%).
  EU exports of the same codes to Armenia rose 90%. Kyrgyzstan's exports of the two codes to
  Russia rose 87%.
- Kazakhstan did not report monthly data to Comtrade for March to December 2024. These months
  are missing, not zero.
- The regulation text (Regulation (EU) 2026/506) adds no wind-down rule for the two codes.

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
