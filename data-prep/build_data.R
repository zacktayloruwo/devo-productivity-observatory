# build_data.R
#
# Converts the devo_data_pack datapack into the segmented parquet + GeoJSON
# files served by the app from public/data/. Run from this repository root:
#
#   Rscript data-prep/build_data.R [path/to/devo_data_pack]
#
# Output layout (all under public/data/):
#   manifest.json          file inventory, years, variable metadata, bboxes
#   countries.parquet      one row per profile country (display name, codes)
#   fua/cntry_iso3=<ISO3>/part.parquet
#                          FUA indicators for one country, all years (Hive
#                          layout: DuckDB prunes files by cntry_iso3 filter)
#   nat.parquet            national series (GDP per worker, population, ...)
#   lai.parquet            Local Autonomy Index, national means
#   rai.parquet            Regional Authority Index, national means
#   sources.parquet        OECD dataflow provenance
#   geo/<ISO3>.geojson     simplified FUA boundaries for one country
#
# Segmenting the FUA table by country lets the app fetch only the focus
# country's file for country-specific views, and union all nine for the
# cross-country comparisons.

suppressPackageStartupMessages({
  library(dplyr)
  library(haven)
  library(arrow)
  library(sf)
  library(rmapshaper)
  library(jsonlite)
  library(geojsonsf)
})

args     <- commandArgs(trailingOnly = TRUE)
datapack <- if (length(args)) args[1] else
  "/Users/zack/My Drive/Fiscal Observatory/devo_data_pack"
dp       <- file.path(datapack, "_data/_datapack")
out      <- "public/data"
dir.create(file.path(out, "fua"), recursive = TRUE, showWarnings = FALSE)
dir.create(file.path(out, "geo"), recursive = TRUE, showWarnings = FALSE)

# ── Countries ─────────────────────────────────────────────────────────────────
# Mirrors country_map / country_group in profile.qmd
countries <- tibble::tribble(
  ~iso3,  ~iso2, ~display,         ~data_name,                                             ~region,
  "CAN",  "CA",  "Canada",         "Canada",                                               "Anglo",
  "FRA",  "FR",  "France",         "France",                                               "Continental Europe",
  "DEU",  "DE",  "Germany",        "Germany",                                              "Continental Europe",
  "ITA",  "IT",  "Italy",          "Italy",                                                "Continental Europe",
  "JPN",  "JP",  "Japan",          "Japan",                                                "Asia",
  "KOR",  "KR",  "South Korea",    "Republic of Korea",                                    "Asia",
  "ESP",  "ES",  "Spain",          "Spain",                                                "Continental Europe",
  "GBR",  "GB",  "United Kingdom", "United Kingdom of Great Britain and Northern Ireland", "Anglo",
  "USA",  "US",  "United States",  "United States of America",                             "Anglo"
)

# ── FUA data ──────────────────────────────────────────────────────────────────
fua <- read_dta(file.path(dp, "fua_data.dta")) |>
  zap_labels() |>
  as_tibble() |>
  filter(!is.na(cntry_name), nzchar(cntry_name), cntry_iso3 %in% countries$iso3) |>
  transmute(
    cntry_iso3,
    fua_id, fua_name,
    year        = as.integer(year),
    pop, pop_source = na_if(pop_source, ""),
    depratio, patents,
    gdp_usdppp, gdp_pct_nat, gdppc_usdppp, gdppw_usdppp,
    labprod_usdppp, labprod_cov, popdens_km2
  ) |>
  arrange(cntry_iso3, fua_id, year)

fua_files <- character(0)
for (iso in countries$iso3) {
  d   <- fua |> filter(cntry_iso3 == iso) |> select(-cntry_iso3)
  dir <- file.path(out, "fua", paste0("cntry_iso3=", iso))
  dir.create(dir, showWarnings = FALSE, recursive = TRUE)
  f <- file.path(dir, "part.parquet")
  write_parquet(d, f, compression = "zstd")
  fua_files[iso] <- sub(paste0("^", out, "/"), "", f)
  cat(sprintf("%s  %5d rows  %3d FUAs  %5.0f KB\n", fua_files[iso], nrow(d),
              n_distinct(d$fua_id), file.info(f)$size / 1024))
}

# ── National ──────────────────────────────────────────────────────────────────
nat <- read_dta(file.path(dp, "nat_data.dta")) |>
  zap_labels() |> as_tibble() |>
  filter(cntry_iso3 %in% countries$iso3) |>
  transmute(cntry_iso3, year = as.integer(year),
            gdp_pw, pop_nat, localexppct, lgexp_per_person) |>
  arrange(cntry_iso3, year)
write_parquet(nat, file.path(out, "nat.parquet"), compression = "zstd")
cat(sprintf("nat.parquet  %d rows\n", nrow(nat)))

# ── LAI ───────────────────────────────────────────────────────────────────────
lai <- readRDS(file.path(dp, "lai_national.rds")) |>
  as_tibble() |>
  filter(cntry_iso3 %in% countries$iso3) |>
  mutate(year = as.integer(year),
         # Fiscal dimension: point weights 4, 3, 3, 3 as in profile.qmd
         lai_fiscal_score = (lai_fiscalautonomy * 4 + lai_transfer * 3 +
                             lai_financialselfreliance * 3 +
                             lai_borrowingautonomy * 3) / 13) |>
  select(cntry_iso3, year, starts_with("lai_"), lg_num, pop_lai, lgper100k) |>
  arrange(cntry_iso3, year)
write_parquet(lai, file.path(out, "lai.parquet"), compression = "zstd")
cat(sprintf("lai.parquet  %d rows\n", nrow(lai)))

# ── RAI ───────────────────────────────────────────────────────────────────────
rai <- readRDS(file.path(dp, "rai_national.rds")) |>
  as_tibble() |>
  filter(cntry_iso3 %in% countries$iso3) |>
  mutate(year = as.integer(year),
         # Fiscal dimension: point weights 4 and 3 as in profile.qmd
         rai_fiscal_score = (rai_fiscalautonomy * 4 + rai_borrowingautonomy * 3) / 7) |>
  select(cntry_iso3, year, starts_with("rai_"), -rai_id, -rai_name) |>
  arrange(cntry_iso3, year)
write_parquet(rai, file.path(out, "rai.parquet"), compression = "zstd")
cat(sprintf("rai.parquet  %d rows\n", nrow(rai)))

# ── Sources ───────────────────────────────────────────────────────────────────
src <- read.csv(file.path(dp, "oecd_sources.csv"), stringsAsFactors = FALSE) |> as_tibble()
write_parquet(src, file.path(out, "sources.parquet"), compression = "zstd")

# ── Countries table ───────────────────────────────────────────────────────────
write_parquet(countries, file.path(out, "countries.parquet"))

# ── Boundaries ────────────────────────────────────────────────────────────────
# Read straight from the OECD geopackage so Japan and Korea are included (the
# datapack's fua_boundaries.rds was built before those countries were added).
gpkg <- file.path(datapack, "_data/oecd_boundaries/fua_boundaries.gpkg")
b <- st_read(gpkg, layer = "FUAs", quiet = TRUE) |>
  rename(fua_id = fuacode) |>
  filter(fua_id %in% fua$fua_id) |>
  st_make_valid()
# st_make_valid can return a GeometryCollection (Osaka): keep its polygon
# parts only, so every feature is a (Multi)Polygon
b <- st_collection_extract(b, "POLYGON") |>
  group_by(fua_id, fuaname) |> summarise(.groups = "drop") |> st_cast("MULTIPOLYGON")

fua_cntry <- fua |> distinct(fua_id, cntry_iso3)
b <- b |> left_join(fua_cntry, by = "fua_id") |> select(fua_id, fuaname, cntry_iso3)

bboxes <- list()
for (iso in countries$iso3) {
  g <- b |> filter(cntry_iso3 == iso)
  if (nrow(g) == 0) next
  # Simplify to a vertex budget rather than a fixed share: Japan's and
  # Canada's coastlines carry far more vertices per FUA than the others
  nv   <- nrow(st_coordinates(g))
  keep <- max(0.003, min(0.08, 15000 / nv))
  g <- ms_simplify(g, keep = keep, keep_shapes = TRUE) |>
    st_transform(4326) |>
    st_make_valid()
  # simplification can leave a GeometryCollection too: polygon parts only
  g <- st_collection_extract(g, "POLYGON") |>
    group_by(fua_id, fuaname) |> summarise(.groups = "drop") |>
    st_cast("MULTIPOLYGON") |>
    select(fua_id, fua_name = fuaname)
  path <- file.path(out, "geo", paste0(iso, ".geojson"))
  # geojsonsf rather than GDAL: GDAL writes some multipolygons (Osaka) as a
  # GeometryCollection. Ring orientation is left as is; the app rewinds.
  writeLines(geojsonsf::sf_geojson(g, digits = 4), path)
  bb <- as.numeric(st_bbox(g))
  bboxes[[iso]] <- bb
  cat(sprintf("geo/%s.geojson  %3d features  %6.0f KB\n", iso, nrow(g),
              file.info(path)$size / 1024))
}

# ── Subnational government outlines ──────────────────────────────────────────
# OECD TL2 regions are the first-tier subnational governments: provinces and
# territories, states, Länder. Written for the federal countries, drawn on the
# map as outlines over the FUAs. Add a country here to overlay its regions.
admin_countries <- c("CAN", "USA", "DEU", "ESP", "ITA", "FRA", "GBR")
dir.create(file.path(out, "geo", "admin"), showWarnings = FALSE)
tl2 <- st_read(file.path(datapack, "_data/oecd_boundaries/OECD_TL2_shapefile"),
               quiet = TRUE, options = "ENCODING=LATIN1") |>
  filter(iso3 %in% admin_countries) |>
  st_make_valid() |>
  # the UK's nations rather than its ITL1 regions: the English regions dissolve
  # into England; a stray Windows apostrophe in the source is replaced
  mutate(name_en = gsub("\u0092", "\u2019", name_en),
         tl2_id  = ifelse(iso3 == "GBR" & !tl2_id %in% c("UKL", "UKM", "UKN"), "UKENG", tl2_id),
         name_en = ifelse(tl2_id == "UKENG", "England", name_en))
admin_files <- character(0)
for (iso in admin_countries) {
  a  <- tl2 |> filter(iso3 == iso)
  if (nrow(a) == 0) next
  nv <- nrow(st_coordinates(a))
  a  <- ms_simplify(a, keep = max(0.002, min(0.1, 8000 / nv)), keep_shapes = TRUE) |>
    st_transform(4326) |> st_make_valid()
  a <- st_collection_extract(a, "POLYGON") |>
    group_by(tl2_id, name_en) |> summarise(.groups = "drop") |>
    st_cast("MULTIPOLYGON") |>
    transmute(id = tl2_id, name = name_en)
  path <- file.path(out, "geo", "admin", paste0(iso, ".geojson"))
  writeLines(geojsonsf::sf_geojson(a, digits = 4), path)
  admin_files[iso] <- paste0("geo/admin/", iso, ".geojson")
  cat(sprintf("geo/admin/%s.geojson  %3d regions  %5.0f KB\n", iso, nrow(a),
              file.info(path)$size / 1024))
}

# FUAs without a boundary (if any) are listed so the map can note them
no_geo <- setdiff(fua$fua_id, b$fua_id)

# ── Variable metadata for the map / chart selectors ───────────────────────────
variables <- list(
  list(id = "labprod_usdppp", label = "Labour productivity (USD PPP per worker)",
       short = "Labour productivity", fmt = "usd", source = "fua_labprod"),
  list(id = "gdppc_usdppp",   label = "GDP per person (USD PPP)",
       short = "GDP per capita", fmt = "usd", source = "fua_gdp_pc"),
  list(id = "gdp_usdppp",     label = "GDP (USD PPP, millions)",
       short = "GDP", fmt = "num", source = "fua_gdp"),
  list(id = "gdp_pct_nat",    label = "GDP, share of national GDP (%)",
       short = "GDP share of national", fmt = "pct", source = "fua_gdp_pct_nat"),
  list(id = "pop",            label = "Population",
       short = "Population", fmt = "num", source = "fua_pop"),
  list(id = "popdens_km2",    label = "Population density (persons per km²)",
       short = "Population density", fmt = "num", source = "fua_popdens"),
  list(id = "depratio",       label = "Dependency ratio (share of population 15–64)",
       short = "Dependency ratio", fmt = "ratio", source = "fua_depratio"),
  list(id = "patents",        label = "Patent applications",
       short = "Patents", fmt = "num", source = "fua_patents")
)

# Years with any data for each map variable, so the year slider can hide empties
var_years <- lapply(variables, function(v) {
  yrs <- sort(unique(fua$year[!is.na(fua[[v$id]])]))
  as.integer(yrs)
})
names(var_years) <- vapply(variables, `[[`, "", "id")

manifest <- list(
  built      = format(Sys.time(), "%Y-%m-%d"),
  ref_year   = 2019L,
  countries  = countries,
  variables  = variables,
  var_years  = var_years,
  years      = list(fua = range(fua$year), lai = range(lai$year),
                    rai = range(rai$year), nat = range(nat$year)),
  bboxes     = bboxes,
  no_geo     = no_geo,
  files      = list(
    fua = as.list(fua_files),
    geo = setNames(as.list(paste0("geo/", names(bboxes), ".geojson")), names(bboxes)),
    admin = as.list(admin_files),
    nat = "nat.parquet", lai = "lai.parquet", rai = "rai.parquet",
    sources = "sources.parquet", countries = "countries.parquet"
  )
)
write_json(manifest, file.path(out, "manifest.json"), auto_unbox = TRUE,
           pretty = TRUE, digits = NA)
cat("manifest.json written\n")
