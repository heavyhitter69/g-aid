"""Strict gravity XYZ/CSV ingest. Unnamed numeric XYZ is rejected."""

from __future__ import annotations

import math
import re
from typing import Any

import numpy as np
import pandas as pd

CANONICAL = {
    "x": "X",
    "y": "Y",
    "gObs": "Gravity",
    "elevation": "Elevation",
    "stationId": "Station",
    "datetime": "DateTime",
    "latitude": "Latitude",
}

ALIASES = {
    "x": {"x", "easting", "east", "lon", "longitude", "long"},
    "y": {"y", "northing", "north", "lat", "latitude"},
    "gObs": {"gravity", "g_obs", "gobs", "observed_gravity", "grav", "g_obs_mgal", "obs_gravity"},
    "elevation": {"elevation", "elev", "height", "z", "h", "ortho_h", "ellipsoidal_h"},
    "stationId": {"station", "stn", "station_id", "id", "site"},
    "datetime": {"datetime", "date_time", "timestamp", "date"},
    "latitude": {"latitude", "lat", "phi"},
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
    units = None
    um = re.search(r"Units?\s*[=:]\s*([^\n]+)", blob, re.I)
    if um:
        raw = um.group(1).strip().lower()
        if "mgal" in raw or "milligal" in raw:
            units = "mGal"
        elif "m/s" in raw.replace(" ", "") or raw in {"ms-2", "m/s2"}:
            units = "m/s2"
    datum = None
    dm = re.search(r"ElevationDatum\s*[=:]\s*([^\n]+)", blob, re.I)
    if dm:
        raw = dm.group(1).strip().lower()
        if "ortho" in raw:
            datum = "orthometric"
        elif "ellips" in raw:
            datum = "ellipsoidal"
    gdatum = None
    gm = re.search(r"GravityDatum\s*[=:]\s*([^\n]+)", blob, re.I)
    if gm:
        gdatum = gm.group(1).strip()
    return {"epsg": epsg, "units": units, "elevationDatum": datum, "gravityDatum": gdatum, "comments": comments}


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


def _looks_like_header(cols: list[str]) -> bool:
    if len(cols) < 3 or _numeric_row(cols):
        return False
    coord = any(re.search(r"^(x|y|easting|northing|east|north|lon|long|longitude|lat|latitude)$", c, re.I) for c in cols)
    g = any(re.search(r"^(gravity|g_obs|gobs|grav|observed_gravity|obs_gravity)$", c, re.I) for c in cols)
    return coord and g


def find_header_columns(text: str) -> list[str]:
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith(("/", "\\", "#", ";")):
            cols = _split_cols(line)
            if _looks_like_header(cols):
                return cols
            continue
        cols = _split_cols(line)
        if len(cols) >= 3 and not _numeric_row(cols):
            return cols
        break
    return []


def resolve_mapping(columns: list[str], mapping: dict | None) -> dict[str, str]:
    if mapping and mapping.get("x") and mapping.get("y") and mapping.get("gObs"):
        canonical = mapping.get("x") == CANONICAL["x"] and mapping.get("y") == CANONICAL["y"] and mapping.get("gObs") == CANONICAL["gObs"]
        if mapping.get("reviewed") is False and not canonical:
            raise ValueError("Gravity CSV mapping exists but is not reviewed.")
        return {k: mapping[k] for k in ("x", "y", "gObs", "elevation", "stationId", "datetime", "latitude") if mapping.get(k)}
    resolved: dict[str, str] = {}
    for field, aliases in ALIASES.items():
        hits = [c for c in columns if _norm(c) in aliases]
        if len(hits) == 1:
            resolved[field] = hits[0]
    if resolved.get("x") == CANONICAL["x"] and resolved.get("y") == CANONICAL["y"] and resolved.get("gObs") == CANONICAL["gObs"]:
        return resolved
    raise ValueError(
        "Gravity file is not on the canonical X, Y, Gravity contract. "
        "Store a reviewed column mapping. I will not take unnamed XYZ columns."
    )


def to_mgal(values: np.ndarray, units: str) -> np.ndarray:
    if units == "mGal":
        return np.asarray(values, float)
    if units == "m/s2":
        return np.asarray(values, float) * 1.0e5
    raise ValueError(f"Unsupported gravity units {units!r}. Document Units=mGal or Units=m/s2.")


def parse_gravity_table(path: str, mapping: dict | None = None, overrides: dict | None = None) -> tuple[pd.DataFrame, dict[str, Any]]:
    with open(path, "r", errors="ignore") as handle:
        text = handle.read()
    if not text.strip():
        raise ValueError(f"Empty gravity file: {path}")
    meta = parse_comment_meta(text)
    overrides = overrides or {}
    if overrides.get("crsEpsg"):
        meta["epsg"] = int(overrides["crsEpsg"])
    if overrides.get("gravityUnits"):
        meta["units"] = overrides["gravityUnits"]
    if overrides.get("elevationDatum"):
        meta["elevationDatum"] = overrides["elevationDatum"]
    columns = find_header_columns(text)
    if not columns:
        raise ValueError("No named gravity header. Numeric XYZ without column names is not a supported gravity contract.")
    if not meta.get("epsg"):
        raise ValueError("CRS is not documented (need / EPSG=… ). I will not assume a datum.")
    if not meta.get("units"):
        raise ValueError("Gravity units are not documented. I will not assume mGal.")
    resolved = resolve_mapping(columns, mapping)

    rows = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith(("/", "\\", "#", ";")):
            continue
        cols = _split_cols(line)
        if cols == columns:
            continue
        if len(cols) < 3:
            continue
        rec = {columns[i]: cols[i] for i in range(min(len(columns), len(cols)))}
        rows.append(rec)
    if not rows:
        raise ValueError(f"No gravity samples in {path}")
    raw_df = pd.DataFrame(rows)
    g_raw = pd.to_numeric(raw_df[resolved["gObs"]], errors="coerce")
    mixed = g_raw.dropna()
    if mixed.empty:
        raise ValueError("Observed gravity column is not numeric.")
    # Mixed units: reject if both |g|<100 (likely m/s2 leftover) and |g|>1000 (mGal) in same column without docs.
    if (mixed.abs().min() < 20) and (mixed.abs().max() > 1000):
        raise ValueError("Mixed gravity units in one column. I will not convert a mixed file.")

    out = pd.DataFrame()
    out["x"] = pd.to_numeric(raw_df[resolved["x"]], errors="coerce")
    out["y"] = pd.to_numeric(raw_df[resolved["y"]], errors="coerce")
    out["g_obs_mgal"] = to_mgal(g_raw.to_numpy(), meta["units"])
    if resolved.get("elevation"):
        out["elevation_m"] = pd.to_numeric(raw_df[resolved["elevation"]], errors="coerce")
    else:
        out["elevation_m"] = np.nan
    if resolved.get("stationId"):
        out["station_id"] = raw_df[resolved["stationId"]].astype(str)
    if resolved.get("datetime"):
        out["datetime"] = raw_df[resolved["datetime"]].astype(str)
    if resolved.get("latitude"):
        out["latitude_deg"] = pd.to_numeric(raw_df[resolved["latitude"]], errors="coerce")
    out["crs_epsg"] = int(meta["epsg"])
    out["units_in"] = meta["units"]
    out["elevation_datum"] = meta.get("elevationDatum") or ""
    out["gravity_datum"] = meta.get("gravityDatum") or ""
    out["source"] = "gravity"
    out = out.replace([np.inf, -np.inf], np.nan).dropna(subset=["x", "y", "g_obs_mgal"])
    qc = {
        "n": int(len(out)),
        "crs_epsg": int(meta["epsg"]),
        "units_in": meta["units"],
        "elevation_datum": meta.get("elevationDatum"),
        "gravity_datum": meta.get("gravityDatum"),
        "mapping": resolved,
        "path": path,
        "formula": "G-AID gravity contract 1.0: named columns + documented CRS/units",
    }
    return out.reset_index(drop=True), qc
