"""Strict G-AID RAD 1.0 ingest. K/U/Th assay columns are not radiometric data."""

from __future__ import annotations

import re
from typing import Any

import numpy as np
import pandas as pd

CANONICAL = {
    "x": "X",
    "y": "Y",
    "line": "Line",
    "k": "K",
    "eu": "eU",
    "eth": "eTh",
    "tc": "TC",
}

ALIASES = {
    "x": {"x", "easting", "east"},
    "y": {"y", "northing", "north"},
    "line": {"line", "flight_line", "linename", "line_id", "fiducial"},
    "k": {"k", "k_pct", "k%", "potassium", "k_conc", "pctk", "pot"},
    "eu": {"eu", "e_u", "eu_ppm", "equivalent_uranium", "u", "uranium", "u_ppm"},
    "eth": {"eth", "e_th", "eth_ppm", "equivalent_thorium", "th", "thorium", "th_ppm"},
    "tc": {"tc", "total_count", "totalcount", "dose", "dose_rate", "ngy"},
}


def _norm(name: str) -> str:
    return re.sub(r"[\s\-]+", "_", str(name).strip().lower())


def parse_comment_meta(text: str) -> dict[str, Any]:
    comments = [ln.strip() for ln in text.splitlines() if ln.strip().startswith(("/", "\\", "#", ";"))]
    blob = "\n".join(comments)
    epsg = None
    m = re.search(r"EPSG\s*[=:]\s*(\d{4,5})", blob, re.I) or re.search(r"CRS\s*[=:]\s*EPSG:(\d{4,5})", blob, re.I)
    if m:
        epsg = int(m.group(1))
    quantity = None
    qm = re.search(r"Quantity\s*[=:]\s*([^\n]+)", blob, re.I)
    if qm:
        raw = qm.group(1).strip().lower()
        if "concentrat" in raw:
            quantity = "concentration"
        elif "count_rate" in raw or "cps" in raw:
            quantity = "count_rate"
        elif raw.startswith("count"):
            quantity = "counts"
    def _unit(key: str) -> str | None:
        mm = re.search(rf"{key}\s*[=:]\s*([^\n]+)", blob, re.I)
        return mm.group(1).strip() if mm else None
    history = _unit("CorrectionHistory")
    return {
        "epsg": epsg,
        "quantity": quantity,
        "unitsK": _unit("UnitsK"),
        "unitsU": _unit("UnitsU"),
        "unitsTh": _unit("UnitsTh"),
        "unitsTc": _unit("UnitsTC"),
        "units": _unit("Units"),
        "correctionHistory": history,
        "platform": _unit("Platform"),
        "instrument": _unit("Instrument"),
        "acquisitionDate": _unit("AcquisitionDate"),
        "comments": comments,
    }


def _split_cols(line: str) -> list[str]:
    cleaned = re.sub(r"^[/\\#;]\s*", "", line).strip()
    if not cleaned:
        return []
    if "," in cleaned:
        return [p.strip() for p in cleaned.split(",") if p.strip()]
    return cleaned.split()


def _numeric_row(cols: list[str]) -> bool:
    if len(cols) < 2:
        return False
    try:
        [float(c) for c in cols]
        return True
    except ValueError:
        return False


def _header_columns(text: str) -> list[str]:
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith(("/", "\\", "#", ";")):
            cols = _split_cols(line)
            if cols and not _numeric_row(cols) and len(cols) >= 3:
                names = {_norm(c) for c in cols}
                if names & {"x", "y", "easting", "northing"}:
                    return cols
            continue
        cols = _split_cols(line)
        if cols and not _numeric_row(cols):
            return cols
        break
    return []


def _alias(field: str, columns: list[str]) -> str | None:
    hits = [c for c in columns if _norm(c) in ALIASES[field]]
    return hits[0] if len(hits) == 1 else None


def _rows(text: str, columns: list[str]) -> list[list[str]]:
    header_seen = False
    rows: list[list[str]] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith(("/", "\\", "#", ";")):
            continue
        cols = _split_cols(line)
        if not header_seen and not _numeric_row(cols):
            header_seen = True
            continue
        header_seen = True
        if len(cols) < len(columns):
            cols = cols + [""] * (len(columns) - len(cols))
        rows.append(cols[: len(columns)])
    return rows


def parse_radiometric_table(path: str, mapping: dict | None = None, overrides: dict | None = None) -> tuple[pd.DataFrame, dict]:
    with open(path, encoding="utf-8", errors="ignore") as handle:
        text = handle.read()
    meta = parse_comment_meta(text)
    columns = _header_columns(text)
    if not columns:
        raise ValueError("No named radiometric header. Numeric XYZ is not a supported RAD 1.0 contract.")
    used = dict(mapping or {})
    if not used.get("x"):
        used["x"] = _alias("x", columns)
    if not used.get("y"):
        used["y"] = _alias("y", columns)
    if not used.get("line"):
        used["line"] = _alias("line", columns)
    for field in ("k", "eu", "eth", "tc"):
        if not used.get(field):
            used[field] = _alias(field, columns)
    if not used.get("x") or not used.get("y") or not used.get("line"):
        raise ValueError("Radiometric ingest needs X, Y, and Line columns (or a reviewed mapping).")
    if not any(used.get(f) for f in ("k", "eu", "eth", "tc")):
        raise ValueError("Radiometric ingest needs at least one of K, eU, eTh, TC.")
    quantity = (overrides or {}).get("quantity") or meta.get("quantity")
    if quantity == "counts":
        raise ValueError("Quantity=counts is not a supported already-corrected product. Corrections are not live capabilities.")
    if quantity not in {"concentration", "count_rate"}:
        raise ValueError("Quantity must be concentration or count_rate. I will not infer it from the numbers.")
    history = (overrides or {}).get("correctionHistory") or meta.get("correctionHistory")
    if not history or str(history).strip().lower() in {"unknown", "none", "n/a", "-"}:
        raise ValueError("CorrectionHistory is required. I will not assume IAEA stripping or height correction.")
    epsg = (overrides or {}).get("crsEpsg") or meta.get("epsg")
    if not epsg:
        raise ValueError("CRS is not documented. I will not assume EPSG:4326.")
    ch = [c for c in columns if re.match(r"^ch\d+$", _norm(c).replace("_", ""))]
    if len(ch) >= 8:
        raise ValueError("Raw spectrometer channels are not a supported processing input in this release.")

    body = _rows(text, columns)
    if len(body) < 4:
        raise ValueError("Radiometric ingest needs at least 4 measurements.")
    frame = pd.DataFrame(body, columns=columns)

    def num(col: str | None) -> np.ndarray:
        if not col or col not in frame.columns:
            return np.full(len(frame), np.nan)
        return pd.to_numeric(frame[col], errors="coerce").to_numpy(dtype=float)

    out = pd.DataFrame(
        {
            "x": num(used["x"]),
            "y": num(used["y"]),
            "line": frame[used["line"]].astype(str).to_numpy(),
        }
    )
    channels = {}
    if used.get("k"):
        out["k"] = num(used["k"])
        channels["k"] = (meta.get("unitsK") or "").strip() or "unknown"
    if used.get("eu"):
        out["eu"] = num(used["eu"])
        channels["eu"] = (meta.get("unitsU") or "").strip() or "unknown"
    if used.get("eth"):
        out["eth"] = num(used["eth"])
        channels["eth"] = (meta.get("unitsTh") or "").strip() or "unknown"
    if used.get("tc"):
        out["tc"] = num(used["tc"])
        channels["tc"] = (meta.get("unitsTc") or meta.get("units") or "").strip() or "unknown"
    out["crs_epsg"] = int(epsg)
    out["quantity"] = quantity
    for col, unit in channels.items():
        out[f"units_{col}"] = unit
    finite = np.isfinite(out["x"]) & np.isfinite(out["y"])
    for col in ("k", "eu", "eth", "tc"):
        if col in out.columns:
            finite = finite & np.isfinite(out[col])
    out = out.loc[finite].reset_index(drop=True)
    if len(out) < 4:
        raise ValueError("Fewer than 4 finite radiometric samples after QC.")
    for col in ("k", "eu", "eth", "tc"):
        if col in out.columns and (out[col] < 0).any():
            raise ValueError(f"Negative {col} values are not physical for this contract.")
    qc = {
        "path": path,
        "n": int(len(out)),
        "n_lines": int(out["line"].nunique()),
        "quantity": quantity,
        "crs_epsg": int(epsg),
        "channels": channels,
        "units_unknown": any(str(v).strip().lower() in {"", "unknown", "none", "n/a"} for v in channels.values()),
        "correction_history": history,
        "platform": meta.get("platform"),
        "instrument": meta.get("instrument"),
        "acquisition_date": meta.get("acquisitionDate"),
        "mapping": {k: v for k, v in used.items() if v},
        "assumptions": "None. CRS, quantity, units, and correction history came from the RAD 1.0 contract or a reviewed mapping.",
        "not_raw_spectrum": True,
        "corrections_applied_in_g_aid": False,
    }
    return out, qc
