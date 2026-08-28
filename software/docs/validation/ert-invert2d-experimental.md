# ERT support boundary — experimental invert2d

G-AID does **not** advertise a production ERT inversion pack.

| Capability | Support level |
|---|---|
| `ert.ingest` | **Supported** under the G-AID ERT 1.0 contract |
| `ert.pseudosection` | **Supported** (plotting convention; not a depth model) |
| `ert.invert2d` | **Experimental** — off the default ERT workflow |
| `ert.interpret` | Supported limits report (no groundwater/lithology/ore/drill claims) |
| Topography-aware ERT | **Not started** — blocked until flat-terrain invert meets production thresholds |

Default chat/plan for ERT is ingest + labelled pseudosection + interpretation limits.
`ert.invert2d` is granted only when inversion is explicitly requested, and the plan
records that it is not a production pack.

## Live invert kernel

Flat-topography **2.5-D finite-difference** Poisson solve (Dey & Morrison 1979)
with a ∇φ·∇φ Frechet and smoothness-constrained Gauss–Newton. Geometric factors
as Telford et al. (1990) §8.4. Topography unused. Not Res2DInv.

The 2.5-D cosine-transform source/inverse pair is not yet accurate enough for
unscaled ρa. A homogeneous-half-space scale is applied (documented limitation).
Unscaled Frechet row sums are not 1; the invert applies a median-row scale.
Independent two-layer true resistivities are therefore not recovered.

The previous homogeneous-half-space Gaussian kernel is kept as
`invert_2d_sensitivity_kernel`. Its failed two-layer case is in
`docs/validation/results/ert_synthetic_recovery.json` and is not deleted.

## Validation programme

Recorded in `docs/validation/results/ert_invert2d_benchmarks.json`.

| Case | Oracle | Threshold | Required for production |
|---|---|---|---|
| Homogeneous 100 Ω·m + 5% noise (Wenner, dipole-dipole, Schlumberger) | ρa = ρtrue | median within 25%; misfit < 25% | yes |
| Two-layer Wenner (50/500 h=8 m, 50/500 h=4 m, 200/40 h=8 m) | Telford 1990 §8.4 image series | polarity + shallow closer to overburden | yes (pass does not equal production) |
| True two-layer resistivities | same image series | each layer median within 40% of true ρ | **yes — currently fail** |
| Buried conductive/resistive block | independent 2-D oracle | location + contrast | **yes — oracle not implemented** |
| 12× outliers on homogeneous data | ρa = ρtrue | median within 45% of background | yes |
| 2.5-D forward vs Wenner image series | Telford 1990 §8.4 | median relative error < 30% | diagnostic |
| Jacobian Euler / cumulative \|J\| vs depth | Frechet on homogeneous 100 Ω·m | documented, not a production DOI | diagnostic |
| Historical Gaussian two-layer 50/500 | Telford 1990 §8.4 | preserved failure (layering not recovered) | preserved artifact |

Independent closed-form two-layer oracles exist for **Wenner** only in this
programme. Dipole-dipole and Schlumberger layered recovery is not independently
scored. Self-consistent 2.5-D buried-target synthetics cannot earn production
support by themselves.

## Declared recovery thresholds (status)

| Case | Threshold | Status |
|---|---|---|
| Homogeneous 100 Ω·m + 5% noise (Wenner, dipole-dipole, Schlumberger) | median within 25% | pass |
| Two-layer Wenner image series (independent) | polarity + shallow closer to overburden | pass |
| True two-layer resistivities within 40% | required for **production** | **fail** (50/500 h=8 recovers ~69 / ~139; 50/500 h=4 recovers ~91 / ~233; 200/40 h=8 happens to pass ~262 / ~47) |
| Sharp layer boundary | not claimed | not recovered |
| Buried conductive/resistive block | independent 2-D oracle | **not available**; self-consistent contrast **not recovered** |
| 12× outliers | median stays near background | pass (misfit may exceed 25% because outliers remain in the data) |
| 2.5-D forward vs Wenner image series | median relative error < 30% | pass (~18%) |

**Production support: not earned.** Polarity of 1-D layering is now recovered by
the 2.5-D invert; true resistivities, sharp boundaries, and independent 2-D
target recovery are not.

## Interpretation guardrails

- Pseudosections are not depth models.
- Experimental inversions are not groundwater, lithology, ore-body, or drill-target evidence.
- Failed or poorly resolved models must not generate affirmative interpretation language.

## Next extension

Topography-aware ERT is **not** the next implementation step until this
flat-terrain invert meets the true-resistivity production threshold and an
independent 2-D target oracle exists.
