# Radiometrics pack — G-AID RAD 1.0 already-corrected products

Radiometrics is a **supported shared-platform pack** for **already-corrected**
K / eU / eTh / total-count point or line tables. It uses the existing catalog,
adapters, capability registry, compiled DAG, versioned runs, map workspace,
provenance, and interpretation controls.

This pack does **not** start topography-aware ERT. `ert.invert2d` remains
experimental and is not the default ERT workflow.

## Support boundary

### Supported (processing inputs)

| Format | Adapter | When |
|---|---|---|
| Named CSV | `radiometric-csv` | G-AID RAD 1.0 header + canonical or reviewed mapping |
| Named XYZ | `radiometric-xyz` | Same contract, whitespace-separated |

Required contract:

- Named **X**, **Y**, **Line**, and at least one of **K**, **eU**, **eTh**, **TC**
- `/ EPSG=…`
- `/ Quantity=concentration` or `count_rate`
- Channel units (`UnitsK=%K`, `UnitsU=ppm eU`, `UnitsTh=ppm eTh`, `UnitsTC=nGy/h` or `cps`)
- `/ CorrectionHistory=…` (not unknown/none)
- Acquisition: `/ Platform=` and/or `/ Instrument=` and/or `/ AcquisitionDate=`
- Reviewed mapping when names are not canonical

**Count-rate** tables can be ingested, gridded, exported, and interpreted.
Ternary RGB and concentration ratios are **skipped** (not justified).

Displayed radiometric layers obtain quantity and units from the **bound catalog
record** or **versioned artifact metadata** (`.meta.json`, QC JSON, GeoJSON
`units`/`quantity`, ternary `channel_units`). Filenames are **not** a unit
source. If quantity or units are unavailable, the map shows `unknown` and
ternary, ratios, unit-specific legends, and interpretation claims are blocked.

### Recognised, not processed

| Input | Adapter | Why |
|---|---|---|
| Raw / channelised spectrometer (`ch0…`, live time) | `radiometric-spectrum` | Height, stripping, NASVD, dead-time, background, and concentration conversion are not live kernels |
| `Quantity=counts` | `radiometric-csv` / `xyz` | Raw counts are not an already-corrected product |
| Missing CRS, Line, units, acquisition, or correction history | same | Incomplete contract |
| Unreviewed alias column names | same | Explicit mapping required |

### Not radiometric

K, U, Th **assay** columns, geochemistry tables, unnamed numeric XYZ, and a
familiar extension are **not** radiometric data.

## Live operations

All of the following are `supportLevel: "supported"` and have Python kernels
plus tests:

| Capability | Kernel | Notes |
|---|---|---|
| `rad.ingest` | `rad_ingest` | Strict ingest/QC, line QC |
| `rad.grid` | `rad_grid` | Minimum-curvature interpolation of present channels; units from ingest metadata |
| `rad.ternary` | `rad_ternary` | R=K, G=eTh, B=eU; 2–98 percentile stretch; concentration with documented units only |
| `rad.ratios` | `rad_ratios` | eU/eTh, eU/K, eTh/K; concentration with documented units only |
| `rad.gis` | `rad_gis_export` | Sample GeoJSON at the documented EPSG |
| `rad.interpret` | `rad_interpret` | Evidence-bound limits; no mineralisation/lithology/alteration/drill claims |

Default chat “process radiometrics” grants this pack. The DAG never includes
`file_discovery` or `radiometric_correct`.

## Experimental

There is **no experimental radiometric correction capability** in this release.

## Unsupported (refused)

- Height correction, Compton stripping, NASVD, dead-time, background, and
  concentration conversion (`rad.correct` is unregistered)
- Raw spectrometer processing
- Radiometric derivatives as a live product
- Oasis montaj / IAEA default coefficients applied silently
- Joint inversion with magnetics, gravity, or ERT

Library formulas for height correction, stripping, and NASVD remain in
`python/science/radiometrics.py` for unit tests only. They are not dispatched.

## Required user confirmations

1. Bind a **supported** RAD-contract catalog record (not an assay, not a raw
   spectrum, not the first CSV).
2. Confirm a **column mapping** when names differ from X, Y, Line, K, eU, eTh, TC.
3. Do not ask G-AID to invent CRS, quantity (counts vs count-rate vs
   concentration), units, or correction history.
4. Click **Proceed** on the hash-frozen DAG. A rerun always creates a new run
   folder.

## Interpretation limits

Already-corrected maps, ternaries, and ratios are **not geology**. Interpretation
JSON sets `affirmative_language_allowed: false` and lists mineralisation,
lithology, alteration, and drill targets as **not established**.

## Next recommended complete pack

**Far-zone / intermediate-zone gravity terrain** is the only honest path toward
a Complete Bouguer Anomaly. GPR is the next unsupported method with existing
stubs. Do **not** begin topography-aware ERT, and do **not** promote
`ert.invert2d` to production until its stated recovery gates are met.
