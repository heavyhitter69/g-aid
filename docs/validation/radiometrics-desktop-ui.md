# Radiometrics desktop / map verification

Workspace route: `/workspace/verify-radiometrics` (same `GridMapView` and
`TernaryView` as the live map workspace), fed by versioned fixtures under
`tests/fixtures/validation-ui/G-AID Output/runs/r-verify-rad-*`.

Live React pass recorded 2026-08-27 at viewport 1280×800
(`results/radiometrics_desktop_ui.json`):

| Check | Result |
|---|---|
| Concentration K grid legend **K channel (%K)** from artifact metadata | pass |
| Colorbar **1.00 – 2.90 %K**; CRS EPSG:32630; not nT | pass |
| Ternary heading **K-eTh-eU ternary (not lithology)**; channel units K=%K, eU=ppm eU, eTh=ppm eTh | pass |
| Ratios skipped=false; units eU/K **ppm eU / %K**; columns eu_eth, eu_k, eth_k | pass |
| Count-rate K grid units **cps**; ternary and ratios unavailable | pass |
| Unknown-units colorbar **unknown**; unit-specific legend/ternary/ratio/interpretation blocked | pass |
| Versioned runs `r-verify-rad-conc` / `r-verify-rad-cps` / `r-verify-rad-unknown` with parent `r-verify-rad-parent` and plan hashes | pass |

Screenshots: `results/screenshots/radio-k-grid.webp`, `radio-ternary.webp`,
`radio-ratios.webp`, `radio-count-rate.webp`, `radio-unknown-units.webp`,
`radio-provenance.webp`.

A packaged Electron executable was not launched; the verified UI is the Next.js
workspace that Electron hosts.

Filenames are **not** a unit source. Bare `rad_k_grid.asc` maps to `unknown`
until catalog or `.meta.json` units are bound.
