# LAS desktop / log-viewer verification

Workspace route: `/workspace/verify-las` (same `LogView` as the live
workspace), fed by versioned fixtures under
`tests/fixtures/validation-ui/G-AID Output/runs/r-verify-las*`.

Live React pass recorded 2026-08-27 at viewport 1280×800
(`results/las_desktop_ui.json`):

| Check | Result |
|---|---|
| Heading **Borehole log (measured depth, not TVD or trajectory)** | pass |
| Axis **MD M ↓**; well **DEMO-1**; LAS **2.0 WRAP.NO**; DEPT metres | pass |
| Curves GR/RHOB/NPHI labelled **unknown semantics**; GR checkbox hides/restores the track | pass |
| Metadata **measured depth (not TVD)**, null **-999.25**, trajectory **not computed** | pass |
| Mapped collar **EPSG:4326** geographic/documented; overlap **TMI grid** only; not a well path | pass |
| Missing CRS **skipped=true reason=borehole_crs_required**; no fabricated GeoJSON | pass |
| Interpretation **geological_certainty_improved=false**; lithology/aquifer/mineralisation/TVD/trajectory not established | pass |
| Versioned runs `r-verify-las` / `r-verify-las-collar` / `r-verify-las-ncrs` | pass |

Screenshots: `results/screenshots/las-log-viewer.webp`, `las-collar-map.webp`,
`las-missing-crs.webp`, `las-interpretation.webp`.

A packaged Electron executable was not launched; the verified UI is the Next.js
workspace that Electron hosts.

Measured depth is a 1-D log index. It is not true vertical depth and not a
spatial trajectory.
