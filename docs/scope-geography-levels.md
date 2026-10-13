# Scope: national, TL2 and TL3 geographies in the Observatory

*13 October 2026. Scoping note; nothing here is built yet.*

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

### 3.1 Boundary vintage does not match the panel codes

The boundary files in the data pack are the OECD 2020 shapefiles; the panel
uses TL2021 codes and, since the DF_LPR 2.4 switch, some later recodes.
Checked against the nine countries:

- United Kingdom: 229 TL3 codes in the panel, 115 in the shapefile. The
  panel's `UKC31`, `UKM01`, `UKN0A` style codes (ITL 2021) have no 2020
  geometry; the shapefile's `UKC11`, `UKL14` style codes have no panel rows.
  106 UK TL3 are `geo_fallback`.
- Germany: six Thuringia TL3 (`DEG0Q`–`DEG0V`) have no geometry; the panel
  gives them productivity.
- Italy: five Sardinia TL3 (`ITG2D`–`ITG2H`) likewise.
- Extra-regio `ZZ` codes have no territory (expected).

Resolution needed before TL3 mapping is useful for Britain: obtain the OECD
TL2021 (or 2024) territorial grid boundaries, which the OECD publishes with
its regional statistics, or build the UK ITL 2021 layer from ONS Open
Geography and the German and Italian recodes from Eurostat NUTS 2021. The
alternative, mapping the panel's `geo_fallback` rows to old codes by name,
loses the regions whose definitions changed. **This is the one dependency
outside the app.**

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

1. Source of TL2021 boundaries (OECD grid, ONS plus Eurostat, or accept the
   2020 geometry with gaps in the UK).
2. Which national indicators to expose: the full catalogue above, or the
   subset the profile reports use.
3. Whether the nine-country restriction stays. The panels cover 43 countries
   and the TL geometry covers all OECD members; the only cost of widening is
   boundary file size and the per-country projection list.
