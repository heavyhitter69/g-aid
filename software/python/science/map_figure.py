"""Cartographic figures a QP can put in a report.

Not Oasis map templates. Equal-aspect projected axes, percentile-clipped
colour, optional NW hillshade, scale bar, north arrow, title block, EPSG.
"""

from __future__ import annotations

from datetime import datetime, timezone

import numpy as np

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, Rectangle
from matplotlib.colors import LightSource

from science.grid import Grid


def _nice_length(width_m: float) -> float:
    target = max(width_m / 5.0, 1.0)
    exp = 10 ** np.floor(np.log10(target))
    for step in (1.0, 2.0, 5.0, 10.0):
        if step * exp >= target * 0.6:
            return float(step * exp)
    return float(10.0 * exp)


def _hillshade(values: np.ndarray, dx: float, dy: float) -> np.ndarray:
    ls = LightSource(azdeg=315, altdeg=45)
    finite = np.where(np.isfinite(values), values, np.nanmedian(values))
    return ls.hillshade(finite, vert_exag=1.0, dx=max(dx, 1e-6), dy=max(dy, 1e-6))


def write_potential_field_map(
    grid: Grid,
    path: str,
    *,
    title: str,
    product: str,
    units: str | None = None,
    survey: str = "",
    cmap: str = "RdBu_r",
    hillshade: bool = True,
    clip: tuple[float, float] = (2.0, 98.0),
) -> str:
    data = grid.masked()
    finite = data[np.isfinite(data)]
    if finite.size == 0:
        raise ValueError(f"Grid {grid.name} has no finite values")
    vmin, vmax = np.percentile(finite, list(clip))
    if vmin == vmax:
        vmax = vmin + 1.0
    # Residual-style maps: centre the colour bar on zero when the range crosses it.
    if vmin < 0 < vmax:
        mag = max(abs(vmin), abs(vmax))
        vmin, vmax = -mag, mag

    xmin, xmax = grid.xmin, grid.xmax
    ymin, ymax = grid.ymin, grid.ymax
    width_m = abs(xmax - xmin)
    height_m = abs(ymax - ymin)
    aspect = height_m / max(width_m, 1e-6)
    fig_w = 8.5
    fig_h = max(6.5, min(11.0, fig_w * aspect + 1.8))

    fig, ax = plt.subplots(figsize=(fig_w, fig_h), dpi=300)
    extent = [xmin, xmax, ymin, ymax]
    rgb = plt.get_cmap(cmap)(np.clip((np.nan_to_num(data, nan=vmin) - vmin) / (vmax - vmin), 0, 1))[..., :3]
    if hillshade:
        shade = _hillshade(data, grid.dx, grid.dy)
        rgb = np.clip(rgb * (0.55 + 0.45 * shade[..., None]), 0, 1)
    ax.imshow(np.where(np.isfinite(data)[..., None], rgb, 1.0), origin="upper", extent=extent, aspect="equal")
    mesh = plt.cm.ScalarMappable(cmap=cmap, norm=plt.Normalize(vmin=vmin, vmax=vmax))
    mesh.set_array([])

    ax.set_xlabel("Easting (m)")
    ax.set_ylabel("Northing (m)")
    ax.ticklabel_format(style="plain", useOffset=False)
    ax.grid(True, color="0.85", linewidth=0.3, linestyle=":")

    cbar = fig.colorbar(mesh, ax=ax, fraction=0.046, pad=0.04)
    cbar.set_label(units or grid.units)

    bar_len = _nice_length(width_m)
    x0 = xmin + width_m * 0.06
    y0 = ymin + height_m * 0.06
    ax.add_patch(Rectangle((x0, y0), bar_len, height_m * 0.012, facecolor="black", edgecolor="black", zorder=5))
    ax.text(
        x0 + bar_len / 2,
        y0 + height_m * 0.028,
        f"{int(bar_len) if bar_len >= 10 else bar_len:g} m",
        ha="center",
        va="bottom",
        fontsize=8,
        color="black",
        zorder=5,
    )

    nx = xmax - width_m * 0.08
    ny = ymax - height_m * 0.12
    ax.add_patch(
        FancyArrowPatch(
            (nx, ny),
            (nx, ny + height_m * 0.08),
            arrowstyle="-|>",
            mutation_scale=14,
            linewidth=1.2,
            color="black",
            zorder=5,
        )
    )
    ax.text(nx, ny + height_m * 0.09, "N", ha="center", va="bottom", fontsize=9, fontweight="bold", zorder=5)

    survey_line = f" — {survey}" if survey else ""
    heading = title.strip() if title else f"{product}{survey_line}"
    ax.set_title(heading, fontsize=12, pad=10)

    when = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    footer = (
        f"EPSG:{grid.crs_epsg}   |   {units or grid.units}   |   "
        f"colour clip {clip[0]:.0f}–{clip[1]:.0f} percentile   |   "
        f"sun from NW   |   G-AID {when}"
    )
    fig.text(0.5, 0.015, footer, ha="center", va="bottom", fontsize=7, color="0.25")
    fig.tight_layout(rect=(0.02, 0.04, 0.98, 0.96))
    fig.savefig(path, dpi=300, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return path
