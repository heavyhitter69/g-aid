# GPR desktop / section verification

Workspace route: `/workspace/verify-gpr` (same `SectionView` as the live
workspace), fed by versioned fixtures under
`tests/fixtures/validation-ui/G-AID Output/runs/r-verify-gpr*`.

Live React pass recorded 2026-08-27 at viewport 1280×800
(`results/gpr_desktop_ui.json`):

| Check | Result |
|---|---|
| Unmigrated title **GPR radargram (two-way time, not depth)** | pass |
| Z-axis **two-way travel time in ns, not depth**; model **not migrated** | pass |
| Filter/Nyquist coarse-dt **adjusted=true applied=true**, Nyquist **250.0 MHz**, applied **80–200 MHz** (0.8 × Nyquist), not a 0.999 clamp | pass |
| Undersampled default **refused=true applied=false** with Nyquist reason | pass |
| Migrated title **user-velocity depth, not ground truth**; velocity **1e8 m/s** | pass |
| Interpretation **geological_certainty_improved=false**; utilities/voids/archaeology/water table/rebar/lithology/measured depth not established | pass |
| Versioned runs `r-verify-gpr` / `r-verify-gpr-nyquist` / `r-verify-gpr-refuse` / `r-verify-gpr-mig` | pass |

Screenshots: `results/screenshots/gpr-radargram.webp`, `gpr-filter.webp`,
`gpr-migrated.webp`, `gpr-interpretation.webp`.

A packaged Electron executable was not launched; the verified UI is the Next.js
workspace that Electron hosts.

The grayscale radargram is a discrete sample grid, not a depth model and not a
utility map.
