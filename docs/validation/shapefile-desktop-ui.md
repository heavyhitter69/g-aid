# Shapefile desktop UI

Route: `/workspace/verify-shapefile`

The page uses the same `GridMapView` as the live map workspace. Kernel products
come from `tests/fixtures/validation-ui/G-AID Output/runs/r-verify-shp-*` and
the catalog from `tests/fixtures/shapefile-project`.

Required click-through:

1. Catalog — geology.shp stays `generic-vector` until a user assigns a role.
2. Polygons — geology-style shapefile layer maps with CRS source + confidence.
3. Blocked — missing/corrupt/undocumented datasets are not ingested.
4. Conflict — mixed EPSG overlap is blocked; no silent reprojection.
5. Overlap — tenure vs samples is a geometric table, not prospectivity.
