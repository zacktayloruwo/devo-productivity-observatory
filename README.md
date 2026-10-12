# The Devolution-Productivity Observatory

A static web app presenting the labour productivity of OECD functional urban
areas (FUAs) and the autonomy of local and regional government in nine
countries: Canada, France, Germany, Italy, Japan, South Korea, Spain, the
United Kingdom and the United States. It is the interactive counterpart of the
country profile documents (`profile.qmd` in the `devo_data_pack` project) and
draws every figure from the same data pack.

**Site:** https://zacktayloruwo.github.io/devo-productivity-observatory/

## Views

| View | What it shows |
|---|---|
| Overview | The profile's FUA summary table (2009, 2014, 2019, latest), reference-year KPIs, national GDP per worker by country |
| Productivity | Ranked FUAs (top, middle, bottom ten), productivity against population, R² by country, distribution by country, change over 2004–2019 (CAGR), percentile spread and coefficient of variation, mean productivity by country. The snapshot year can be changed. |
| Autonomy | Local Autonomy Index and Regional Authority Index, total and fiscal scores, step charts by country |
| Map | Choropleth of any FUA indicator (productivity, GDP, GDP per capita, GDP share, population, density, dependency ratio, patents) for any year, one country or all nine, with a year slider, a per-FUA inspector and quantile classes pooled across years |
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
  comparisons read all nine. National, LAI, RAI and source tables are small
  single files. All SQL lives in `src/lib/db/queries.ts`.
- **Boundaries** are one simplified GeoJSON per country (`data/geo/<ISO3>.geojson`),
  fetched only when the map is opened for that country. Each country is drawn
  on its own projection (Lambert conformal conic with the country's customary
  parallels; transverse Mercator for Great Britain) and parts far from the
  mainland (the French overseas departments, the Canary Islands, Okinawa;
  Alaska and Hawaii should the data include them) appear in fixed inset
  panels that neither pan nor zoom (`src/lib/geo/projections.ts`). The
  selected country's national boundary (from the world-atlas package, fetched
  from a CDN) and, for the federal countries, its first-tier subnational
  governments (OECD TL2 regions: provinces and territories, states, Länder,
  Spanish autonomous communities, Italian regions, French régions, UK nations, in
  `data/geo/admin/<ISO3>.geojson`) are drawn as outlines over the FUAs. Add a
  country to `admin_countries` in the build script to overlay its regions.
- Only DuckDB's single-threaded bundles are shipped: GitHub Pages cannot send
  the cross-origin isolation headers the threaded bundle needs.

## Layout

```
data-prep/build_data.R   converts the devo_data_pack datapack into public/data/
public/data/             manifest.json, countries/nat/lai/rai/sources.parquet,
                         fua/cntry_iso3=<ISO3>/part.parquet, geo/<ISO3>.geojson
src/App.svelte           shell: top bar, left rail, hash-routed views
src/routes/              OverviewView, ProductivityView, AutonomyView, MapView, SourcesView, AboutView
src/lib/db/              DuckDB-WASM engine (db.ts), manifest bootstrap, queries
src/lib/charts/          Plot settings, the cross-country line chart
src/lib/geo/             GeoJSON loading (ring rewinding for d3), projections and insets, land underlay
src/lib/components/      ChartCard, PlotChart, RankTable, MapCanvas, TimeSlider, Legend, ...
.github/workflows/       builds and deploys to GitHub Pages on push to main
```

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
`jsonlite`, and the `devo_data_pack` project (its `_data/_datapack/` files and
the OECD FUA boundary geopackage under `_data/oecd_boundaries/`):

```bash
Rscript data-prep/build_data.R "/path/to/devo_data_pack"
```

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
