# Geochemistry and spatial sample pack

Geochemical assays, soil/rock/stream-sediment samples, and sample-location
tables are a **supported shared-platform pack**. It uses the existing catalog,
CRS model, capability registry, compiled DAG, versioned runs, provenance, map
workspace, and interpretation safeguards.

There is **no** live `GeochemPipeline`. Assays execute through the same engine
as magnetics / gravity / ERT / radiometrics / GPR / LAS / GIS.

This pack does **not** claim ore, economic grade, mineralisation, drill
targets, anomaly detection, prospectivity, resource estimation, or
machine-learning classification.

## Support boundary

### Supported (processing inputs)

| Format | Adapter | When |
|---|---|---|
| G-AID GEOCHEM 1.0 CSV | `geochem-csv` | Comment banner `G-AID GEOCHEM` **or** both `/ CRS=` and `/ Medium=`, plus named `SampleID`, `X`, `Y`, documented element columns (`Au_ppm`, `Cu_ppm`, `Fe_pct`, …). |
| G-AID GEOCHEM 1.0 XYZ | `geochem-xyz` | Same contract, whitespace-delimited. |

Required metadata: sample ID, coordinates, documented CRS, sample medium/type,
element columns with units. Lab, method, date, batch, QCFlag,
duplicate/blank/standard flags, detection limits, qualifiers, and source
provenance are preserved when present.

Noncanonical headers (Easting/SITE/Au) stay **recognised-unsupported** until a
**user-reviewed column mapping** is stored.

An arbitrary CSV is **not** geochemistry because it contains Fe, Cu, Au, K, U,
or Th column names. `tables/chemistry.csv` remains `delimited-table`.

### Recognised, not processed

| Input | Why |
|---|---|
| Chemistry CSV with element-like names only | No GEOCHEM contract |
| Missing CRS | Strict ingest requires documented CRS |
| Unknown/ambiguous element headers without mapping | Must not guess Au from gold |
| Radiometric K/eU/eTh tables | Separate RAD 1.0 pack |

## Data semantics

- **Raw** assay values are stored with qualifier, detection limit, and
  `censored` flags.
- Values below detection (`<0.01`, `BDL`, `ND`, qualifier `<`/`U`) are
  **censored**, never zero, never imputed, never silently log-transformed.
- **Derived** products are not computed in this pack except an optional
  user-approved **display-only** `log10` of strictly positive uncensored
  values (`geochem.display_transform`). Originals and parameters are kept.
- Mixed or unknown units **block** direct element comparison.

## QC rules

- Coordinate/CRS quality, duplicate sample IDs, duplicate locations, mixed
  units, element-name ambiguity, invalid numerics, detection limits,
  qualifiers, missing sample metadata.
- Blanks, standards, field duplicates, and lab duplicates are summarised
  **only** when those `QCFlag` records **and** explicit expected-value rules
  (`/ StandardExpected=`) are present. Otherwise counts are listed and
  pass/fail is not invented.

## Capabilities (shared DAG)

| Id | Default chat | Kernel |
|---|---|---|
| `geochem.ingest` | yes | `geochem_ingest` |
| `geochem.qc` | yes | `geochem_qc` |
| `geochem.map_points` | yes | `geochem_map_points` |
| `geochem.summary` | yes | `geochem_summary` |
| `geochem.display_transform` | only if the user asks for log/transform **and** approves it | `geochem_display_transform` |
| `geochem.interpret` | yes | `geochem_interpret` |

Node order: ingest → qc → map_points → summary → display_transform (optional) → interpret.

## Outputs

Versioned under `G-AID Output/runs/<runId>/`:

- `geochem_canonical.csv` / `.json` (raw + qualifier/DL/censored + mapping + CRS/medium/units)
- `geochem_ingest_qc.json`, `geochem_qc.json`, `geochem_mapping.json`
- `geochem_points.geojson` + `.meta.json` (skipped without CRS)
- `geochem_summary.json`
- `geochem_display.csv` + `.meta.json` when approved
- `geochem_interpretation.json`
- `lineage_*.json`

Map legend shows element, unit, qualifier, source, filter state, and visual
scale (raw observation, not an anomaly score).

## Interpretation limits

High values are observations, not ore, economic grade, mineralisation
confirmation, or drill targets. Reports state analytical limitations, sample
medium, coverage bias, detection-limit treatment, assumptions, uncertainty,
recommendations, and not-established conclusions.
`geological_certainty_improved` is always false.

Spatial association with faults, geology, gravity, magnetics, radiometrics,
or other layers is coincidence, not causal evidence.

## Not in this pack

Anomaly detection, prospectivity scoring, mineral targeting, resource
estimation, machine-learning classification, silent unit conversion,
interpolation as mineralisation, Complete Bouguer auto-grant, production
`ert.invert2d`, SEG-Y.
