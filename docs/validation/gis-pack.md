# Documented GIS vector pack

GIS vector layers are a **supported shared-platform pack** for documented
**GeoJSON** (Feature / FeatureCollection) with a recorded EPSG. It uses the
existing catalog, adapters, capability registry, compiled DAG, versioned
runs, spatial workspace, provenance, and interpretation controls.

There is **no** live `GisPipeline` / `VectorPipeline`. Vectors execute
through the same engine as magnetics / gravity / ERT / radiometrics / GPR /
LAS.

This pack does **not** claim geological interpretation, mineral targeting,
resource estimation, or GIS equivalence to QGIS/ArcGIS. `ert.invert2d`
remains experimental. Complete Bouguer is not auto-granted.

## Support boundary

### Supported (processing inputs)

| Format | Adapter | When |
|---|---|---|
| GeoJSON | `geojson` | Valid Point/Line/Polygon (including Multi*) geometries **and** a documented EPSG from the `crs` member, an `/ EPSG=` comment, or a companion `.prj` AUTHORITY |

Preserved fields: geometry types, attributes (unknown semantics), source CRS,
feature IDs, source path, checksum, user-assigned layer role, provenance.
RFC 7946 default CRS84 is **not** assumed.

Layer purpose (`geology`, `structure`, `tenure`, `alteration`,
`mine-feature`, `sample-location`, `generic-vector`) is a **reviewed,
non-destructive catalog assignment**. Filenames and field names never
establish geology or mineral meaning.

### Recognised, not processed

| Input | Why |
|---|---|
| Shapefile (`.shp` + sidecars) | Magic `9994` is recognised. `.shx`/`.dbf`/`.prj` are validated together as a sidecar set. Shape records and DBF attributes are **not parsed**. |
| GeoPackage (`.gpkg` / SQLite `GPKG`) | Container is recognised. Tables and geometries are **not loaded**. |
| GeoJSON without EPSG | Recognised-unsupported. Overlay and processing stay blocked. |
| Open/malformed rings, non-finite coordinates | Contract failure |
| KML, FileGDB, buffer/clip/dissolve/reproject | Not registered |

### Capabilities

| Id | Kernel | Default chat |
|---|---|---|
| `gis.vector_ingest` | `vector_ingest` | yes |
| `gis.vector_view` | `vector_view` | yes |
| `gis.spatial_overlap` | `vector_overlap` | when the user asks overlap / intersect |
| `gis.export_vector` | `vector_export` | when the user asks export |
| `gis.interpret` | `vector_interpret` | yes |

Not registered: buffer, clip, dissolve, reprojection, geoprocessing,
attribute editing, prospectivity maps, mineral targets, resource/reserve
claims, drill recommendations from overlays.

Magnetic `gis` (GeoTIFF / flight-path export) is a **different** step and is
not reused for vector ingest.

## Outputs

- `vector_canonical.json`
- `vector_ingest_qc.json`
- `vector_tracks.json` / `.meta.json`
- `vector_overlap.csv` / `.json` / QC (same-CRS geometric table only)
- `vector_export_N.geojson` + meta (GeoJSON only)
- `vector_interpretation.json` (Observations / Assumptions / Uncertainty / Recommendations / Not established)
- `lineage_*.json`

## User-facing workflow

1. Open a survey folder. The catalog content-sniffs GeoJSON (EPSG + geometry
   contract), shapefile sidecar completeness, and GeoPackage containers.
2. Optionally assign a vector role in Dataset Explorer. This is a catalog
   label, not an AI geological interpretation.
3. Ask to process the GeoJSON / vector overlay / spatial overlap.
4. Review the frozen plan (documented EPSG, no silent reprojection,
   interpretation limits).
5. Proceed. Inspect points/lines/polygons with legend, attributes, visibility,
   opacity, ordering, CRS status, and provenance. Same-CRS overlay and the
   overlap table are geometric coincidence only.

Desktop click-through of `/workspace/verify-gis` is recorded in
`docs/validation/results/gis_desktop_ui.json`.

## CRS and geometry constraints

- Overlay and overlap require matching documented CRS. Unknown, assumed, and
  conflicting CRS are blocked. G-AID will not silently reproject.
- Polygon exterior rings must be closed with at least four finite positions.
- Spatial overlap does not establish geological, mineral, or causal
  relationships.

## Next recommended pack

Further **field-instrument contracts** on the shared platform (additional
documented survey formats that already have a real parser, CRS, and fixtures)
— not production `ert.invert2d`, not Complete Bouguer, and not QGIS-class
geoprocessing.
