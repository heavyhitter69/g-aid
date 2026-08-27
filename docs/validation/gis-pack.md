# Documented GIS vector pack

GIS vector layers are a **supported shared-platform pack** for documented
**GeoJSON**. It uses the existing catalog, adapters, capability registry,
compiled DAG, versioned runs, spatial workspace, provenance, and
interpretation controls.

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
| RFC 7946 GeoJSON | `geojson` | Valid Feature / FeatureCollection with **no** legacy `crs` member and geographic coordinates. Catalogued as documented **`OGC:CRS84`** (WGS 84 longitude-latitude degrees). Not EPSG:4326. |
| legacy-GeoJSON | `geojson` | Legacy `crs` member with a **validated EPSG mapping**. The `crs` member is not the RFC 7946 CRS mechanism. Unparseable names stay recognised-unsupported until a user-confirmed mapping exists. |
| G-AID custom import | `geojson` | Companion `.prj` AUTHORITY or `/ EPSG=` annotation for projected (or annotated) GeoJSON. This is a documented **G-AID custom import contract**, not standard RFC 7946. |

Preserved fields: geometry types, attributes (unknown semantics), CRS
identity, CRS source, axis order, coordinate storage order, feature IDs,
source path, checksum, user-assigned layer role, provenance.

G-AID will **not** silently reproject or swap axes. Overlay and analysis
rules stay explicit. Spatial overlap uses even-odd filled topology
(exterior minus holes) via `g-aid-evenodd-segment`. Exterior-ring-only
overlap is not supported.

Layer purpose (`geology`, `structure`, `tenure`, `alteration`,
`mine-feature`, `sample-location`, `generic-vector`) is a **reviewed,
non-destructive catalog assignment**. Filenames and field names never
establish geology or mineral meaning.

### Recognised, not processed

| Input | Why |
|---|---|
| Shapefile (`.shp` + sidecars) | Originally recognised-only in this pack. Documented shapefile ingest is the later adapter in `docs/validation/shapefile-pack.md` (pyshp 2.3.1; sidecar names alone are not support). |
| GeoPackage (`.gpkg` / SQLite `GPKG`) | Container is recognised. Tables and geometries are **not loaded**. |
| Projected GeoJSON without `.prj` / `/ EPSG=` / validated legacy `crs` | Not RFC 7946 CRS84. Recognised-unsupported. |
| Legacy `crs` without a validated EPSG | Needs a user-confirmed CRS mapping. |
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
- `vector_ingest_qc.json` (CRS source, axis order, coordinate order, contract)
- `vector_tracks.json` / `.meta.json`
- `vector_overlap.csv` / `.json` / QC (same-CRS or documented CRS84/4326 compatibility; `crs_decisions` provenance)
- `vector_export_N.geojson` + meta (RFC 7946 export omits a `crs` member for OGC:CRS84)
- `vector_interpretation.json` (Observations / Assumptions / Uncertainty / Recommendations / Not established)
- `lineage_*.json`

## User-facing workflow

1. Open a survey folder. The catalog content-sniffs GeoJSON (RFC 7946 CRS84,
   legacy `crs`, or G-AID custom import), shapefile sidecar completeness, and
   GeoPackage containers.
2. Optionally assign a vector role in Dataset Explorer. This is a catalog
   label, not an AI geological interpretation.
3. Ask to process the GeoJSON / vector overlay / spatial overlap.
4. Review the frozen plan (documented CRS, CRS84 vs EPSG:4326 warning when
   applicable, no silent reprojection, interpretation limits).
5. Proceed. Inspect points/lines/polygons with legend, attributes, visibility,
   opacity, ordering, CRS status, and provenance. Overlay and the overlap
   table are geometric coincidence only.

Desktop click-through of `/workspace/verify-gis` is recorded in
`docs/validation/results/gis_desktop_ui.json`.

## CRS and geometry constraints

- RFC 7946 GeoJSON with no `crs` member is documented **OGC:CRS84** (lon, lat
  degrees). The identity is not relabelled as projected EPSG data.
- OGC:CRS84 and EPSG:4326 are different CRS identities (lon-lat vs OGC
  lat-lon). Documented, tested compatibility is allowed **only** when both
  layers store GeoJSON `[lon, lat]` (`geojson-lonlat-no-axis-swap`). Otherwise
  spatial overlap is blocked. The decision is stored in catalog fields
  (CRS source, axis order, coordinate order) and run provenance
  (`crs_decisions`).
- Other mixed CRS pairs are blocked. G-AID will not silently reproject.
- Polygon exterior rings must be closed with at least four finite positions.
- Spatial overlap does not establish geological, mineral, or causal
  relationships.

## SEG-Y seismic pack — recommendation

**Do not start a seismic pack from the existing code.** A leftover
`python/science/seismic.py` reader (`read_segy`, IBM float, offsets, CDP,
shot/receiver XY) and `seismic_process` kernel exist, but they do **not**
meet the GIS/LAS support bar:

| Bar item | Current state |
|---|---|
| Real SEG-Y parser | Science helper only; not a catalog contract |
| Catalog / DAG | SEG-Y is **recognised-unsupported** (textual header sniff). No `seismic.*` capabilities. `seismic_process` is an unregistered leftover that takes `parameters.inputPath`, writes `crs_epsg=0`, and is not bound through `catalogInputs` |
| Trace/section viewer | No first-class viewer; map display does not decode SEG-Y |
| Metadata contract | No documented CRS, geometry, or QC contract comparable to GeoJSON/LAS |
| Versioned outputs / provenance | Writes `seismic_processed.npz` / `seismic_section.asc` without pack QC, lineage, or frozen-plan inputs |
| Scientific limits | Downsampled Kirchhoff, invented CRS 0, no fixtures like GIS/LAS |

Start seismic only as a complete pack: catalog contract, registered
capabilities, DAG, provenance, viewer, QC, fixtures, and explicit scientific
limits. Do not claim `read_segy` is enough.

Do not follow this pack with shapefile/GeoPackage geoprocessing, production
`ert.invert2d`, Complete Bouguer auto-grant, or QGIS/ArcGIS equivalence.
