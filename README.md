# The Devolution-Productivity Observatory

A static web app presenting the labour productivity of OECD functional urban
areas (FUAs) and regions, and the autonomy of local and regional government,
in sixteen OECD countries: Australia, Belgium, Canada, Finland, France,
Germany, Italy, Japan, the Netherlands, New Zealand, Norway, South Korea,
Spain, Sweden, the United Kingdom and the United States. It is the interactive
counterpart of the country profile documents (`profile.qmd` in the
`devo_data_pack` project) and reads the same common database as the Devo
Analysis pipeline.

**Site:** https://zacktayloruwo.github.io/devo-productivity-observatory/

## Views

| View | What it shows |
|---|---|
| Overview | The profile's FUA summary table (2009, 2014, 2019, latest), reference-year KPIs, national GDP per worker by country |
| Productivity | Ranked FUAs (top, middle, bottom ten), productivity against population, R² by country, distribution by country, change over 2004–2019 (CAGR), percentile spread and coefficient of variation, mean productivity by country. The snapshot year can be changed. |
| Autonomy | Local Autonomy Index and Regional Authority Index, total and fiscal scores, step charts by country |
| Map | Choropleth at four geographies, chosen in the top bar: **National** (every country at once), **TL2** and **TL3** (OECD large and small regions) and **FUA**. National indicators include productivity and growth, LAI and RAI, the fiscal, administrative and political decentralization indices, IMF and OECD fiscal ratios, quality of government and regional dispersion; TL2/TL3 indicators include productivity, GDP per capita, gap to the frontier region, population and labour market, region-specific LAI and RAI, and EQI; FUA indicators are productivity, GDP, population, density, dependency ratio and patents. One country or all nine, year slider, inspector with the unit's time series, quantile classes pooled across years |
| Sources | Every source with its years of coverage for the country, how the series are combined, full citations |

The country is chosen in the top bar; the URL hash carries every selection
(`#/map/FRA/2019?var=gdppc_usdppp&sel=FR001F`), so any view can be linked.
Every chart has a table twin and a CSV download. Light and dark themes.

## How it works

- **Svelte 5 + TypeScript + Vite**, no server. Charts are Observable Plot;
  the map is SVG with d3-geo and d3-zoom.
- **DuckDB-WASM** queries Parquet files over HTTP. The FUA table is segmented
  by country in Hive layout (`data/fua/cntry_iso3=USA/part.parquet`, 17–128 KB
  each) and read through one view with `hive_partitioning = true`, so a
  country-scoped query touches only that country's file and the cross-country
  comparisons read them all. National, LAI, RAI and source tables are small
  single files. All SQL lives in `src/lib/db/queries.ts`.
- **Regional boundaries** are one TopoJSON per country
  (`data/geo/regions/<ISO3>.topo.json`, objects `national`, `tl2`, `tl3`) plus
  a light all-countries file. TL2 and the national outline are dissolved from
  TL3, so the levels nest and share every border (the United States, whose
  TL3 economic areas cross state lines, keeps separate state polygons). The
  OECD publishes no polygons for its current grid, so each country's TL3
  comes from one official source that reproduces the panel's codes exactly:
  ONS ITL3 January 2025 (United Kingdom), Eurostat GISCO NUTS 2024 (Belgium,
  Finland, Germany, Italy, the Netherlands, Norway, Sweden) and the OECD 2020
  regional boundaries (the other eight). Every polygon
  carries its validity years; the data build fails unless every region-year
  with data has exactly one polygon valid that year, and a later grid change
  adds a new era whose unchanged units reuse the existing arcs.
- **FUA boundaries** are one simplified GeoJSON per country (`data/geo/<ISO3>.geojson`),
  fetched only when the map is opened for that country. Each country is drawn
  on its own projection (Lambert conformal conic with the country's customary
  parallels; transverse Mercator for Great Britain) and parts far from the
  mainland (the French overseas departments, the Canary Islands, Okinawa;
  Alaska and Hawaii should the data include them) appear in fixed inset
  panels that neither pan nor zoom (`src/lib/geo/projections.ts`). The
  selected country's national boundary (the `national` object of its
  regional TopoJSON, merged from the same polygons as its regions, so it
  coincides with their outer edges) and, for the federal countries, its first-tier subnational
  governments (OECD TL2 regions: provinces and territories, states, Länder,
  Spanish autonomous communities, Italian regions, French régions, UK nations, in
  `data/geo/admin/<ISO3>.geojson`) are drawn as outlines over the FUAs. Add a
  country to `admin_countries` in the build script to overlay its regions.
- Only DuckDB's single-threaded bundles are shipped: GitHub Pages cannot send
  the cross-origin isolation headers the threaded bundle needs.

## Layout

```
data-prep/build_geography.R  regional boundaries: sources, eras, TopoJSON (via tools/topology.mjs)
data-prep/build_data.R   selects the app's tables from the devo_data_pack common database (_data/db) into public/data/;
                         checks every region-year against the polygons
public/data/             manifest.json, countries/nat/lai/rai/sources/national.parquet,
                         fua|tl2|tl3/cntry_iso3=<ISO3>/part.parquet,
                         geo/<ISO3>.geojson (FUA), geo/regions/<ISO3>.topo.json
src/App.svelte           shell: top bar, left rail, hash-routed views
src/routes/              OverviewView, ProductivityView, AutonomyView, MapView, SourcesView, AboutView
src/lib/db/              DuckDB-WASM engine (db.ts), manifest bootstrap, queries
text/app_text.csv        every descriptive passage, editable; tools/text_compile.mjs compiles it
src/lib/text/            t() and the compiled strings; components/Text.svelte renders the markup
src/lib/charts/          Plot settings, the cross-country line chart
src/lib/geo/             GeoJSON loading (ring rewinding for d3), projections and insets, land underlay
src/lib/components/      ChartCard, PlotChart, RankTable, MapCanvas, TimeSlider, Legend, ...
.github/workflows/       builds and deploys to GitHub Pages on push to main
```

## Editing the text

Every descriptive passage the site shows (chart introductions and footnotes,
the Overview note, the Sources and About prose, KPI labels, map wording)
lives in `text/app_text.csv`, one row per passage: `key`, `text`, `context`
(where it appears), `notes`. Open it in Excel or a text editor, edit the
`text` column, save as CSV (UTF-8), and build. Placeholders such as
`{country}`, `{year}` or `{possessive}` are filled by the app and must be
kept. Light markup: `**bold**`, `*italic*`, `` `code` ``,
`[label](https://url)`, and `[label](view:map)` for a link to a view of the
current country. Keep each row to one paragraph; a passage of two paragraphs
is two rows.

`npm run text` compiles the table to `src/lib/text/generated/strings.json`
(committed) and fails if a key the code uses is missing, a key is
duplicated or a row has no text; `npm run dev`, `npm run build` and
`npm run check` run it first, so editing the table and pushing is enough to
change the live site.

## Developing

```bash
npm install
npm run dev        # http://localhost:5173/devo-productivity-observatory/
npm run check      # svelte-check
npm run build      # -> dist/
npm run preview    # serve dist/
```

### Rebuilding the data

Needs R with `dplyr`, `haven`, `arrow`, `sf`, `rmapshaper`, `geojsonsf` and
`jsonlite`, Node with the dev dependencies (`mapshaper`, `topojson-server`),
and the `devo_data_pack` project: its common database `_data/db/` and the
OECD boundaries under `_data/oecd_boundaries/`. The common database is written
by the Devo Analysis pipeline (`00 PREP DATA.R`, then `31 build common
database.R`), which does all OECD fetching with one shared cache; this build
only selects the app's countries and columns and downloads no data. To add a
country or refresh a series, rebuild the database there first. The ONS and
GISCO boundary files are downloaded into `data-prep/cache/` (not committed) on
first run.

```bash
npm run data        # build_geography.R, then build_data.R
```

The build drops region codes outside the grid and lists them: extra-regio
codes (`…ZZ`, no territory) and 47 UK codes in the panel that carry only
national and index columns (ITL2-level codes filed as TL3, and `UKI7` filed
as TL2).

The script writes `public/data/` and records the build date in
`manifest.json`; data URLs carry it as a cache-buster.

## Using the data

Everything the site shows is in `public/data/` (served at `data/`) as Parquet
and GeoJSON, readable with DuckDB, Arrow, pandas or R directly from the site:

```sql
SELECT cntry_iso3, year, avg(labprod_usdppp) AS mean_lp
FROM read_parquet('https://zacktayloruwo.github.io/devo-productivity-observatory/data/fua/cntry_iso3=*/part.parquet', hive_partitioning = true)
WHERE labprod_usdppp IS NOT NULL GROUP BY 1, 2 ORDER BY 1, 2;
```

## Sources

OECD Regional, Rural and Urban Statistics (FUA economy, demography, density,
patents) and the OECD Productivity Database, retrieved from the OECD Data
Explorer SDMX API; the Local Autonomy Index 2.0 (Ladner, Keuffer and
Bastianen, 2021); the Regional Authority Index v.3 (Hooghe, Marks, Schakel et
al., 2021); OECD FUA boundaries. Full citations are on the site's Sources view.

## Credits and citing

This project was created by Alan Harding, Sían Peake-Jones, and Zack Taylor.

Harding, Alan, Sían Peake-Jones, and Zack Taylor. *The Devolution-Productivity
Observatory.* https://zacktayloruwo.github.io/devo-productivity-observatory/
