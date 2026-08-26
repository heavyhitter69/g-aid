# Phase 5B validation status — near-zone terrain-corrected Bouguer and ERT

G-AID does **not** advertise a Complete Bouguer Anomaly. The implemented gravity
product is a **near-zone terrain-corrected Bouguer anomaly** (`grav.terrain_near_zone`).
The ERT pack is G-AID ERT 1.0 ingest, labelled pseudosection, and a tested 2-D
smoothness invert. Neither pack claims Oasis montaj or Res2DInv equivalence.

**Support bar:** not fully met until independent kernel benchmarks, synthetic ERT
recovery limits, and desktop UI verification of map/section/CRS/provenance are
all recorded below.

## Gravity kernel benchmarks

Independent oracles (not the production TC loop):

| Case | Oracle | Tolerance | Result |
|---|---|---|---|
| Compact prism vs Gauss–Legendre Newton ∭ z r⁻³ dV | Newton volume integral | 0.005 mGal or 1% | recorded in `results/gravity_terrain_benchmarks.json` |
| West-octant prism (signed Nagy logs) | same | 0.005 mGal or 1% | same file |
| Rewritten Nagy 1966 eight-corner form | independent code path | 1e-4 mGal | same file |
| Wide prism vs analytic slab 2πGρh | Bullard A | 6% relative | same file |
| Bullard B small-h | LaFehr 1991 2πGρ h²/R | 1% relative | same file |
| One DEM cell vs rewritten prism | Nagy closed form | 1e-3 mGal | same file |
| Flat DEM / plateau self-consistency | TC≈0 and TC→2πGρH | existing fixtures | `python/tests/test_gravity_terrain.py` |

Kernel note: the first independent check found that `log(|x|+r)` in the Nagy
corners was wrong in negative octants. Production now uses signed `log(x+r)`
as in Nagy 1966.

## ERT synthetic recovery

Independent forward: homogeneous ρa = ρtrue, and Wenner two-layer image series
(Telford 1990 §8.4). Invert is the production smoothness kernel.

| Case | Expected limit | Result |
|---|---|---|
| Homogeneous 100 Ω·m + 5% noise | median within 15% of 100 | recorded in `results/ert_synthetic_recovery.json` |
| Two-layer 50/500 Ω·m + 5% noise | **1-D layering is not recovered**; medians recorded as a limitation | same file |
| Lateral conductive vs 200 Ω·m | contrast recorded, not required | same file |

This invert is not Res2DInv, not 3-D, and does not use topography in the forward.

## Desktop / map verification

Workspace route: `/workspace/verify-phase5b` (same `GridMapView` and `SectionView`
as the live map workspace), fed by versioned fixtures under
`tests/fixtures/validation-ui/G-AID Output/runs/`.

Checks:

- Gravity grid legend is **Near-zone terrain-corrected Bouguer (not complete Bouguer)**
- Warnings include near-zone window, far-zone/intermediate-zone omitted, Bullard B status, DEM cell size/coverage/datum, density
- ERT pseudosection labelled not a depth model
- ERT invert labelled smoothness model, not Res2DInv
- CRS overlay conflict warning (EPSG:32630 vs 4326)
- Versioned run id + plan hash provenance

UI verification outcome is filled after the desktop pass in this run.

## Product copy that remains forbidden

- Complete Bouguer Anomaly (for this radius-limited product)
- Oasis montaj / Res2DInv equivalence
- Groundwater confirmation, lithology certainty, ore bodies, drill targets
- Far-zone / Hayford–Bowie / 167 km terrain
