# Changelog

All method changes are listed here with a date, so that readers can see why a number changed.

## 1.20.0 — 2026-11-23

### Changed after a full design review (Tufte principles)
- **One test for every enforcement step (Part 4, new chart):** blacklist waves, EU/US/UK steps aimed at
  one country (including the April 2026 ban) and the governments' own statements and measures all get
  the same test as the designation-wave study: sales to Russia in the 6 months after against the 6
  before, net of the other two countries, against all months without a blacklisting. The page computes
  it from the monthly flows; it gives exactly the Python study's result for all 31 waves. Steps that
  hit all three countries, steps before September 2022 and steps with under 3 months after are left
  out and named. The responses table now uses this test, not the raw before/after change (which gave
  +542% after a statement in April 2022, mostly the invasion).
- **Hero map:** Hong Kong is drawn as a band (in 2023 it shipped the three countries more than the
  EU). The key-numbers table uses one notation (×) and says it stays on the latest year; the note
  under it is one sentence and a small table.
- **Overview:** the supplier panels come first in Part 1 and add each country's exports to Russia.
- **EU member states:** a bar of the latest year on one scale beside each own-scale sparkline; states
  under $1M a year are one row.
- **Both legs, one point a year:** three small scatterplots on one scale, every year labelled.
- **Mirror checks:** the EU and China lines are in one panel per country, with both pre-war levels;
  the figures are in a table.
- **Share of all trade:** one supertable for route and comparison countries, on one scale.
- **Against similar goods:** each panel plots battlefield goods' growth divided by other goods'
  growth (×1 = alike); the summary is a dot plot, the table is folded.
- **Price index:** small multiples on a log scale; "without bearings" lines only where they differ.
- **Estimate:** a linear dollar scale (on the log scale, a $0.8M–$198M range looked wider than
  $229M–$869M); Russia's records of Kyrgyz sellers (Jan–Oct 2023) on the same chart.
- **Encodings:** a dash no longer marks a country (Uzbekistan has a triangle marker, Hong Kong a
  lighter tint); the US list is black, not purple next to the EU's blue; response marks are two shapes
  (said, did), not five colours; case marks lose the dashed source ring (the table has it); the
  "in weapons" badge is neutral.
- **Prose:** figures moved from ledes and readouts into small tables (key numbers, mirror, ban,
  estimate, suppliers, member states).
- **Phones:** the responses table shows one card a row; the price chart keeps short names.

## 1.19.0 — 2026-11-23

### Added
- **Which EU countries ship the goods (Part 1):** EU exports of the listed goods to each route
  country by member state, from Eurostat Comext (one query a route country, no Comtrade calls). The
  27 member states add up to the EU-27 totals (a test checks this). A table with sparklines gives
  every member state's full 2019–2025 series, grouped into totals, the five border states and the
  other 22, with the pre-war average, the peak, the latest year, the rise to the peak, the change
  since the peak and the number of court cases beside each line. Shipments from the five member states
  on the border with Russia or Belarus (Estonia, Finland, Latvia, Lithuania, Poland) nearly
  quadrupled from the pre-war average to 2023 and then fell by more than half by 2025; shipments
  from the rest of the EU doubled and then held steady. The route countries' own records by member
  state are not compared, because importers record the country of origin and the EU the member
  state that ships; the chapter says why, with the numbers.
- **EU court cases that name the route (Part 4):** a curated record (`data/cases.csv`) of 12
  enforcement steps in 10 cases in seven member states (arrests, charges, convictions, fines and
  investigations) where the authorities name Kazakhstan, Kyrgyzstan or Uzbekistan as the way to
  Russia. Each row gives the source and whether we read the authority's or court's own page (4
  steps) or a news report or law-firm summary (8 steps). A timeline and a table show them; the
  chapter compares the case countries with the largest shippers.
- Download files: `eu_members.csv`, `eu_members_imports.csv`, `eu_enforcement_cases.csv`.

## 1.18.1 — 2026-11-23

### Fixed
- **Chart labels:** the estimate range plot and the designation-effect strip used label and
  gridline styles that applied only to the price plot, so their labels were black on the dark
  background and their gridlines did not show. All three plots now share the styles.
- **Log-scale axes:** labels below 1 (0.1, 0.01) were dropped on wide scales, so the code explorer's
  axis stopped at $1M while some values were near $1k. The axis now labels every power of ten.
- **Supplier charts:** the axis read "$1bn, 100, 10, 1"; it now reads "$1bn, 100M, 10M, 1M".
- **Government responses:** each country's bars now state their scale (the tallest month).
- **Designation-effect strip on phones:** more scale labels fit (−90%, 0%, +300%).

## 1.18.0 — 2026-11-23

### Added
- **Payment channels against trading firms:** the designation-wave study now splits the
  organisations into payment channels (banks, payment and processing firms, brokers, crypto
  exchanges and issuers, by name) and trading and other firms. In Kyrgyzstan, waves with a payment
  channel: median +52% (5 waves); trading firms only: +21% (9). Single bank designations (Keremet
  Bank, Rosinbank) were not followed by falls; the two falls (−65% each) followed the August and
  October 2025 actions against the whole A7A5 network under several lists, which overlap and count
  as one episode. Payment-channel waves are ringed in the chart; a test checks the classification.

## 1.17.0 — 2026-11-23

### Added
- **Do designations work? (Part 4):** 31 months with designations of the country's organisations
  (waves), from September 2022, each compared with all other months of the same country: the change
  in listed exports to Russia in the 6 months after against the 6 months before, minus the other two
  countries' change. Kazakhstan: median −29% after a wave against +23% in other months; Kyrgyzstan:
  +29% against +12%, but −65% after August and October 2025.
- **English names** for the 100 ten-digit lines in the code explorer (our translation of the
  bureau's Russian text, which shows on hover); data/hs10_en.csv.
- **Tests:** two more (17 in all).

### Fixed
- **Weapons link:** page numbers are now the report's printed pages (they were one too low).
- **Government responses:** statements are given as "Says…", not as facts; the headline says
  "in this record"; the text says the record is a selection and how the numbers run.

## 1.16.0 — 2026-11-22

### Added
- **Government responses (Part 4):** 14 dated statements and measures of Kazakhstan, Kyrgyzstan and
  Uzbekistan (promises, own measures, bank steps, statements that play down or reject sanctions),
  each with its source, on the monthly exports to Russia, with the change in the 6 months after.
  Curated in data/responses.csv; one measure known only from a Ukrainian intelligence report is
  marked so.
- **Link to weapons:** part types found in Russian missiles and drones by IISS and Conflict
  Armament Research (2025), with pages, linked to 12 codes (data/weapons.csv). Shown in the code
  explorer and as a mark in the goods table. The part-to-code links are ours.
- **Kazakhstan's 10-digit lines:** the statistics bureau's 2024, 2025 and 2026 files at 10 digits;
  the explorer shows Kazakhstan's exports to Russia by 10-digit line with the price per kg. The
  lines add up to the 6-digit totals.
- **Tests:** four more (15 in all).

## 1.15.0 — 2026-11-22

### Fixed
- **Designations:** only listings under Russia-related programmes count (not terrorism, Global
  Magnitsky, Iran, North Korea or organised crime; not the BIS Unverified or Denied Persons lists;
  BIS Entity List additions since 24 February 2022 count), and only organisations whose listed
  countries are at least half Kazakhstan, Kyrgyzstan or Uzbekistan (a Russian bank with a branch in
  Kazakhstan is left out). The OFAC programme is now kept. 79 organisations, not 95; the list gives
  any other country ("also listed with").
- **Comext freshness:** a saved Comext file is downloaded again when Eurostat has updated the
  dataset since it was saved; ECB rates after 7 days, sanctions lists after 30 days. The page gives
  the date of the Eurostat data.

### Changed
- **Hero caption** gives Hong Kong's shipments (not on the map), so the key numbers add up.
- **Events:** three more (EU 19th package, Kyrgyzstan's suspension of 50 companies, EU 21st
  package); a window with fewer than 3 months after an event says so.
- **Part 5** names Hong Kong as a known gap of the ceiling.
- **Shorter headlines** for the tiers and ban chapters.

### Added
- **Tests:** tests/test_consistency.py (11 checks that numbers agree between files and chapters;
  no network). Run with `make test`.

## 1.14.0 — 2026-11-22

### Added
- **Part 6, code explorer:** any of the 49 codes on one panel, for Kazakhstan, Kyrgyzstan and
  Uzbekistan: EU, China and Hong Kong supply and exports to Russia (2019–2025, one log scale), the
  importers' records against the EU's and China's exports, price per kg on each leg, and for the
  two banned codes the April 2026 ban by month. The codes in the goods table open it.
  - Mirror ratios for one code: only where the supplier shipped at least $100k; over 999% shown
    as ">999%"; a note that the two sides often record one good under different codes.
  - "Nearer EU or China price" is not decided where a weight is estimated.
  - Checked: the sums over all 49 codes match the chapter totals for 2025 (18 flows).
- **Site data:** the route countries' imports from China by code (from the store, no new calls).

## 1.13.0 — 2026-11-22

### Fixed
- **Part 5 mixed two measures.** KSE's $98M for Kyrgyzstan (January–October 2023) counts sales by
  Kyrgyz companies in Russia's customs records, mostly of goods shipped from China and Hong Kong:
  by country of dispatch, Kyrgyzstan is not in KSE's top ten (the tenth is $75M), and KSE says its
  data do not include all trade inside the EAEU. The "times 3–4" factor built on it is removed from
  the physical-route range. Part 5 now gives two measures: through the country (from the record to
  the record plus missing imports; Kyrgyzstan 2025: $15.8M–$131M), and sold by the country's
  companies (Kyrgyz companies: $98M, January–October 2023).
- **Cross-checks:** the KSE row says that it is not the same measure; the chapter headline no
  longer says that Kyrgyz reports undercount.

## 1.12.0 — 2026-11-22

### Added
- **Part 5, how much probably reached Russia:** one range a country and year (2022–2025). Low end:
  the country's record of exports to Russia; for Kyrgyzstan, times 3 (Russian customs records show
  3.8 times more for January–October 2023, KSE; KSE's Q3 2026 tracker gives 3–4). High end: the
  larger of the record times 4 (Kyrgyzstan) and the record plus the shipments missing from the
  country's import records above its pre-war gap (EU and China legs), a ceiling. The price-per-kg
  split is given where weights cover at least half of the value. 2025, Kyrgyzstan: $47.4M–$131M
  against $15.8M recorded. The key numbers at the top point to it.

## 1.11.0 — 2026-11-22

### Changed after a content review
- **Uzbekistan in every chapter:** legs, comparison, tiers, goods, the EU mirror check and the key
  numbers (Uzbekistan's imports from the EU: 1 Comtrade call).
- **Four parts and a contents list:** what moved; how good the records are; tests; enforcement;
  then the cross-checks. The data dates are under the title.
- **Key numbers:** the three countries' recorded exports to Russia as a share of what the EU, China
  and Hong Kong recorded as shipped to them (2025: 9%), and the China mirror gap.
- **Headlines:** the tiers headline leads with growth and gives the largest tier's own multiple;
  the mirror headlines use the fall in proportion to the pre-war ratio; the events text uses the
  largest fall beyond the comparison and the largest fall in dollars, not the largest percentage.
- **Price per kg:** the share priced nearer EU goods is also given with China's prices from the
  importers' records (2025: Kyrgyzstan 72% against 71%, Kazakhstan 23% against 27%).
- **Cross-checks:** the European Commission's −32% (ours −32%), CISES's Kazakhstan figures, and
  Kharon's China–Kyrgyzstan gap (ours $22.0bn against $4.81bn).

## 1.10.0 — 2026-11-21

### Added
- **Designations:** organisations in Kazakhstan, Kyrgyzstan and Uzbekistan on the US OFAC, US
  trade (with BIS), EU financial and UK sanctions lists since 24 February 2022 (95), from
  OpenSanctions (CC BY-NC 4.0), next to each country's monthly listed exports to Russia.
  Organisations only. OFAC gives no dates: there the date is when OpenSanctions first saw the
  entry. The EU export-control list (Annex IV) is not in the EU file.
- **Hong Kong as a supplier:** its exports of the listed goods to the three countries. In 2023 it
  shipped more to Uzbekistan than China did, mostly chips.
- **Ban chapter:** price per kg of 8517.62 before and after the ban, on each leg.
- **Comtrade:** monthly weights from April 2025, and Hong Kong's trade (7 calls).

### Changed
- The supplier gap rule uses the median of the other years, not the mean, so one large year does
  not make normal years look like gaps.

## 1.9.0 — 2026-11-21

### Added
- **Price per kilogram:** for the largest listed codes to Russia, the price per kg from the EU
  (Comext), from China and to Russia (Comtrade), with a year switch and a price index (the value to
  Russia divided by the same kilograms at EU or China prices). Codes under $100k a year to Russia
  are left out; hollow dots mark weights that the reporter estimated.
- **Comtrade store:** every download now keeps net weight and quantity with their "estimated"
  flags. A module can declare weight needs; a stored value without a weight is downloaded again
  only when its weight is needed (the first time: 1 call for both legs and 7 years).

## 1.8.0 — 2026-11-21

### Added
- **Mirror check, China leg:** each route country's recorded imports of the listed goods from
  China, divided by China's recorded exports to it, against the country's pre-war ratio
  (Kazakhstan: 2019 only). One line also gives all goods for Kyrgyzstan (2025: China $22.0bn,
  Kyrgyzstan $4.81bn). Kyrgyzstan's ratio already fell in 2021, so its pre-war level is low and
  its excess gap is probably too small.

### Fixed
- Kazakhstan's 2020–2022 imports from China have a total but no product rows: the listed goods
  for those years are missing, not zero.

## 1.7.0 — 2026-11-21

### Added
- **Excess growth:** the listed goods against the other goods of chapters 84, 85 and 90 (and of
  the same HS4 headings), on both legs, for Kazakhstan and Kyrgyzstan (EAEU), Uzbekistan, and
  Georgia, Azerbaijan and Mongolia (EU leg only; their listed exports to Russia are too small).
  Results with and without bearings (8482) are shown as equals: the sign of the result to Russia
  depends on them. Aircraft (88) are not in the control, because single sales move it.
- **Sanctions events, 2023–2025:** for 5 dated events, the 6 months after against the 6 months
  before, with three questions (fall, neighbour codes, other countries). The comparison is the
  other route countries, or EU exports to Türkiye, the UAE, Georgia and Azerbaijan.
- **Ban chapter:** a line on the other codes of headings 8457 and 8517.
- **Kazakhstan 2024 monthly:** from Kazakhstan's statistics bureau (Comtrade has only Jan–Feb).
  The bureau's final 2024 figures are 3–5% above Comtrade's earlier ones for Jan–Feb.
- **Report:** reports/Detour data sources and methods.md.

### Fixed
- The ban module read every stored code; it now reads only the listed codes, so new HS4 totals
  in the store cannot be counted twice. Its results did not change.
- A released month with no rows for any of 25 headings (Kazakhstan's imports, 2021–2022) is now
  missing, not zero.

## 1.6.0 — 2026-11-19

### Changed after a content review
- **Peak, then the latest year:** the hero, comparison and mirror headlines and the key-numbers
  table now show the war-time peak next to 2025. Before, they compared only 2025 with the pre-war
  level, which hid that both routes peaked in 2022–23 and then fell, and that the mirror gap closed by 2025.
- **Armenia removed:** the site covers Kazakhstan, Kyrgyzstan and Uzbekistan only.
- **Ban chapter:** a new line gives Kyrgyzstan minus Kazakhstan (no ban) for each leg, against the
  same months of 2025.
- **Not added:** events of December 2023 (US secondary sanctions, EU "no Russia" clause). Monthly
  data for 2022–23 show that the fall started in mid-2023, so the charts would suggest a cause
  that the data do not show.

## 1.5.0 — 2026-11-19

### Changed after a fourth design review (Tufte principles)
- **Share chapter:** all eight panels share one scale. Before, the EU column ran to 10% and the
  Russia column to 5%, so Kazakhstan's 2.3% to Russia looked higher than its 3.3% from the EU.
- **EU and China panels:** tick labels only at 10, 100 and $1bn.
- **Cross-checks:** whole percents; "Match" only within 2 points of the published figure,
  otherwise "Close (n points lower/higher)".
- **Mirror chart:** the pre-war lines are drawn in the leg colour, so they do not look like grid.

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
