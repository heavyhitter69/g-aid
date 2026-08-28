# Geochemistry desktop UI verification

Route: `/workspace/verify-geochem`

The page loads `/api/verify/geochem` and uses the same `GridMapView` as the
workspace. Tabs: catalog, points, bdl, mixed, qc, overlay, interpretation.

Expected:

1. Catalog distinguishes supported GEOCHEM 1.0 from missing CRS / unknown
   headers. `chemistry.csv` is not in this fixture set and remains
   `delimited-table` in the catalog-project tests.
2. Points map shows element, unit, qualifier, source, filter state, visual
   scale. Warnings state observations are not ore.
3. BDL tab: `n_censored > 0`, `replaced_bdl_with_zero=false`.
4. Mixed tab: comparison blocked (ppm vs pct).
5. QC tab lists duplicates / QAQC applied only when rules exist.
6. Overlay tab: geology coincidence warning.
7. Interpretation: `geological_certainty_improved=false` and not-established
   ore/grade/mineralisation/drill targets.

Results JSON: `docs/validation/results/geochem_desktop_ui.json`.
