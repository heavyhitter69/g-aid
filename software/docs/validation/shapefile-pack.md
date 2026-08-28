# Documented shapefile ingest (GIS vector extension)

Shapefile support is a **format adapter** on the existing GIS vector pack.
It is **not** a new geological interpretation system and **not** a separate
shapefile pipeline.

Parser: **vendored pyshp 2.3.1** (`python/vendor/shapefile.py`) for kernel
ingest; a matching ESRI spec reader in `src/lib/catalog/shapefile-contract.ts`
for catalog inspect and map decode. Sidecar **names** are not support.

## Support boundary

### Supported (processing inputs)

| Requirement | Rule |
|---|---|
| Components | `.shp` + `.shx` + `.dbf` must all parse. `.prj` must document an EPSG. |
| Geometry | ESRI types 1 / 3 / 5 / 8: Point, PolyLine, Polygon, MultiPoint. Polygon holes and MultiPolygon parts are retained. Self-intersecting or crossing rings stay recognised-unsupported. |
| Topology / overlap | Engine `g-aid-evenodd-segment` (even-odd + segment intersection; nesting by containment, not orientation). A point in a hole is **not** contained. Exterior-ring-only overlap is **not** supported. |
| Attributes | DBF fields preserved with unknown semantics. Optional `.cpg` encoding. |
| CRS | `.prj` `AUTHORITY["EPSG","n"]` (high) or `EPSG:n` (medium). No silent reprojection. |
| Role | User-assigned via the existing vector-role catalog control. Filename / DBF names never assign geology. |

Capabilities reused (not duplicated): `gis.vector_ingest`, `gis.vector_view`,
`gis.spatial_overlap`, `gis.export_vector`, `gis.interpret`.

Export writer: **GeoJSON only**. Source shapefile provenance is retained on
exported features (`_g_aid_source`, `_g_aid_source_format`, CRS, encoding).

### Recognised-unsupported

Missing `.shp` / `.shx` / `.dbf`, SHX/SHP/DBF count mismatch, corrupt DBF,
unparseable encoding (including `.cpg` that fails), missing or EPSG-less `.prj`,
Z/M/MultiPatch types, null-only or empty datasets, malformed polygon rings, self-intersecting rings,
and hole rings that cross their exterior.

**GeoPackage remains recognised-unsupported.** There is no Fiona/GDAL/pyogrio
reader in this runtime. SQLite header sniff is not GPKG support.

## Workflow

1. Catalog detects file-code 9994 and **parses** geometry + DBF + PRJ.
2. Supported records bind as GIS processing inputs with GeoJSON.
3. Ingest writes the same `vector_canonical.json` kernel product.
4. Map view, same-CRS **topology-aware** overlap, and GeoJSON export use the existing GIS nodes.
   Overlap records engine, method, precision, and skipped features. A point in a hole is disjoint, not contained.
5. Overlap is geometric coincidence, not geological causation. Exterior-ring-only overlap is not overlap support.

## Tests

- `python/tests/test_shapefile.py`
- `src/lib/phase11-shapefile.test.ts`
- Desktop: `/workspace/verify-shapefile`

Fixtures: `tests/fixtures/shapefile-project/` (generated with pyshp 2.3.1).
