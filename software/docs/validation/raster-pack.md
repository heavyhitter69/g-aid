# Raster and terrain interoperability pack

This pack makes common project rasters first-class **catalog and map** assets. It is not a remote-sensing, GIS-processing, or terrain-correction suite.

## Supported

| Item | Status |
| --- | --- |
| Classic GeoTIFF IFD inspect (dimensions, GeoKeys CRS, affine/geotransform, nodata, bands, datatype, compression, strip/tile/COG layout, overview IFD count, checksum, provenance) | supported |
| Uncompressed Classic TIFF strip pixel display (uint8 / uint16 / int16 / int32 / float32, band 1 of multiband) under the declared preview limit | supported |
| ESRI ASCII grid inspect and display (ncols/nrows/cellsize/origin/nodata, optional `/ EPSG=` `/ Units=`) | supported |
| Documented DEM ASCII (`/ EPSG=`, `/ Units=m`, `/ ElevationDatum=orthometric\|ellipsoidal`) as a terrain **view** layer | supported |
| Overlay when CRS keys match (no silent reprojection) | supported |

Capabilities: `gis.raster_inspect`, `gis.raster_view`, `gis.terrain_view`.

## Recognised-unsupported

- BigTIFF signatures (not parsed as Classic TIFF)
- Incomplete ASCII headers (missing cellsize or origin)
- Incomplete GeoTIFF tags (no dimensions or geotransform)
- Compressed GeoTIFF / tiled / COG **pixels** (metadata may still inspect)
- GeoPackage rasters, MrSID, ECW, JPEG2000, FileGDB rasters

## Unknown

- Arbitrary binary without a TIFF signature or ASCII `ncols`/`nrows` header

## Explicitly not claimed

Hillshade, slope, aspect, gravity or GIS terrain correction, spectral indices (NDVI/NDWI), raster algebra, LiDAR rasterisation, silent reprojection, and DEM identification from the filename.

## Preview / memory limits

Catalog inspect is metadata-first and never copies pixel cubes into the LLM.

Map decode uses `PREVIEW_POLICY`:

- max 2,000,000 cells
- max 4000 cells per side
- max 32 MiB ASCII

Larger rasters stay inspectable; pixels are not loaded. Compressed and tiled files show extent from the geotransform when present.

## DEM rule

A file named `dem.asc` is `esri-ascii-grid`. DEM identification requires an
`ElevationDatum`/`VerticalDatum` comment; `/ EPSG=` and `/ Units=m` alone do not
make a grid a DEM. Gravity terrain correction still binds `dem-ascii` only.

## Validation

- Automated: `software/src/lib/phase12-raster.test.ts`, `software/python/tests/test_raster.py`
- Desktop UI: `/workspace/verify-raster` (same GridMapView as the workspace)
- Results: `docs/validation/results/raster_desktop_ui.json`
