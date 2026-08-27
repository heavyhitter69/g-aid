# LAS well-log / borehole pack

Borehole data is a **supported shared-platform pack** for documented **CWLS
LAS 2.0 WRAP.NO** well logs. It uses the existing catalog, adapters,
capability registry, compiled DAG, versioned runs, spatial workspace,
provenance, and interpretation controls.

There is **no** live `WellLogPipeline` / `BoreholePipeline`. LAS executes
through the same engine as magnetics / gravity / ERT / radiometrics / GPR.

This pack does **not** start topography-aware ERT. `ert.invert2d` remains
experimental.

## Support boundary

### Supported (processing inputs)

| Format | Adapter | When |
|---|---|---|
| CWLS LAS 2.0 text | `las-well` | VERS 2.x, WRAP.NO, ~Version/~Well/~Curve/~ASCII, depth index, curve units |

Preserved fields: well identifier, curve mnemonics, curve units, NULL, depth
index, STRT/STOP/STEP, well location, elevation datum, CRS / location quality,
header provenance. Unknown mnemonics are stored with **unknown semantics**.

### Recognised, not processed

| Input | Why |
|---|---|
| LASF / LAZ point clouds | LiDAR, not a well log (`las-point-cloud`) |
| WRAP.YES | Unwrapping is not implemented |
| LAS 3.0 | Version not in this pack |
| Missing curve units, malformed headers, duplicate/non-monotonic depths | Contract failure |

### Collar / map

A collar GeoJSON is written only when coordinates **and** a documented EPSG
(or explicit user-confirmed CRS for geographic LATI/LONG as EPSG:4326) exist.
Vertical logs without location remain viewable. No map position or 3-D
trajectory is invented. Deviation surveys are not a well path.

### Capabilities

| Id | Kernel | Default chat |
|---|---|---|
| `borehole.ingest_las` | `las_ingest` | yes |
| `borehole.view_logs` | `borehole_view` | yes |
| `borehole.map_collar` | `borehole_map_collar` | when the user asks map/collar/GIS, or location+CRS is documented |
| `borehole.interpret` | `borehole_interpret` | yes |

Not registered: lithology classification, aquifer identification,
mineralisation, well correlation, resource estimation, drill targeting,
TVD conversion, directional trajectories.

## Outputs

- `borehole_canonical.csv`
- `borehole_ingest_qc.json`
- `borehole_tracks.json` / `.meta.json`
- `borehole_collar.geojson` (when valid) + QC
- `borehole_interpretation.json`
- `lineage_*.json`

## User-facing workflow

1. Open a survey folder. The catalog content-sniffs `.las` (LASF → LiDAR;
   `~V/~W/~C` → well log).
2. Ask to process the well log / LAS / borehole.
3. Review the frozen plan (LAS 2.0 WRAP.NO, measured depth, interpretation limits).
4. Proceed. Inspect the log viewer (depth down, null gaps, selectable curves)
   and, when CRS is valid, the mapped collar and overlapping same-CRS layers.

Desktop click-through of `/workspace/verify-las` is recorded in
`docs/validation/results/las_desktop_ui.json`.

## Next recommended pack

Additional **field-instrument contracts** that broaden real survey coverage
(documented GIS/vector overlays already partly live, or further magnetic /
gravity instrument formats) — not production `ert.invert2d` and not Complete
Bouguer.
