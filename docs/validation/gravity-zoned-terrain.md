# G-AID zoned gravity terrain convention

This document is the supported convention for `grav.terrain_near_zone`,
`grav.terrain_intermediate_zone`, and `grav.terrain_far_zone`. They run on the
shared catalog, capability registry, approved DAG, versioned runs, provenance,
map workspace, and interpretation safeguards. There is no separate gravity
pipeline.

**Complete Bouguer Anomaly is not scientifically justified in G-AID product
copy for this convention.** QC always records `complete_bouguer: false` and
`complete_bouguer_justified: false`.

## Supported reduction

```
Δg = g_obs − γ_Somigliana(WGS-84) + 0.3086 h
     − 2πGρh
     [+ Bullard B (LaFehr 1991 small-h) if requested]
     + TC_near + TC_int + TC_far
```

| Term | Status |
|---|---|
| Normal gravity | Somigliana / WGS-84 (Moritz 2000). Geodetic latitude required. |
| Free-air | `0.3086 h` mGal, h metres. |
| Simple Bouguer (Bullard A) | Infinite slab `2πGρh` with `TWO_PI_G_MGAL = 0.041908`. Density required; never silent 2.67. |
| Bullard B | Optional. LaFehr 1991 small-h expansion. Off unless requested. |
| Terrain | Nagy 1966 rectangular prisms, **planar**. TC = `|gz|` of DEM-minus-slab mass. |
| Atmospheric correction | **Not implemented.** |
| Isostatic correction | **Not implemented.** |
| Hayford–Bowie compartments | **Not implemented.** Only the 166.7 km outer-radius number is used. |
| Spherical-Earth far-zone theory | **Not implemented.** |
| DEM download (ETOPO/SRTM/global) | **Never.** Missing coverage is a skip, not a silent pass. |

## Zone partitioning

| Zone | Window | Geometry | DEM | Default |
|---|---|---|---|---|
| Near | `0 → R_near` | Planar Nagy, **native** cells | Bound `dem-ascii` only | User `terrainRadiusM` or DEM extent |
| Intermediate | `R_near → min(R_int, DEM)` | Planar Nagy, **aggregated** cells when the DEM is large | Same bound DEM; skip if coverage &lt; 95% | `R_int = 166700 m` (Hayford–Bowie zone O radius) |
| Far | `max(applied R_int, 166.7 km) → farRadiusM` | Planar Nagy, aggregated | **Only if the bound DEM covers `farRadiusM`** | No default radius. `farRadiusM` required to attempt. |

Coverage inside each ring must be ≥ 95% or that ring is not applied. Terrain
outside the bound DEM is not invented.

## Datum, density, CRS

- Horizontal CRS of stations and DEM must match. No silent reprojection.
- Vertical datum (`orthometric` or `ellipsoidal`) must be documented and match.
- Elevation units metres.
- Reduction density is user-confirmed on the frozen plan.

## DEM sources and resolution

The only supported terrain source is a **bound `dem-ascii` catalog record**
(EPSG, `Units=m`, `ElevationDatum`). Cell size is recorded in QC. Outer rings
may aggregate to a target of 500 m cells so large DEMs stay tractable; small
local DEMs keep native cells so rings stay resolved. This aggregation is a
documented approximation, not a spherical far-zone theory.

## Expected accuracy limits

Independent checks (see `results/gravity_terrain_benchmarks.json` and
`results/gravity_zoned_terrain_benchmarks.json`):

- Compact prism vs Gauss–Legendre Newton volume integral: 0.005 mGal or 1%.
- Rewritten Nagy 1966 eight-corner form: 1e-4 mGal vs production.
- Wide prism vs analytic slab 2πGρh: 6% relative.
- Bullard B small-h vs 2πGρ h²/R: 1% relative.
- Annulus additivity TC(R2)−TC(R1): 1e-6 mGal.
- Prism ring vs on-axis cylinder closed form: 25% relative (squares ≠ circle).
- Flat plateau intermediate ring: ~0 mGal.
- Far ring without covering DEM: skipped, TC = 0, reason recorded.

These bounds do **not** include DEM error, near-station survey detail finer
than the DEM, spherical curvature of distant terrain, or atmospheric mass.

## What is still excluded

- Local near-station survey detail finer than the bound DEM
- DEM uncertainty / geoid vs ellipsoid mismatch beyond the documented datum flag
- Atmospheric correction
- Global terrain coverage / ETOPO / SRTM download
- Hayford–Bowie compartment geometry
- Spherical-Earth far-zone theory
- Isostatic compensation
- Commercial Complete Bouguer (Oasis montaj or otherwise)

## User-facing workflow

1. Bind supported gravity-contract stations and a `dem-ascii` record.
2. Confirm density, CRS, elevation datum, and near-zone radius (or DEM extent).
3. Ask for near-zone terrain, intermediate-zone / Hayford–Bowie 166.7 km, and/or
   far-zone terrain / Complete Bouguer. Chat may **grant** the zoned
   capabilities; review copy still refuses Complete Bouguer naming.
4. Supply `farRadiusM` &gt; 166.7 km to *attempt* far-zone TC. If the bound DEM
   does not cover that radius, the far ring is skipped and recorded.
5. Click **Proceed** on the hash-frozen DAG. A rerun always creates a new run
   folder. Artifacts stay in `G-AID Output/runs/{runId}/`.

## Is “Complete Bouguer Anomaly” justified?

**No.** G-AID must not use that term as a product name. The implemented
convention is a **zoned planar Nagy terrain-corrected Bouguer on a bound DEM**,
with optional Bullard B, without atmosphere, without spherical far-zone theory,
and without guaranteed 166.7 km (let alone global) coverage.
