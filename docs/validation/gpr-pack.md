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

## Live operations

All of the following are `supportLevel: "supported"` and have Python kernels
plus tests:

| Capability | Kernel | Notes |
|---|---|---|
| `gpr.ingest` | `gpr_ingest` | Strict ingest/QC of bound gpr-csv records |
| `gpr.process` | `gpr_process` | Dewow, time-zero, SEC t² gain, Butterworth (Jol 2009) |
| `gpr.migrate` | `gpr_migrate` | Optional Kirchhoff time migration (Yilmaz 2001); **off by default** |
| `gpr.gis` | `gpr_gis_export` | Trace GeoJSON at the documented EPSG; `y=0` if no northing |
| `gpr.interpret` | `gpr_interpret` | Evidence-bound limits; no utilities/voids/archaeology as fact |

Default chat “process the gpr” grants ingest, process, and interpret.
Migration is granted only when the user asks to migrate **and** supplies a
velocity (chat `m/s` or `m/ns`, or a documented `VelocityMs`/`VelocityMns` on
the bound contract). GIS is granted when the user asks for GeoJSON/map traces.

The DAG never includes `file_discovery`. Bandpass defaults to
**0.2–2.0 × AntennaMHz** when `fLowHz`/`fHighHz` are not supplied, and QC
records `bandpass_defaulted_from_antenna`.

## Section viewer

`gpr_radargram.csv` and `gpr_migrated.csv` open as `gpr-radargram`:

- Unmigrated: vertical axis is **two-way time (ns), not depth**. Linear grayscale (not log resistivity).
- Migrated: vertical axis is `0.5 v t` with the **user-supplied** velocity. That is not ground truth.

Product copy, QC `product_name`, and interpretation never call this a depth
model, a utility map, or Complete Bouguer.

## Interpretation limits

A radargram is an observation. Interpretation JSON lists utilities, voids,
archaeology, water table, rebar, lithology, and measured depth as
**not established**. Overlay and colour scale do not prove a buried object.

## Required user confirmations

1. Bind a **supported** GPR-contract catalog record (not the first `.dzt`).
2. Do not ask G-AID to invent dt, dx, antenna frequency, CRS, or velocity.
3. Kirchhoff migration needs an explicit velocity. 0.1 m/ns is not a default.
4. Click **Proceed** on the hash-frozen DAG. A rerun always creates a new run
   folder.

## Unsupported (refused)

- Arbitrary GSSI DZT decode as a processing input
- Assumed dielectric constant or 0.1 m/ns velocity
- Time-to-depth as a measured earth model
- Utilities, voids, archaeology, rebar, water table, or lithology as fact
- 3-D migration, topographic correction, attribute analysis as live products
- Joint inversion with magnetics, gravity, ERT, or radiometrics
- A live `GprPipeline` execution route

## Next recommended complete pack

Do **not** begin topography-aware ERT, and do **not** promote `ert.invert2d`
to production until its stated recovery gates are met. Complete Bouguer
Anomaly remains **not supported**; zoned planar terrain is a separately
approved gravity product.
