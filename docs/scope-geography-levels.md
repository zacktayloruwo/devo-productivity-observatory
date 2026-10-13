# Scope: national, TL2 and TL3 geographies in the Observatory

*13 October 2026. Scoping note. The map, Overview, Productivity and Autonomy views follow all four geographies (see 6).*

The Observatory maps and charts OECD functional urban areas (FUAs) for nine
countries. This note scopes adding three more geographies, national, TL2
(large regions) and TL3 (small regions), with a geography selector in the top
bar, so that the productivity, growth and autonomy measures assembled by the
Devo Analysis pipeline can be mapped at every scale, including the national
and region-specific LAI and RAI scores. Section 1 reviews what that pipeline
now provides; sections 2 to 4 set out the design, the issues found and the
work.

## 1. Review of the Devo Analysis data assembly

Source: `devo_data_pack/analysis/PROJECT_PLAN.md`, `_data/processed/*_dictionary.md`,
`_data/xw/crosswalk_review.md`, `analysis/registration_log.md`, all dated
12–13 October 2026. R pipeline, scripts `_code/08*`, `09`, `11`, `12`, `13`, `14`.

### 1.1 What exists

| Panel | Unit | Size | Mapping-relevant content |
|---|---|---|---|
| `national_panel.csv.gz` | country × year, 43 countries, 1970–2024 | 2,365 × 260 | PDB productivity (`gdp_pw`, `gdp_ph`, `gdp_pc`, constant and current PPP) and the exact growth decomposition; IMF and OECD fiscal decentralization ratios; OECD tax autonomy; every LAI 2.0 item and aggregate (`lai_total` 0–37); the ten RAI components and `rai_total` (official population-weighted aggregation, corrected 12 Oct); the three dimension indices (`fiscal_dec_dj_z`, `administrative_dec_z`, `political_dec_z`, 1990–2018); WGI, ICRG and other QoG; regional dispersion of productivity (`rd_tl2_*`, `rd_tl3_*`) |
| `regional_panel_tl.csv.gz` | TL2/TL3 region × year | 58,192 × 107 | `lp_lpr` (GVA per worker, DF_LPR 2.4), `lp_gdp_q`, `gdppc_q_usdppp`, `pop_total`, `pop_density`, employment, ten sector shares, education, unemployment, gap to the national frontier, shift-share; **region-specific** `lai_*_reg` (0–1) and `rai_*_reg` (raw RAI points summed over tiers, 0–57) with their components; `eqi_reg`; national `lai_nat` and `rai_nat` repeated on every region |
| `regional_dispersion.csv.gz` | country × level × year | 1,667 × 24 | CV, Theil, Gini, P90/P10, frontier share, each with a `_gdp` twin |
| `fua_panel.csv.gz` | FUA × year, 545 FUAs | 12,568 × 59 | Productivity (**identical to the datapack the app uses today**: 4,815 overlapping FUA-years match exactly), GDP, labour market, `pop_fua`, municipal fragmentation (`lau_c`, `ln_lau_per100k_base`), state LAI, upper-tier RAI, national QoG |
| `fua_region_indices.csv.gz` | FUA × year, 1990–2018 | 36,647 rows | Region-specific fiscal, administrative and political indices for the region governing each FUA |
| `_data/xw/lai_region_tl.csv`, `rai_region_tl.csv` | region × year | 93k, 93k rows | The region-year LAI and RAI behind the panel; `xw_tl_lai.csv` records how each region got its LAI (`match_type`, share covered) |

Coverage for the nine Observatory countries (regions with productivity):

| Country | TL2 regions | TL3 regions | TL2 years | Notes |
|---|---|---|---|---|
| Canada | 14 | none | 1981–2024 | no TL3 productivity in DF_LPR |
| France | 19 | 101 | 2000–2023 | |
| Germany | 16 | 400 | 2000–2023 | six Thuringia TL3 recoded in 2021 (see 3.1) |
| Italy | 22 | 108 | 1995–2023 | five Sardinia TL3 recoded |
| Japan | 10 | 47 | 2009–2023 | no sector or EQI data |
| South Korea | 7 | 17 | 2000–2023 | |
| Spain | 20 | 60 | 2000–2023 | |
| United Kingdom | 14 | 229 (159 with productivity) | 1998–2023 | ITL 2021 recodes: 106 fallback codes (see 3.1) |
| United States | 51 | 179 | 1997–2023 | TL3 are BEA economic areas, not nested in states (see 3.2) |

LAI and RAI exist for every region of the nine countries (LAI: 1990–2020,
RAI: 1990–2018), except Berlin, Bremen and Hamburg, which LAI 2.0 does not
code.

### 1.2 Assessment

- **Sound and documented.** Every panel has a dictionary, keys are unique,
  the crosswalks were audited and rebuilt (the old ones coded Mexico as
  Montenegro and forced municipal-type countries to one type), and the
  registration log hashes each build. The R builds reproduce the earlier
  Python ones to 1e-9. The FUA productivity values are the same numbers the
  app shows today, so adding the other levels will not change the FUA views.
- **Scales differ by level and must be labelled.** `lai_nat` is 0–37 points,
  `lai_*_reg` is 0–1; `rai_nat` and `rai_total_reg` are raw RAI points, where
  a region's value sums every tier governing it (Bavaria 47 in 2018: Land 27
  + Regierungsbezirk 10 + Bezirk 10), so regional RAI can exceed any single
  tier's maximum and is not comparable to the app's current 0–1 national RAI
  (which the datapack rescaled from 0–30). The app should show raw points
  with the scale in the legend, and keep the 0–1 rescaling only where the
  profile report uses it.
- **Region-specific LAI is a population-share mix in the municipal-type
  countries** (Spain, Japan, France) and a country constant elsewhere
  (Italy, Korea), so a TL3 LAI map of Italy is uniform by construction. The
  `match_type` column says which; the map should state it in the legend note.
- **Vintages.** The regional panel moved to DF_LPR 2.4 on 13 October; every
  analysis result still rests on 2.0. For the app this only matters for
  reproducibility: the build should record the panel hash it read.
- **Two RAI series for FUAs** now exist: the upper-tier unit (`rai_*_reg_t1`,
  what the datapack carries) and the region-specific indices of script 14.
  The app can offer both, labelled.

## 2. Design

### 2.1 Geography selector

A fourth control in the top bar beside the country selector: **National ·
TL2 · TL3 · FUA**, carried in the URL as a path segment
(`#/map/GBR/tl3/2019?var=lp_lpr`). The default stays FUA so existing links
keep working (`#/map/GBR/2019` is read as FUA).

What each view does with it:

| View | National | TL2 / TL3 | FUA (today) |
|---|---|---|---|
| Map | Choropleth of the nine countries (scope "all countries" only; a single country is one polygon) | Choropleth of the country's regions; TL3 drawn inside TL2 outlines; all-nine scope available | unchanged |
| Overview | National KPIs and the regional dispersion summary (CV, Theil, frontier share for TL2 and TL3) | Region count, median and spread of productivity, share of national GDP, convergence gap | unchanged |
| Productivity | National productivity, growth decomposition, dispersion over time by country | Ranks, scatter (productivity vs population), distribution, growth, spread and mean, as now but over regions | unchanged |
| Autonomy | As now, plus the dimension indices and the IMF/OECD fiscal ratios by country | Region-specific LAI and RAI over time (small multiples or a selected region), map link | FUA-level LAI/RAI from the FUA panel |
| Sources | Adds the PDB, DF_LPR, DF_GDP, regional controls, QoG and crosswalk citations with the level's years | | |

The country selector keeps its meaning at every level; "All nine countries"
on the map is where the national level lives.

### 2.2 Indicators per level

A level-aware catalogue in `manifest.json` replaces the single `variables`
list. First cut:

- **National:** GDP per worker and per hour (constant and current PPP), GDP
  per capita, growth of each; LAI total and the eleven items; RAI total,
  self-rule, shared rule and the ten components; fiscal, administrative and
  political dimension indices; IMF expenditure, revenue and tax
  decentralization and vertical imbalance; OECD tax autonomy share; WGI
  government effectiveness and the four-indicator mean; regional dispersion
  (TL2 and TL3 CV, Theil, Gini, frontier share).
- **TL2 and TL3:** GVA per worker (`lp_lpr`), GDP per worker, GDP per capita,
  population, density, employment, unemployment and employment rates,
  tertiary share, gap to the national frontier, sector shares; region-specific
  LAI total, policy, fiscal, access, organisation, immunity; region-specific
  RAI total, self-rule, shared rule and the ten components; EQI (EU only).
- **FUA:** today's eight, plus population, LAU count and fragmentation, state
  LAI total, upper-tier RAI, and the region-specific fiscal, administrative
  and political indices.

### 2.3 Data layout

Same pattern as now, segmented by level and country so a view fetches only
what it shows:

```
data/national.parquet                       9 countries × 1970–2024, all national columns
data/tl2/cntry_iso3=<ISO3>/part.parquet     region × year, TL2
data/tl3/cntry_iso3=<ISO3>/part.parquet     region × year, TL3 (Germany ≈ 9,600 rows, 40 columns)
data/fua/cntry_iso3=<ISO3>/part.parquet     as now, with the new columns
data/dispersion.parquet                     country × level × year
data/geo/<ISO3>.topo.json                   one TopoJSON per country: objects national, tl2, tl3, fua
```

Estimated sizes: TL3 parquet 20–150 KB per country; TL2 under 20 KB; the
national file about 100 KB. Three DuckDB views (`tl2`, `tl3`, `national`)
join the `fua` view; queries stay in `src/lib/db/queries.ts`.

### 2.4 Boundaries as TopoJSON

TL3 nests in TL2 and TL2 in the country, so one topology per country with
shared arcs (topojson-server, then topojson-simplify with a vertex budget,
as the Atlas does) gives all three levels, consistent borders between them
and a single download. The FUA polygons join the same file as a fourth
object; they do not share arcs with the regions, which is fine. The app
decodes the object it needs with topojson-client and draws exactly as now
(the existing projections, insets, outlines and rewinding carry over; the
TL2 outlines already drawn today become the TL2 object). Size estimate per
country: 150–400 KB at TL3 detail, replacing today's GeoJSON plus admin files.

## 3. Issues found

### 3.1 Boundary source and the panel's grid (investigated 13 October 2026)

**No OECD source publishes TL2021 polygons.** The OECD Geographical
Definitions page offers the territorial grid (PDF) and the correspondence
table (XLSX) only. The OECD regional-statistics Dropbox cited on
GIS StackExchange holds "Regions - shapefiles 2020 - old" (the same
`OECD_TL2_shapefile` and `OECD_TL3_shapefile` already in the data pack); its
FUA link has been deleted. The Regions and Cities Atlas serves
`/cache-geometry/REGS/TL2.json` and `TL3.json`, but these are the same
pre-2021 vintage (`UKL14`, `ITG29`; no `UKC31` or `ITG2D`). The TL2024 grid
(April 2026) is published as a PDF of maps only.

**The panel is not on TL2021 for three countries.** It back-casts the OECD's
current grid to every year (all codes below carry data 2000–2023), so in each
year it is one partition, but not the TL2021 one:

| Country | Panel TL3 units | Without a 2020 OECD polygon | What they are |
|---|---|---|---|
| United Kingdom | 182 (122 TL2021 codes kept + 60 new) | 60 new codes (`UKC31`…`UKM34`) and 7 NI recodes | ITL 2025: the 60 replace 60 TL2021 units whose boundaries changed. `UKN0A`–`UKN0G` are TL2021 "recoded" units with the same areas as the 2020 polygons `UKN10`–`UKN16` |
| Germany | 400 | 6 (`DEG0Q`–`DEG0V`) | Thuringia's post-2021 districts, replacing 7 TL2021 codes (`DEG04`, `DEG0B`, `DEG0F`, `DEG0H`, `DEG0I`, `DEG0N`, `DEG0P`) |
| Italy | 107 | 5 (`ITG2D`–`ITG2H`) | Sardinia's 2016 provinces; the 2020 file has the eight old ones (`ITG25`–`ITG2C`), and the boundaries changed |
| Others (CAN, ESP, FRA, JPN, KOR, USA) | as in 1.1 | 0 | Every unit with data has a 2020 OECD polygon |

The panel also files 46 four-character UK codes (`UKC3`, `UKM0`, …) as TL3 and
`UKI7` as TL2. They carry only derived and national columns (ROPI GVA,
national LAI/RAI, QoG), not productivity or population; they are ITL2-level
artefacts of the code mapping and are excluded from the TL3 partition. They
should be reported to the Devo Analysis pipeline (script 09).

**Consequence.** A 1:1 match between data and polygons in every year is
possible with the OECD 2020 polygons alone for six countries, and for the
others with these additions:

- Northern Ireland: 7 polygons renamed from the OECD 2020 file (exact; no new
  source).
- Sardinia: 5 polygons, Thuringia: 6, United Kingdom: 60, which no OECD
  source provides. The official sources for those units are Eurostat GISCO
  (NUTS 2021 and NUTS 2024, the EU's own release, which the OECD's European
  TL grid follows) and the ONS (ITL3 2025, codes `TLxxx` = OECD `UKxxx`).

Mixing sources along a seam (an ONS polygon beside an OECD one) leaves
slivers and breaks shared arcs. For the three affected countries the clean
option is to take the whole country's TL3 from one source (ONS ITL3 2025 for
the UK; GISCO NUTS 2024 for Germany and Italy) and derive TL2 by dissolving
TL3, keeping the OECD 2020 polygons for the other six.

**Cross-time topology.** Because the panel back-casts one grid per country,
each country currently needs one era. The TopoJSON build should still key
polygons by (code, valid-from, valid-to) and check, for every country,
level and year, that the codes with data equal the polygons valid that year,
so that a future panel with genuine grid changes (or the TL2021 codes, if the
pipeline is ever switched back) adds an era whose unchanged units reuse the
existing arcs.

### 3.2 US TL3 do not nest in TL2

US TL3 are BEA economic areas; 34 of 179 cross state lines and their parent
is `USA_TL3`, not a state. For the US the TopoJSON has TL2 and TL3 as
independent objects and the map draws TL3 without TL2 outlines (or with
them, overlapping). Everywhere else nesting holds and shared arcs apply.

### 3.3 Scale and comparability of the autonomy indices

Covered in 1.2: raw points at national and regional level, 0–1 only where the
report uses it; `match_type` shown for regional LAI. The quantile legend
handles any scale, but the inspector and tooltips must name the units.

### 3.4 Canada has no TL3 productivity

TL3 for Canada is population only. The TL3 option should say so rather than
show a blank map.

### 3.5 Years

National series run 1970–2024, regional 1995/2000–2023, autonomy to 2018 or
2020. The year slider already follows the data; the Productivity snapshot
year selector will need per-level year lists.

## 4. Work plan

| Step | Work | Effort |
|---|---|---|
| 1 | Boundaries: TopoJSON build per country (`tools/topology.mjs` adapted from the Atlas), fed by R from the OECD shapefiles; resolve 3.1 by sourcing TL2021 geometry | 1–2 days, plus the geometry source |
| 2 | Data: extend `build_data.R` to read the three panels and dispersion, write the level × country Parquet files, the level-aware indicator catalogue and years | 1 day |
| 3 | App: geography selector, routes (`/<level>/`), level-aware queries and the map (object choice, TL2 outlines over TL3, national choropleth in the all-countries scope) | 2 days |
| 4 | Views: Overview, Productivity and Autonomy at national and regional level; Sources additions; text rows in `app_text.csv` for every new passage | 2–3 days |
| 5 | Checks: coverage table per level and country, spot checks against the technical reports, build and deploy | 1 day |

About seven to nine working days in total. Steps 2 to 5 can start on the
2020 geometry (every country but the UK recodes is complete) while the
TL2021 boundaries are sourced for step 1.

## 5. Decisions needed

1. ~~Source of TL2021 boundaries~~ Decided 13 October: OECD TL2021, nine
   countries. Superseded by 3.1: OECD publishes no TL2021 polygons, and the
   panel is on the current grid for GBR, DEU and ITA. Needs a decision on
   the source for those three countries' polygons.
2. Which national indicators to expose: the full catalogue above, or the
   subset the profile reports use.
3. Whether the nine-country restriction stays. The panels cover 43 countries
   and the TL geometry covers all OECD members; the only cost of widening is
   boundary file size and the per-country projection list.

## 6. Built (13 October 2026)

- Boundaries: ONS ITL3 2025 (GBR, 182 units), GISCO NUTS 2024 (DEU 400, ITA
  107), OECD 2020 (CAN, ESP, FRA, JPN, KOR, USA). One TopoJSON per country
  with national, TL2 and TL3 objects; TL2 and national dissolved from TL3
  except in the USA. Polygons carry validity years; one era per country today.
- Data: `tl2` and `tl3` Parquet per country, `national.parquet`, a
  level-aware indicator catalogue in the manifest. The build checks that every
  region-year with data has exactly one polygon valid that year and stops
  otherwise. Dropped: 8 extra-regio codes and 47 UK index-only codes (listed
  in the build log; reported to the Devo Analysis pipeline as a panel issue).
- App: geography selector in the top bar (National, TL2, TL3, FUA; Sources
  and About open the map at that level, the other views stay put), map, legend, hover box, inspector and
  CSV export at every level; TL2 borders drawn over TL3 maps; a notice where
  a country has no data at a level (Canada, TL3).
- Views at every level (section 2.1). Productivity at TL2/TL3 runs the FUA
  sections over regions (`lp_lpr`, constant 2020 prices; the coefficient of
  variation is computed across regions, where the FUA one is the OECD's); at
  national level it shows GDP per worker and per hour, the decomposition of
  GDP per capita growth into GDP per worker and persons employed per head
  (log points, exact), and `rd_tl2_cv` / `rd_tl3_cv` over time. Overview at
  TL2/TL3: region count, median, P10/P90 and their ratio, coefficient of
  variation, median gap to the frontier region and the frontier itself, with
  the gap and P90/P10 over time by country; at national level the KPIs and
  the latest dispersion of every country. Autonomy at TL2/TL3: every
  region's LAI, LAI fiscal, RAI and RAI fiscal autonomy (raw points) drawn
  faint, the median dashed and a selected region (`?reg=`) in red, with a
  link to the map; at national level the dimension indices and the IMF/OECD
  fiscal ratios are added. Canada at TL3 gets a notice, not empty charts.
- Not built: Overview "share of national GDP" for regions (no regional GDP
  share in the TL panel), Theil and Gini dispersion (only the CV and the
  frontier share are in `national.parquet`), FUA-level LAI/RAI from the FUA
  panel, and the Sources additions. 66 TL3 regions with data have no name in
  the panel (60 UK ITL fallback codes, 6 recoded Thuringia districts); the
  views show their codes.
