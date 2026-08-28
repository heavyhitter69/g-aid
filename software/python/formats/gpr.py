"""G-AID GPR 1.0 ingest. Arbitrary DZT is not a processing input."""

from __future__ import annotations

import io
import re
from typing import Any

import numpy as np
import pandas as pd

CANONICAL = {"trace": "Trace", "sample": "Sample", "amplitude": "Amplitude"}
ALIASES = {
    "trace": {"trace", "tr", "scan", "trace_index", "traceno"},
    "sample": {"sample", "nsamp", "twt", "sample_index"},
    "amplitude": {"amplitude", "amp", "value", "samples"},
}


def _norm(name: str) -> str:
    return re.sub(r"[\s\-]+", "_", str(name).strip().lower())


def parse_comment_meta(text: str) -> dict[str, Any]:
    comments = [ln.strip() for ln in text.splitlines() if ln.strip().startswith(("/", "\\", "#", ";"))]
    blob = "\n".join(comments)
    def _num(key: str) -> float | None:
        mm = re.search(rf"{key}\s*[=:]\s*([0-9.eE+\-]+)", blob, re.I)
        if not mm:
            return None
        try:
            value = float(mm.group(1))
        except ValueError:
            return None
        return value if value > 0 else None

    def _str(key: str) -> str | None:
        mm = re.search(rf"{key}\s*[=:]\s*([^\n]+)", blob, re.I)
        return mm.group(1).strip() if mm else None

    epsg = None
    m = re.search(r"EPSG\s*[=:]\s*(\d{4,6})", blob, re.I) or re.search(r"CRS\s*[=:]\s*EPSG:(\d{4,6})", blob, re.I)
    if m:
        epsg = int(m.group(1))
    vel_mns = _num("VelocityMns") or _num("Velocity_mns")
    vel_ms = _num("VelocityMs") or _num("Velocity_ms")
    if vel_mns and not vel_ms:
        vel_ms = vel_mns * 1e9
    return {
        "banner": bool(re.search(r"G-AID\s+GPR\s+1\.0", blob, re.I)),
        "units": _str("Units"),
        "dt_ns": _num("dt_ns") or _num("dtns"),
        "dx_m": _num("dx_m") or _num("dxm"),
        "antenna_mhz": _num("AntennaMHz") or _num("Antenna_MHz") or _num("Antenna"),
        "velocity_ms": vel_ms,
        "epsg": epsg,
        "comments": comments,
    }


def _split_cols(line: str) -> list[str]:
    cleaned = re.sub(r"^[/\\#;]\s*", "", line).strip()
    if not cleaned:
        return []
    if "," in cleaned:
        return [p.strip() for p in cleaned.split(",") if p.strip()]
    return cleaned.split()


def parse_gpr_table(path: str) -> dict:
    with open(path, encoding="utf-8", errors="replace") as handle:
        text = handle.read()
    meta = parse_comment_meta(text)
    if not meta["banner"]:
        raise ValueError("GPR ingest needs the / G-AID GPR 1.0 banner. I will not treat an amplitude table as GPR from columns alone.")
    if not meta["units"] or str(meta["units"]).strip().lower() in {"unknown", "n/a", "none", "nan", "null"}:
        raise ValueError("GPR ingest needs / Units=. I will not assume amplitude units.")
    if not meta["dt_ns"]:
        raise ValueError("GPR ingest needs / dt_ns=. I will not invent two-way time.")
    if not meta["dx_m"]:
        raise ValueError("GPR ingest needs / dx_m=. I will not invent trace spacing.")
    if not meta["antenna_mhz"]:
        raise ValueError("GPR ingest needs / AntennaMHz=. I will not invent antenna frequency.")
    body = [ln for ln in text.splitlines() if ln.strip() and not ln.strip().startswith(("/", "\\", "#", ";"))]
    if not body:
        raise ValueError("GPR CSV has no data rows.")
    header = _split_cols(body[0])
    mapping = {}
    for field, aliases in ALIASES.items():
        hit = None
        for col in header:
            if _norm(col) == CANONICAL[field].lower() or _norm(col) in aliases:
                hit = col
                break
        if not hit:
            raise ValueError(f"GPR CSV needs a {CANONICAL[field]} column.")
        mapping[field] = hit

    df = pd.read_csv(io.StringIO("\n".join(body)))
    work = pd.DataFrame({
        "trace": pd.to_numeric(df[mapping["trace"]], errors="coerce"),
        "sample": pd.to_numeric(df[mapping["sample"]], errors="coerce"),
        "amplitude": pd.to_numeric(df[mapping["amplitude"]], errors="coerce"),
    }).dropna()
    if work.empty:
        raise ValueError("GPR CSV has no numeric Trace/Sample/Amplitude rows.")
    n_traces = int(work["trace"].nunique())
    n_samples = int(work["sample"].nunique())
    grid = np.full((n_traces, n_samples), np.nan, dtype=float)
    t_min = int(work["trace"].min())
    s_min = int(work["sample"].min())
    for row in work.itertuples(index=False):
        ti = int(row.trace) - t_min
        si = int(row.sample) - s_min
        if 0 <= ti < n_traces and 0 <= si < n_samples:
            grid[ti, si] = float(row.amplitude)
    return {
        "traces": grid,
        "table": work,
        "n_traces": n_traces,
        "n_samples": n_samples,
        "dt_ns": float(meta["dt_ns"]),
        "dx_m": float(meta["dx_m"]),
        "antenna_mhz": float(meta["antenna_mhz"]),
        "units": str(meta["units"]),
        "crs_epsg": int(meta["epsg"] or 0),
        "velocity_ms": meta["velocity_ms"],
        "path": path,
        "formula": "G-AID GPR 1.0 documented dt_ns, dx_m, AntennaMHz; amplitude as recorded",
    }
