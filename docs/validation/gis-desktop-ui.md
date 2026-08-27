# GIS vector desktop UI verification

Workspace route: `/workspace/verify-gis` (same `GridMapView` as the live map
workspace), fed by versioned fixtures under
`tests/fixtures/validation-ui/G-AID Output/runs/r-verify-gis*` and the catalog
built from `tests/fixtures/gis-project`.

Live React pass recorded 2026-08-27 at viewport 1280×800
(`results/gis_desktop_ui.json`):

| Check | Result |
|---|---|
| Catalog: `geology.geojson` supported EPSG:32734, role generic until user assigned geology | pass |
| Catalog: no-CRS GeoJSON recognised-unsupported; RFC 7946 not assumed | pass |
| Catalog: incomplete shapefile missing `.shx/.dbf/.prj`; complete sidecars still not parsed | pass |
| Catalog: GeoPackage recognised-unsupported | pass |
| Points map SAMPLE_ID unknown semantics; Points checkbox hide/restore | pass |
| Lines map `faults.geojson` LineString role structure (user-assigned); filename not a role | pass |
| Polygons map geology.geojson remains unassigned generic vector | pass |
| Unknown CRS `skipped=true reason=gis_crs_required`; no overlay; no silent reprojection | pass |
| Conflicting CRS EPSG:32734 vs EPSG:4326 blocked; reprojection not registered | pass |
| Overlap tenure polygon + sample points; contains / bbox-overlap; not a prospectivity map | pass |
| Interpretation Observations / Assumptions / Uncertainty / Recommendations / Not established; `geological_certainty_improved=false` | pass |

Screenshots: `results/screenshots/gis-catalog.webp`, `gis-points.webp`,
`gis-lines.webp`, `gis-polygons.webp`, `gis-unknown-crs.webp`,
`gis-conflict-crs.webp`, `gis-overlap.webp`, `gis-interpretation.webp`.

A packaged Electron executable was not launched; the verified UI is the Next.js
workspace that Electron hosts.

Spatial overlap is geometric coincidence. It does not establish geological,
mineral, or causal relationships.
