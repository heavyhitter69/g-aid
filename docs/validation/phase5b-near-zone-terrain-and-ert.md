# Phase 5B validation status — near-zone terrain-corrected Bouguer and ERT

G-AID does **not** advertise a Complete Bouguer Anomaly. The implemented gravity
product is a **near-zone terrain-corrected Bouguer anomaly** (`grav.terrain_near_zone`).
The ERT pack is G-AID ERT 1.0 ingest, labelled pseudosection, and a tested 2-D
smoothness invert. Neither pack claims Oasis montaj or Res2DInv equivalence.

**Support bar for this pack:** met with the documented limits below. Independent
kernel benchmarks, synthetic ERT recovery limits, and a live desktop UI pass of
map / section / CRS / provenance are recorded. This does **not** meet the support
bar for Complete Bouguer, far-zone terrain, Hayford–Bowie, Res2DInv, 3-D ERT, or
topography-aware ERT.

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

Live React pass recorded 2026-08-26 at viewport 1280×800
(`results/phase5b_desktop_ui.json`):

| Check | Result |
|---|---|
| Gravity legend **Near-zone terrain-corrected Bouguer (not complete Bouguer)** | pass |
| Warning bar: DEM radius/extent, far-zone/intermediate omitted, Bullard B off, DEM 25 m / 100% coverage / orthometric, density 2.67 g/cm³ user-confirmed, not commercial Complete Bouguer | pass |
| Colorbar units mGal; CRS EPSG:32630 | pass |
| ERT pseudosection labelled not a depth model | pass |
| ERT invert labelled 2-D smoothness model, not Res2DInv | pass |
| CRS overlay blocked (EPSG:32630 vs 4326) | pass |
| Versioned run ids `r-verify-grav` / `r-verify-ert` | pass |

Screenshots: `results/screenshots/gravity-map.webp`, `ert-pseudosection.webp`,
`ert-invert.webp`, `provenance-crs.webp`.

A packaged Electron executable was not launched; the verified UI is the Next.js
workspace that Electron hosts. Kernel runs copy these JSON reports into the
versioned run folder when present.

## Product copy that remains forbidden

- Complete Bouguer Anomaly (for this radius-limited product)
- Oasis montaj / Res2DInv equivalence
- Groundwater confirmation, lithology certainty, ore bodies, drill targets
- Far-zone / Hayford–Bowie / 167 km terrain

## Next complete scientific pack (recommendation)

**Topography-aware ERT 2.5-D forward and invert** — only as a full pack with
ingest, an independent forward oracle, recovery tests on known structure plus
topography, QC, section visualisation, provenance, and interpretation limits.
Do not advertise it as Res2DInv.

Far-zone gravity terrain (Hayford–Bowie or equivalent) remains a separate pack
and is the only honest path to a Complete Bouguer product. It is not supported
today.
