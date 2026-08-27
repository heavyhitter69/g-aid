# GPR pack — G-AID GPR 1.0 processed radargram

Ground-penetrating radar is a **supported shared-platform pack** for a
documented **G-AID GPR 1.0** CSV. It uses the existing catalog, adapters,
capability registry, compiled DAG, versioned runs, section viewer, provenance,
and interpretation controls.

This pack does **not** start topography-aware ERT. `ert.invert2d` remains
experimental and is not the default ERT workflow. There is **no** live
`GprPipeline`; GPR executes through the same engine as magnetics / gravity /
ERT / radiometrics.

## Support boundary

### Supported (processing inputs)

| Format | Adapter | When |
|---|---|---|
| Named CSV | `gpr-csv` | G-AID GPR 1.0 header + Trace / Sample / Amplitude |

Required contract comments:

```
/ G-AID GPR 1.0
/ Units=<documented amplitude unit>
/ dt_ns=<positive sample interval>
/ dx_m=<positive trace spacing>
/ AntennaMHz=<positive centre frequency>
```

Optional:

- `/ EPSG=…` — required only for GIS/map export. Section viewing does not invent a CRS.
- `/ VelocityMns=` or `/ VelocityMs=` — recorded when present; **never assumed**.

Columns: **Trace**, **Sample**, **Amplitude** (canonical names or aliases).

### Recognised, not processed

| Input | Adapter | Why |
|---|---|---|
| GSSI DZT (`.dzt`) | `gpr-dzt` | Binary headers are not a source of dt, dx, or antenna frequency |
| GPR-like CSV missing banner, Units, dt_ns, dx_m, or AntennaMHz | `gpr-csv` | Incomplete contract |

### Not GPR

An amplitude table without the G-AID GPR 1.0 banner is **not** GPR data.
A familiar `.dzt` extension is not a processing input.

## Live operations and limits

All of the following are `supportLevel: "supported"` and have Python kernels
plus tests. “Supported” here means the operation runs on a bound G-AID GPR 1.0
CSV with the documented refusals below — not that a radargram is a geological
interpretation.

| Capability | Kernel | Limit |
|---|---|---|
| `gpr.ingest` | `gpr_ingest` | Bound `gpr-csv` only. DZT stays recognised-unsupported. Sampling frequency and Nyquist are derived from `dt_ns` and recorded. |
| `gpr.process` | `gpr_process` | Optional frozen dewow (odd running mean, default window 31), time-zero (stack first-break at 0.05× peak), SEC `gain(t)=max(t,dt)^n exp(αt)` (default n=2, α=0), Butterworth order 4. Defaults are on and recorded. Two-way time, not depth. |
| `gpr.migrate` | `gpr_migrate` | Off by default. Requires a user velocity **and** `docs/validation/results/gpr_migration_benchmark.json` `all_passed`. Constant-velocity 2-D zero-offset Kirchhoff (Yilmaz 2001). `z = 0.5 v t` is not ground truth. |
| `gpr.gis` | `gpr_gis_export` | Trace GeoJSON at the documented EPSG; `y=0` if no northing. Skipped without EPSG. |
| `gpr.interpret` | `gpr_interpret` | Evidence-bound limits. Does not establish utilities, voids, archaeology, water table, rebar, lithology, or measured depth. |

Default chat “process the gpr” grants ingest, process, and interpret — **not**
migrate.

## Nyquist-safe filtering

Sampling frequency `fs = 1 / (dt_ns × 10⁻⁹)` Hz and Nyquist `fs/2` are derived
from the bound contract. Every requested or default Butterworth corner is
validated against Nyquist.

- Antenna default is **0.2–2.0 × AntennaMHz**.
- A high-cut **at or above Nyquist is refused**. G-AID never silently places a
  high-cut at 0.999 × Nyquist.
- If that antenna default is invalid, a **documented** safe high-cut of
  **0.8 × Nyquist** is applied when the 0.2 × AntennaMHz low-cut still fits.
- If the low-cut itself is not Nyquist-safe, the filter is skipped and the user
  must supply `fLowHz`/`fHighHz` below Nyquist.
- User-supplied corners that violate Nyquist are refused (not adjusted).

Sampling rate, Nyquist, requested filter, applied filter, and any
adjustment/refusal are recorded in the frozen plan, process QC, radargram
sidecar, lineage, and section warnings.

## Processing transparency

Dewow, time-zero, SEC gain, and band-pass are **optional**, visible in the
frozen plan, and reproducible from those parameters. Chat can skip a step
(`skip dewow`, `filter order=…`). A visually enhanced radargram does **not**
have improved geological certainty (`geological_certainty_improved: false`).

## Migration gate

The Kirchhoff operator is available only while the documented noise-free
zero-offset diffraction benchmark passes (peak within 1 trace and 2 samples of
the true apex; migrated energy near the apex > 2× unmigrated; apex amplitude
> 5× mean |flank|). Field data are not that case. 3-D migration, topography,
and laterally varying velocity are not implemented.

## Section viewer

`gpr_radargram.csv` and `gpr_migrated.csv` open as `gpr-radargram`:

- Unmigrated: vertical axis is **two-way time (ns), not depth**. Linear grayscale.
- Migrated: vertical axis is `0.5 v t` with the **user-supplied** velocity. That is not ground truth.

Product copy, QC `product_name`, and interpretation never call this a depth
model, a utility map, or Complete Bouguer.

## Desktop verification

Workspace route `/workspace/verify-gpr` (same `SectionView` as the live
workspace) is fed by versioned fixtures under
`tests/fixtures/validation-ui/G-AID Output/runs/r-verify-gpr*`. Recorded results
live in `docs/validation/results/gpr_desktop_ui.json` after a live click-through.

## Required user confirmations

1. Bind a **supported** GPR-contract catalog record (not the first `.dzt`).
2. Do not ask G-AID to invent dt, dx, antenna frequency, CRS, or velocity.
3. Kirchhoff migration needs an explicit velocity after the benchmark has passed. 0.1 m/ns is not a default.
4. Click **Proceed** on the hash-frozen DAG. A rerun always creates a new run folder.

## Unsupported (refused)

- Arbitrary GSSI DZT decode as a processing input
- Assumed dielectric constant or 0.1 m/ns velocity
- Silent high-cut clamp at 0.999 × Nyquist
- Time-to-depth as a measured earth model
- Utilities, voids, archaeology, rebar, water table, or lithology as fact
- 3-D migration, topographic correction, attribute analysis as live products
- Joint inversion with magnetics, gravity, ERT, or radiometrics
- A live `GprPipeline` execution route

## Unresolved limitations

- DZT remains recognised-unsupported; `parse_dzt` raises.
- Time is not depth unless the user supplies a velocity; that conversion is not ground truth.
- Migration passed a noise-free synthetic only.
- Dewow window, time-zero threshold, SEC exponents, and filter order are processing choices, not a unique earth model.
- GIS traces have `y=0` when northing is undocumented.

## Next recommended complete pack

Do **not** begin topography-aware ERT, and do **not** promote `ert.invert2d`
to production until its stated recovery gates are met. Complete Bouguer
Anomaly remains **not supported**; zoned planar terrain is a separately
approved gravity product.

The next complete pack should broaden **real field-data coverage** without
unresolved inversion claims: **LAS well-log ingest** (`las_ingest` / `parse_las`
already exist as stubs) so borehole curves can be catalogued, plotted, and
tied to existing gravity/magnetic/radiometric maps without claiming a joint
invert.
