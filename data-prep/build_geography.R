# build_geography.R
#
# Regional boundaries for the national, TL2 and TL3 maps: one TopoJSON per
# country (public/data/geo/regions/<ISO3>.topo.json, objects national, tl2,
# tl3) plus a light all-countries file (geo/regions/national.topo.json).
#
#   Rscript data-prep/build_geography.R [path/to/devo_data_pack]
#   (run before build_data.R, which checks the data against these polygons)
#
# Sources, one per country so neighbouring polygons come from one survey and
# share their borders exactly:
#   GBR       ONS, International Territorial Level 3 (January 2025),
#             generalised 20 m, clipped (BGC V2). ONS code TLxxx = OECD UKxxx.
#   DEU, ITA, BEL, NLD, FIN, NOR, SWE
#             Eurostat GISCO, NUTS 2024 level 3, 1:1 million, EPSG:4326.
#   others    OECD regional boundaries 2020 (TL3 shapefile, from the
#             devo_data_pack), the latest the OECD has released.
# OECD publishes no TL2021 or TL2024 polygons; the panel (devo_data_pack
# _data/db tl2 and tl3) is on the OECD's current grid,
# which these three sources reproduce code for code.
#
# TL2 and the national outline are dissolved from TL3, so the levels nest
# exactly and share arcs. The exception is the United States, whose TL3
# (BEA economic areas) cross state lines: its TL2 are the OECD state
# polygons and its national outline is dissolved from them.
#
# TL2b: in the United Kingdom, Germany, Belgium and France the OECD's TL2 is
# NUTS 1 (ITL 1), so the NUTS 2 (ITL 2) level between TL2 and TL3 is added
# as TL2b, from the common database's tl2b table. Its polygons are TL3
# dissolved by the first four characters of the code, in the same arc table,
# so the three levels nest exactly. French overseas units equal their TL2
# region and are left out. Names: Eurostat GISCO NUTS 2024 level 2, and the
# ONS ITL 2 (January 2025) names and codes for the United Kingdom.
#
# Every polygon carries id, name, parent and its validity years (from, to).
# The panel back-casts one grid per country, so today each country has one
# era; a later grid change adds polygons with their own years, and the
# topology reuses the arcs of the units that did not change.
#
# Writes data-prep/cache/geo_index.csv (country, level, id, name, parent,
# from, to), which build_data.R uses for the one-to-one check.

suppressPackageStartupMessages({
  library(sf)
  library(dplyr)
  library(readr)
  library(jsonlite)
})
sf_use_s2(FALSE)

args     <- commandArgs(trailingOnly = TRUE)
datapack <- if (length(args)) args[1] else
  "/Users/zack/My Drive/Fiscal Observatory/devo_data_pack"
cache    <- "data-prep/cache"
src_dir  <- file.path(cache, "src")
out_dir  <- "public/data/geo/regions"
dir.create(src_dir, recursive = TRUE, showWarnings = FALSE)
dir.create(out_dir, recursive = TRUE, showWarnings = FALSE)

COUNTRIES <- c("CAN", "FRA", "DEU", "ITA", "JPN", "KOR", "ESP", "GBR", "USA",
               "AUS", "BEL", "FIN", "NLD", "NZL", "NOR", "SWE")
# Countries drawn from GISCO NUTS 2024: ISO2 (the NUTS prefix) to ISO3, and
# the NUTS level the OECD uses as TL2 there (NUTS 1 in Germany and Belgium,
# NUTS 2 elsewhere), given as the length of the TL2 code
GISCO <- tibble::tribble(
  ~cc,  ~iso3, ~tl2_len,
  "DE", "DEU", 3,
  "IT", "ITA", 4,
  "BE", "BEL", 3,
  "NL", "NLD", 4,
  "FI", "FIN", 4,
  "NO", "NOR", 4,
  "SE", "SWE", 4
)

# Citation wording lives in text/app_text.csv (sources.cite.geo.<id>); this
# list records where each file comes from and the grid it represents.
SOURCES <- list(
  ons = list(
    url  = "https://open-geography-portalx-ons.hub.arcgis.com/api/download/v1/items/b55a2ed98e7241628f0e6ec6f0fb1933/geojson?layers=1",
    page = "https://geoportal.statistics.gov.uk/",
    file = "ons_itl3_2025_bgc.geojson",
    grid = "ITL 2025"
  ),
  gisco = list(
    url  = "https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson/NUTS_RG_01M_2024_4326_LEVL_3.geojson",
    page = "https://ec.europa.eu/eurostat/web/gisco/geodata/statistical-units/territorial-units-statistics",
    file = "gisco_nuts_2024_l3_01m.geojson",
    grid = "NUTS 2024"
  ),
  # ONS ITL 2 (January 2025) names and codes, for the UK's TL2b units
  ons_itl2 = list(
    url  = "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/ITL2_JAN_2025_UK_NC/FeatureServer/0/query?where=1%3D1&outFields=ITL225CD,ITL225NM&f=json",
    file = "ons_itl2_2025_names.json"
  ),
  # level 2, for the names of TL2 units the OECD has not named yet (NL35,
  # NL36) and of the TL2b units
  gisco2 = list(
    url  = "https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson/NUTS_RG_60M_2024_4326_LEVL_2.geojson",
    file = "gisco_nuts_2024_l2_60m.geojson"
  )
)
fetch <- function(s) {
  f <- file.path(cache, s$file)
  if (!file.exists(f)) {
    message("downloading ", s$url)
    download.file(s$url, f, mode = "wb", quiet = TRUE)
  }
  f
}

# ── The panel: which codes carry data, at which level, in which years ───────
# the regional panel, from the common database (devo_data_pack/_data/db)
panel <- bind_rows(lapply(c("tl2", "tl3"), function(t)
  arrow::open_dataset(file.path(datapack, "_data/db", t)) |> collect())) |>
  filter(iso3 %in% COUNTRIES)
DATA_VARS <- c("lp_lpr", "lp_gdp_q", "gdppc_q_usdppp", "pop_total", "emp")
panel <- panel[rowSums(!is.na(panel[DATA_VARS])) > 0, ]
names_panel <- panel |> filter(!is.na(reg_name)) |> distinct(reg_id, reg_name)

# TL2b: units with data, from the common database (see the header)
TL2B <- c("GBR", "DEU", "BEL", "FRA")
panel2b <- arrow::open_dataset(file.path(datapack, "_data/db", "tl2b")) |> collect() |>
  filter(iso3 %in% TL2B, !grepl("^FRY", reg_id))
panel2b <- panel2b[rowSums(!is.na(panel2b[DATA_VARS])) > 0, ]

# ── TL3 per country, full resolution ────────────────────────────────────────
oecd3 <- st_read(file.path(datapack, "_data/oecd_boundaries/OECD_TL3_shapefile/OECD_TL3_2020.shp"),
                 quiet = TRUE, options = "ENCODING=LATIN1") |>
  filter(iso3 %in% COUNTRIES) |>
  transmute(iso3, id = tl3_id, name = name_en, parent = tl2_id)
oecd2 <- st_read(file.path(datapack, "_data/oecd_boundaries/OECD_TL2_shapefile/OECD_TL2_2020.shp"),
                 quiet = TRUE, options = "ENCODING=LATIN1") |>
  filter(iso3 %in% COUNTRIES) |>
  transmute(iso3, id = tl2_id, name = name_en)

ons <- st_read(fetch(SOURCES$ons), quiet = TRUE) |>
  transmute(iso3 = "GBR", id = sub("^TL", "UK", ITL325CD), name = ITL325NM,
            parent = substr(id, 1, 3))
gisco <- st_read(fetch(SOURCES$gisco), quiet = TRUE) |>
  filter(CNTR_CODE %in% GISCO$cc, !grepl("ZZ", NUTS_ID)) |>
  inner_join(GISCO, by = c("CNTR_CODE" = "cc")) |>
  transmute(iso3, id = NUTS_ID, name = NAME_LATN, parent = substr(id, 1, tl2_len))

gisco2_names <- st_read(fetch(SOURCES$gisco2), quiet = TRUE) |> st_drop_geometry() |>
  transmute(id = NUTS_ID, name = NUTS_NAME)
uk2_names <- jsonlite::fromJSON(fetch(SOURCES$ons_itl2))$features$attributes |>
  transmute(id = sub("^TL", "UK", ITL225CD), name = ITL225NM)

tl3_all <- bind_rows(
  oecd3 |> filter(!iso3 %in% c("GBR", GISCO$iso3)),
  ons, gisco
) |> st_make_valid()

source_of <- function(iso) if (iso == "GBR") "ons" else if (iso %in% GISCO$iso3) "gisco" else "oecd2020"

# Panel names are the OECD's (UTF-8); fall back to the source's
tl3_all <- tl3_all |>
  left_join(names_panel, by = c("id" = "reg_id")) |>
  mutate(name = coalesce(reg_name, name),
         name = gsub("\u0092", "’", name)) |>
  select(-reg_name)

# Validity years: the span of years with data at that level in that country
era <- panel |> group_by(iso3, tl) |>
  summarise(from = min(year), to = max(year), .groups = "drop")
era_of <- function(iso, lv) era |> filter(iso3 == iso, tl == lv)

index <- list()
for (iso in COUNTRIES) {
  t3 <- tl3_all |> filter(iso3 == iso)
  e3 <- era_of(iso, "TL3"); e2 <- era_of(iso, "TL2")
  has_tl3 <- nrow(e3) > 0
  # TL3 polygons only where the panel has TL3 data (Canada has none)
  if (has_tl3) {
    t3 <- t3 |> mutate(from = e3$from, to = e3$to)
  } else t3 <- t3[0, ]
  # TL2: dissolved from TL3 where TL3 nests (all but the USA)
  if (iso == "USA") {
    t2 <- oecd2 |> filter(iso3 == iso) |> select(id, name)
  } else {
    base <- tl3_all |> filter(iso3 == iso)
    t2 <- base |> group_by(id = parent) |> summarise(.groups = "drop")
    n2 <- bind_rows(names_panel |> rename(id = reg_id, name = reg_name),
                    st_drop_geometry(oecd2) |> select(id, name),
                    gisco2_names) |>
      distinct(id, .keep_all = TRUE)
    t2 <- t2 |> left_join(n2, by = "id")
  }
  t2 <- t2 |> mutate(name = gsub("\u0092", "’", name), parent = iso,
                     from = e2$from, to = e2$to)
  # TL2b: TL3 grouped by the code's first four characters (metropolitan
  # France only); the attributes go to the topology step as a CSV
  t2b <- NULL
  f2b <- file.path(src_dir, sprintf("%s.tl2b.csv", iso))
  if (file.exists(f2b)) unlink(f2b)
  if (has_tl3 && iso %in% TL2B) {
    t3 <- t3 |> mutate(tl2b = ifelse(grepl("^FRY", id), NA_character_, substr(id, 1, 4)))
    e2b <- panel2b |> filter(iso3 == iso)
    t2b <- st_drop_geometry(t3) |> filter(!is.na(tl2b)) |> distinct(id = tl2b, parent) |>
      left_join(bind_rows(gisco2_names, uk2_names) |> distinct(id, .keep_all = TRUE), by = "id") |>
      mutate(name = coalesce(gsub("\u0092", "’", name), id), from = min(e2b$year), to = max(e2b$year))
    if (anyDuplicated(t2b$id)) stop(iso, ": a TL2b unit spans two TL2 regions")
    write_csv(t2b, f2b)
  }
  # write the sources for the topology step
  w <- function(x, lv) {
    f <- file.path(src_dir, sprintf("%s.%s.geojson", iso, lv))
    if (file.exists(f)) unlink(f)
    x <- st_transform(x, 4326)
    st_write(x |> select(any_of(c("id", "name", "parent", "from", "to", "tl2b"))), f, driver = "GeoJSON", quiet = TRUE)
  }
  if (has_tl3) w(t3, "tl3")
  w(t2, "tl2")
  index[[iso]] <- bind_rows(
    if (has_tl3) st_drop_geometry(t3) |> transmute(iso3 = iso, level = "tl3", id, name, parent, from, to),
    if (!is.null(t2b)) t2b |> transmute(iso3 = iso, level = "tl2b", id, name, parent, from, to),
    st_drop_geometry(t2) |> transmute(iso3 = iso, level = "tl2", id, name, parent, from, to)
  )
  message(sprintf("%s  %-8s  tl3 %3d  tl2b %2d  tl2 %2d", iso, source_of(iso), nrow(t3), if (is.null(t2b)) 0L else nrow(t2b), nrow(t2)))
}
idx <- bind_rows(index)
write_csv(idx, file.path(cache, "geo_index.csv"))
retrieved <- function(f) format(as.Date(file.info(f)$mtime))
oecd_shp <- file.path(datapack, "_data/oecd_boundaries/OECD_TL3_shapefile/OECD_TL3_2020.shp")
src_info <- list(
  ons      = list(url = SOURCES$ons$page, file_url = SOURCES$ons$url, grid = SOURCES$ons$grid,
                  retrieved = retrieved(file.path(cache, SOURCES$ons$file))),
  gisco    = list(url = SOURCES$gisco$page, file_url = SOURCES$gisco$url, grid = SOURCES$gisco$grid,
                  retrieved = retrieved(file.path(cache, SOURCES$gisco$file))),
  oecd2020 = list(url = "https://www.oecd.org/en/data/datasets/oecd-geographical-definitions.html",
                  file_url = "", grid = "OECD 2020", retrieved = retrieved(oecd_shp))
)
units <- idx |> count(iso3, level) |> tidyr::pivot_wider(names_from = level, values_from = n, values_fill = 0)
write_json(list(
  built = format(Sys.Date()),
  sources = src_info,
  source_by_country = setNames(as.list(vapply(COUNTRIES, source_of, "")), COUNTRIES),
  units = setNames(lapply(COUNTRIES, function(i) {
    u <- units |> filter(iso3 == i)
    list(tl2 = if (nrow(u) && "tl2" %in% names(u)) u$tl2 else 0L, tl2b = if (nrow(u) && "tl2b" %in% names(u)) u$tl2b else 0L,
         tl3 = if (nrow(u) && "tl3" %in% names(u)) u$tl3 else 0L)
  }), COUNTRIES)
), file.path(cache, "geo_sources.json"), auto_unbox = TRUE, pretty = TRUE)

# ── Topology: node tools/topology.mjs (mapshaper) ───────────────────────────
status <- system2("node", c("tools/topology.mjs", src_dir, out_dir, paste(COUNTRIES, collapse = ",")))
if (status != 0) stop("tools/topology.mjs failed")
