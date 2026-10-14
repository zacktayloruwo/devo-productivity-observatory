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
# country's file for country-specific views, and union them all for the
# cross-country comparisons.
#
# Every table comes from the common database the Devo Analysis pipeline
# writes at devo_data_pack/_data/db/ (one Parquet dataset per table,
# partitioned by country; see the README there). The app selects its countries
# and columns and fetches nothing itself, so analysis and app share one
# download and one vintage of each series.

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
db       <- file.path(datapack, "_data/db")
if (!dir.exists(db)) stop("no common database at ", db)
# one table of the store, all countries (the partition column is cntry_iso3)
from_db <- function(table) arrow::open_dataset(file.path(db, table)) |> dplyr::collect() |> tibble::as_tibble()
out      <- "public/data"
dir.create(file.path(out, "fua"), recursive = TRUE, showWarnings = FALSE)
dir.create(file.path(out, "geo"), recursive = TRUE, showWarnings = FALSE)

# ── Countries ─────────────────────────────────────────────────────────────────
# The nine of profile.qmd (country_map / country_group) and seven more
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
  "USA",  "US",  "United States",  "United States of America",                             "Anglo",
  "AUS",  "AU",  "Australia",      "Australia",                                            "Anglo",
  "NZL",  "NZ",  "New Zealand",    "New Zealand",                                          "Anglo",
  "BEL",  "BE",  "Belgium",        "Belgium",                                              "Continental Europe",
  "NLD",  "NL",  "Netherlands",    "Netherlands (Kingdom of the)",                         "Continental Europe",
  "FIN",  "FI",  "Finland",        "Finland",                                              "Nordic",
  "NOR",  "NO",  "Norway",         "Norway",                                               "Nordic",
  "SWE",  "SE",  "Sweden",         "Sweden",                                               "Nordic"
)

# ── FUA data ──────────────────────────────────────────────────────────────────
fua <- from_db("fua") |>
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
nat <- from_db("nat") |>
  filter(cntry_iso3 %in% countries$iso3) |>
  transmute(cntry_iso3, year = as.integer(year),
            gdp_pw, pop_nat, localexppct, lgexp_per_person) |>
  arrange(cntry_iso3, year)
write_parquet(nat, file.path(out, "nat.parquet"), compression = "zstd")
cat(sprintf("nat.parquet  %d rows\n", nrow(nat)))

# ── LAI ───────────────────────────────────────────────────────────────────────
lai <- from_db("lai") |>
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
rai <- from_db("rai") |>
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
# the series behind the tables the app shows (not the analysis-only FUA panel
# or crisis dates)
src <- read_parquet(file.path(db, "sources.parquet")) |>
  filter(!grepl("^(fua_panel|analysis)", used_by))
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
admin_countries <- c("CAN", "USA", "DEU", "ESP", "ITA", "FRA", "GBR", "AUS", "BEL")
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


# ── National, TL2 and TL3 (devo_data_pack analysis panels) ───────────────────
# Regional rows come from the store's tl2 and tl3 tables, national rows from
# its national table (the Devo Analysis regional and national panels). The polygons are built first by build_geography.R,
# which writes data-prep/cache/geo_index.csv; every region-year with data
# must have exactly one polygon valid in that year, or the build stops.
geo_index <- read.csv("data-prep/cache/geo_index.csv", stringsAsFactors = FALSE) |> as_tibble()
geo_sources <- jsonlite::read_json("data-prep/cache/geo_sources.json")

reg_vars <- list(
  list(id = "lp_lpr", label = "Labour productivity: GVA per worker (USD PPP, constant 2020 prices)", short = "Labour productivity", fmt = "usd", group = "economy"),
  list(id = "lp_gdp_q", label = "GDP per worker (USD PPP, constant prices)", short = "GDP per worker", fmt = "usd", group = "economy"),
  list(id = "gdppc_q_usdppp", label = "GDP per capita (USD PPP, constant prices)", short = "GDP per capita", fmt = "usd", group = "economy"),
  list(id = "lp_gap_frontier_pct", label = "Productivity gap to the country's most productive region (%)", short = "Gap to frontier", fmt = "pct", group = "economy"),
  list(id = "pop_total", label = "Population", short = "Population", fmt = "num", group = "people"),
  list(id = "pop_density", label = "Population density (persons per km²)", short = "Population density", fmt = "num", group = "people"),
  list(id = "share_65plus", label = "Population aged 65 and over (%)", short = "Aged 65+", fmt = "pct", group = "people"),
  list(id = "emp", label = "Employment (persons, place of work)", short = "Employment", fmt = "num", group = "people"),
  list(id = "emp_rate_15_64", label = "Employment rate, 15–64 (%)", short = "Employment rate", fmt = "pct", group = "people"),
  list(id = "une_rate_15_64", label = "Unemployment rate, 15–64 (%)", short = "Unemployment rate", fmt = "pct", group = "people"),
  list(id = "tert_share_25_64", label = "Tertiary-educated share of population 25–64 (%)", short = "Tertiary educated", fmt = "pct", group = "people"),
  list(id = "lai_total_reg", label = "Local Autonomy Index, region-specific (0–1)", short = "LAI", fmt = "score", group = "autonomy"),
  list(id = "lai_fiscal_reg", label = "Local Autonomy Index, fiscal, region-specific (0–1)", short = "LAI fiscal", fmt = "score", group = "autonomy"),
  list(id = "lai_policy_reg", label = "Local Autonomy Index, policy, region-specific (0–1)", short = "LAI policy", fmt = "score", group = "autonomy"),
  list(id = "rai_total_reg", label = "Regional Authority Index, region-specific (points, summed over every tier governing the region)", short = "RAI", fmt = "score", group = "autonomy"),
  list(id = "rai_selfrule_reg", label = "Regional Authority Index, self-rule, region-specific (points)", short = "RAI self-rule", fmt = "score", group = "autonomy"),
  list(id = "rai_sharedrule_reg", label = "Regional Authority Index, shared rule, region-specific (points)", short = "RAI shared rule", fmt = "score", group = "autonomy"),
  list(id = "rai_fiscalautonomy_reg", label = "Regional Authority Index, fiscal autonomy, region-specific (points)", short = "RAI fiscal autonomy", fmt = "score", group = "autonomy"),
  list(id = "eqi_reg", label = "European Quality of Government Index (z-score; EU and UK to 2017)", short = "EQI", fmt = "score", group = "governance")
)
nat_vars <- list(
  list(id = "gdp_pw", label = "GDP per person employed (USD PPP, constant prices)", short = "GDP per worker", fmt = "usd", group = "economy"),
  list(id = "gdp_ph", label = "GDP per hour worked (USD PPP, constant prices)", short = "GDP per hour", fmt = "usd2", group = "economy"),
  list(id = "gdp_pc", label = "GDP per capita (USD PPP, constant prices)", short = "GDP per capita", fmt = "usd", group = "economy"),
  list(id = "growth_gdp_pc", label = "Growth of GDP per capita (% per year)", short = "Per-capita growth", fmt = "pct", group = "economy"),
  list(id = "growth_gdp_pw", label = "Growth of GDP per person employed (% per year)", short = "Productivity growth", fmt = "pct", group = "economy"),
  list(id = "pop", label = "Population", short = "Population", fmt = "num", group = "people"),
  list(id = "rd_tl2_cv", label = "Regional dispersion of productivity, TL2 (coefficient of variation)", short = "TL2 dispersion", fmt = "ratio", group = "dispersion"),
  list(id = "rd_tl3_cv", label = "Regional dispersion of productivity, TL3 (coefficient of variation)", short = "TL3 dispersion", fmt = "ratio", group = "dispersion"),
  list(id = "rd_tl2_frontier_empsh", label = "Employment share of the most productive TL2 region (%)", short = "Frontier share", fmt = "pct", group = "dispersion"),
  list(id = "lai_total", label = "Local Autonomy Index, national (points, 0–37)", short = "LAI", fmt = "score", group = "autonomy"),
  list(id = "lai_selfrule", label = "Local Autonomy Index, self-rule (points, 0–28)", short = "LAI self-rule", fmt = "score", group = "autonomy"),
  list(id = "lai_fiscalautonomy", label = "Local Autonomy Index, fiscal autonomy (points, 0–4)", short = "LAI fiscal autonomy", fmt = "score", group = "autonomy"),
  list(id = "rai_total", label = "Regional Authority Index, national (points)", short = "RAI", fmt = "score", group = "autonomy"),
  list(id = "rai_selfrule", label = "Regional Authority Index, self-rule (points)", short = "RAI self-rule", fmt = "score", group = "autonomy"),
  list(id = "rai_sharedrule", label = "Regional Authority Index, shared rule (points)", short = "RAI shared rule", fmt = "score", group = "autonomy"),
  list(id = "fiscal_dec_dj_z", label = "Fiscal decentralization index, de jure (OECD z-score)", short = "Fiscal decentralization", fmt = "score", group = "autonomy"),
  list(id = "administrative_dec_z", label = "Administrative decentralization index (OECD z-score)", short = "Administrative decentralization", fmt = "score", group = "autonomy"),
  list(id = "political_dec_z", label = "Political decentralization index (OECD z-score)", short = "Political decentralization", fmt = "score", group = "autonomy"),
  list(id = "imf_sd_sng", label = "Subnational share of government spending (%)", short = "Spending decentralization", fmt = "pct", group = "fiscal"),
  list(id = "imf_rd_sng", label = "Subnational share of government revenue (%)", short = "Revenue decentralization", fmt = "pct", group = "fiscal"),
  list(id = "imf_taxd_sng", label = "Subnational share of tax revenue (%)", short = "Tax decentralization", fmt = "pct", group = "fiscal"),
  list(id = "ta_ab_share_scg", label = "Subnational tax revenue over which subnational government sets rates or reliefs (%)", short = "Tax autonomy", fmt = "pct", group = "fiscal"),
  list(id = "wgi_ge", label = "Government effectiveness (WGI estimate)", short = "Government effectiveness", fmt = "score", group = "governance"),
  list(id = "wgi_mean4", label = "Quality of government (mean of four WGI indicators)", short = "Quality of government", fmt = "score", group = "governance"),
  list(id = "icrg_qog", label = "Quality of government (ICRG, 0–1)", short = "ICRG quality of government", fmt = "score", group = "governance")
)
reg_ids <- vapply(reg_vars, `[[`, "", "id"); nat_ids <- vapply(nat_vars, `[[`, "", "id")

regp <- bind_rows(from_db("tl2"), from_db("tl3")) |>
  filter(iso3 %in% countries$iso3) |>
  mutate(year = as.integer(year), level = tolower(tl),
         lp_gap_frontier_pct = 100 * (exp(ln_lp_gap_frontier) - 1))
CORE <- c("lp_lpr", "lp_gdp_q", "gdppc_q_usdppp", "pop_total", "emp")   # as in build_geography.R
regp$has_core <- rowSums(!is.na(regp[CORE])) > 0
# Rows outside the grid: extra-regio codes, and codes that carry none of the
# core series (index-only rows such as the UK's ITL2-level codes filed as TL3)
geo_keys <- paste(geo_index$level, geo_index$id)
excluded <- regp |> filter(!paste(level, reg_id) %in% geo_keys) |>
  group_by(iso3, level, reg_id) |> summarise(core = any(has_core), .groups = "drop") |>
  mutate(extra_regio = grepl("ZZ", reg_id))
if (any(excluded$core & !excluded$extra_regio)) {
  bad <- excluded |> filter(core, !extra_regio)
  stop("region codes with data but no polygon: ",
       paste(head(paste(bad$iso3, bad$level, bad$reg_id), 40), collapse = ", "))
}
cat(sprintf("regional: dropped %d extra-regio codes (no territory: %s) and %d index-only codes outside the grid (%s)\n",
            sum(excluded$extra_regio), paste(excluded$reg_id[excluded$extra_regio], collapse = " "),
            sum(!excluded$extra_regio), paste(head(excluded$reg_id[!excluded$extra_regio], 60), collapse = " ")))
regp <- regp |> filter(paste(level, reg_id) %in% geo_keys)
# Names: the panel has none for codes created after TL2021 (the UK's ITL 2025
# units, Thuringia, Sardinia); take them from the boundary file
regp <- regp |>
  left_join(geo_index |> transmute(iso3, level, reg_id = id, geo_name = name), by = c("iso3", "level", "reg_id")) |>
  mutate(name_from_geo = is.na(reg_name) & !is.na(geo_name), reg_name = coalesce(reg_name, geo_name)) |>
  select(-geo_name)
cat(sprintf("region names filled from the boundary files: %d regions (%s)\n",
            n_distinct(regp$reg_id[regp$name_from_geo]), paste(head(unique(regp$reg_id[regp$name_from_geo]), 12), collapse = " ")))
if (any(is.na(regp$reg_name))) stop("regions without a name: ", paste(unique(regp$reg_id[is.na(regp$reg_name)]), collapse = " "))
regp <- regp |> select(-name_from_geo)
regp$has_any <- rowSums(!is.na(regp[reg_ids])) > 0
regp <- regp |> filter(has_any)

# One-to-one check: in every country, level and year, the codes with data are
# a subset of the polygons valid that year, and each polygon id is unique
for (key in unique(paste(regp$iso3, regp$level))) {
  kk <- strsplit(key, " ")[[1]]; iso <- kk[1]; lv <- kk[2]
  gi <- geo_index |> filter(iso3 == iso, level == lv)
  if (anyDuplicated(paste(gi$id, gi$from, gi$to))) stop("duplicate polygon ids in ", key)
  for (y in sort(unique(regp$year[regp$iso3 == iso & regp$level == lv]))) {
    valid <- gi$id[gi$from <= y & gi$to >= y]
    if (anyDuplicated(valid)) stop(sprintf("%s %d: more than one polygon valid for %s", key, y, paste(valid[duplicated(valid)], collapse = " ")))
    d <- unique(regp$reg_id[regp$iso3 == iso & regp$level == lv & regp$year == y])
    miss <- setdiff(d, valid)
    if (length(miss)) stop(sprintf("%s %d: data without a polygon: %s", key, y, paste(miss, collapse = " ")))
  }
}
cat("one-to-one check passed: every region-year with data has exactly one polygon\n")

reg_files <- list(tl2 = list(), tl3 = list())
for (lv in c("tl2", "tl3")) for (iso in countries$iso3) {
  d <- regp |> filter(level == lv, iso3 == iso) |>
    transmute(reg_id, reg_name, year, !!!rlang::syms(reg_ids)) |> arrange(reg_id, year)
  if (nrow(d) == 0) next
  dir <- file.path(out, lv, paste0("cntry_iso3=", iso)); dir.create(dir, recursive = TRUE, showWarnings = FALSE)
  f <- file.path(dir, "part.parquet"); write_parquet(d, f, compression = "zstd")
  reg_files[[lv]][[iso]] <- sub(paste0("^", out, "/"), "", f)
  cat(sprintf("%s  %5d rows  %3d regions  %4.0f KB\n", reg_files[[lv]][[iso]], nrow(d), n_distinct(d$reg_id), file.info(f)$size / 1024))
}

natp <- from_db("national") |>
  filter(iso3 %in% countries$iso3) |>
  mutate(year = as.integer(year),
         growth_gdp_pc = 100 * dln_gdp_pc, growth_gdp_pw = 100 * dln_gdp_pw,
         across(c(imf_sd_sng, imf_rd_sng, imf_taxd_sng), ~ 100 * .x),
         rd_tl2_frontier_empsh = 100 * rd_tl2_frontier_empsh) |>
  transmute(cntry_iso3 = iso3, year, !!!rlang::syms(nat_ids)) |>
  arrange(cntry_iso3, year)
natp <- natp[rowSums(!is.na(natp[nat_ids])) > 0, ]
write_parquet(natp, file.path(out, "national.parquet"), compression = "zstd")
cat(sprintf("national.parquet  %d rows\n", nrow(natp)))

years_of <- function(d, ids) setNames(lapply(ids, function(v) sort(unique(as.integer(d$year[!is.na(d[[v]])])))), ids)
eras <- geo_index |> distinct(iso3, level, from, to) |> group_by(iso3, level) |>
  summarise(eras = list(lapply(seq_along(from), function(i) list(from = from[i], to = to[i]))), .groups = "drop")

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
  # map levels: indicators, years with data, files and polygon eras
  levels     = list(
    national = list(variables = nat_vars, var_years = years_of(natp, nat_ids)),
    tl2      = list(variables = reg_vars, var_years = years_of(regp |> filter(level == "tl2"), reg_ids),
                    countries = names(reg_files$tl2)),
    tl3      = list(variables = reg_vars, var_years = years_of(regp |> filter(level == "tl3"), reg_ids),
                    countries = names(reg_files$tl3)),
    fua      = list(variables = variables, var_years = var_years, countries = countries$iso3)
  ),
  eras       = setNames(lapply(split(eras, eras$iso3), function(d) setNames(d$eras, d$level)), unique(sort(eras$iso3))),
  geo_sources = geo_sources,
  files      = list(
    fua = as.list(fua_files),
    geo = setNames(as.list(paste0("geo/", names(bboxes), ".geojson")), names(bboxes)),
    admin = as.list(admin_files),
    tl2 = reg_files$tl2, tl3 = reg_files$tl3, national = "national.parquet",
    regions = setNames(as.list(paste0("geo/regions/", countries$iso3, ".topo.json")), countries$iso3),
    regions_all = "geo/regions/national.topo.json",
    nat = "nat.parquet", lai = "lai.parquet", rai = "rai.parquet",
    sources = "sources.parquet", countries = "countries.parquet"
  )
)
write_json(manifest, file.path(out, "manifest.json"), auto_unbox = TRUE,
           pretty = TRUE, digits = NA)
cat("manifest.json written\n")
