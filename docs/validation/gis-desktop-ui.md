# GIS vector desktop UI verification

Workspace route: `/workspace/verify-gis` (same `GridMapView` as the live map
workspace), fed by versioned fixtures under
`tests/fixtures/validation-ui/G-AID Output/runs/r-verify-gis*` and the catalog
built from `tests/fixtures/gis-project`.

Live React pass recorded 2026-08-27 at viewport 1280×800
(`results/gis_desktop_ui.json`):

| Check | Result |
|---|---|
| Catalog: `geology.geojson` supported EPSG:32734, role generic until user assigned geology | pass |
| Catalog: RFC 7946 `no-crs/clip.geojson` supported **OGC:CRS84** (`rfc7946`, lon-lat). Not EPSG:4326 | pass |
| Catalog: legacy-GeoJSON `crs` member EPSG:4326; custom import `.prj` EPSG:32734; `/ EPSG=` comment custom import | pass |
| Catalog: projected-undocumented and unmapped legacy `crs` recognised-unsupported | pass |
| Catalog: incomplete shapefile missing `.shx/.dbf/.prj`; complete sidecars still not parsed | pass |
| Catalog: GeoPackage recognised-unsupported | pass |
| Points map SAMPLE_ID unknown semantics; Points checkbox hide/restore | pass |
| Lines map `faults.geojson` LineString role structure (user-assigned); filename not a role | pass |
| Polygons map geology.geojson remains unassigned generic vector | pass |
| RFC 7946 CRS84 map viewable as OGC:CRS84; no axis swap | pass |
| legacy-GeoJSON map keeps EPSG:4326 identity; GeoJSON storage [lon, lat] | pass |
| Custom import map EPSG:32734 from companion `.prj`; labelled G-AID custom import, not RFC 7946 | pass |
| Undocumented projected `skipped=true reason=gis_crs_required`; CRS84 does not apply; no silent reprojection | pass |
| CRS84 vs EPSG:4326 compatibility warning `geojson-lonlat-no-axis-swap`; overlap allowed; not CRS identity | pass |
| Conflicting CRS EPSG:32734 vs EPSG:4326 blocked; reprojection not registered | pass |
| Overlap tenure polygon + sample points; contains / bbox-overlap; not a prospectivity map | pass |
| Interpretation Observations / Assumptions / Uncertainty / Recommendations / Not established; `geological_certainty_improved=false` | pass |

Screenshots: `results/screenshots/gis-catalog.webp`, `gis-points.webp`,
`gis-lines.webp`, `gis-polygons.webp`, `gis-rfc7946-crs84.webp`,
`gis-legacy-geojson.webp`, `gis-custom-import.webp`,
`gis-undocumented-projected.webp`, `gis-crs84-compat.webp`,
`gis-conflict-crs.webp`, `gis-overlap.webp`, `gis-interpretation.webp`.

A packaged Electron executable was not launched; the verified UI is the Next.js
workspace that Electron hosts.

Spatial overlap is geometric coincidence. It does not establish geological,
mineral, or causal relationships. OGC:CRS84 is not EPSG:4326.
