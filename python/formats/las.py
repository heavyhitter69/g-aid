"""CWLS LAS 2.0 WRAP.NO well-log parser.

LASF / LAZ point clouds, WRAP.YES, and LAS 3.0 are refused.
Unknown curve mnemonics are stored with unknown semantics.
"""

from __future__ import annotations

import re
from pathlib import Path

import numpy as np
import pandas as pd

DEPTH_INDEX_MNEMONICS = {"DEPT", "DEPTH", "MD", "DEPTH_MD", "DEPT_MD"}
GEO_X = {"LATI", "LAT", "LATITUDE"}
GEO_Y = {"LONG", "LON", "LNG", "LONGITUDE"}
PROJ_X = {"XWELL", "X", "EAST", "EASTING"}
PROJ_Y = {"YWELL", "Y", "NORTH", "NORTHING"}
ELEV = {"ELEV", "KB", "DF", "GL", "ELEVATION"}
DIRECTIONAL = {"INCL", "AZIM", "DEVI", "TVD", "DX", "DY"}
MNEM_RE = re.compile(r"^([A-Za-z][A-Za-z0-9_]*)\s*\.(\S*)\s*(.*)$")
COMMENT_RE = re.compile(r"/\s*([A-Za-z][A-Za-z0-9_]*)\s*=\s*([^\s,;]+)")


def is_lasf(path: str) -> bool:
    with open(path, "rb") as handle:
        return handle.read(4) == b"LASF"


def _section_key(line: str) -> str | None:
    stripped = line.lstrip()
    if not stripped.startswith("~"):
        return None
    letter = stripped[1:2].upper()
    return letter or "A"


def split_sections(text: str) -> dict[str, list[str]]:
    sections: dict[str, list[str]] = {"V": [], "W": [], "C": [], "P": [], "O": [], "A": []}
    current = None
    for raw in text.splitlines():
        key = _section_key(raw)
        if key:
            current = key if key in sections else "A"
            continue
        if current:
            sections[current].append(raw)
    return sections


def parse_mnemonic_line(line: str) -> dict | None:
    stripped = line.strip()
    if not stripped or stripped.startswith("#") or stripped.startswith("~"):
        return None
    match = MNEM_RE.match(stripped)
    if not match:
        return None
    rest = match.group(3) or ""
    colon = rest.find(":")
    value_part = (rest[:colon] if colon >= 0 else rest).strip()
    description = (rest[colon + 1 :] if colon >= 0 else "").strip()
    value = value_part.split()[0] if value_part.split() else value_part
    return {
        "mnemonic": match.group(1),
        "unit": match.group(2) or "",
        "value": value,
        "description": description,
    }


def _item_map(items: list[dict]) -> dict[str, dict]:
    return {item["mnemonic"].upper(): item for item in items}


def _find(mapping: dict[str, dict], names: set[str]) -> dict | None:
    for name in names:
        if name in mapping:
            return mapping[name]
    return None


def _number(raw: str | None):
    if raw is None or raw == "":
        return None
    try:
        return float(str(raw).replace(",", ""))
    except ValueError:
        cleaned = re.sub(r"[^0-9.eE+\-]", "", str(raw))
        try:
            return float(cleaned) if cleaned not in {"", "+", "-", "."} else None
        except ValueError:
            return None


def _wrap(raw: str | None) -> str | None:
    if not raw:
        return None
    t = raw.strip().upper()
    if t in {"NO", "NONE", "0"}:
        return "NO"
    if t in {"YES", "1"}:
        return "YES"
    return t


def _comments(text: str) -> dict[str, str]:
    found: dict[str, str] = {}
    for raw in text.splitlines():
        if re.search(r"g-aid\s+well\s+1\.0", raw, re.I):
            found["banner"] = "G-AID WELL 1.0"
        match = COMMENT_RE.search(raw)
        if match:
            found[match.group(1).lower()] = match.group(2).strip()
    return found


def parse_las_20(path: str) -> dict:
    """Parse a CWLS LAS 2.0 WRAP.NO well log. Raises ValueError on contract failure."""
    src = str(path)
    if is_lasf(src):
        raise ValueError(
            f"LASF point-cloud signature in {src}. This is not a CWLS LAS well log. "
            "LiDAR LAS/LAZ stays recognised-unsupported."
        )
    text = Path(src).read_text(encoding="utf-8", errors="replace")
    if not re.search(r"~(?:V|VERSION)\b", text, re.I) or not re.search(r"~(?:W|WELL)\b", text, re.I) or not re.search(
        r"~(?:C|CURVE)\b", text, re.I
    ):
        raise ValueError(f"Malformed LAS header in {src}: ~Version, ~Well, and ~Curve are required.")
    if not re.search(r"~(?:A|ASCII)\b", text, re.I):
        raise ValueError(f"Malformed LAS header in {src}: ~ASCII data section is missing.")

    sections = split_sections(text)
    meta = _comments(text)
    v_items = [item for item in (parse_mnemonic_line(line) for line in sections["V"]) if item]
    w_items = [item for item in (parse_mnemonic_line(line) for line in sections["W"]) if item]
    c_items = [item for item in (parse_mnemonic_line(line) for line in sections["C"]) if item]
    v_map = _item_map(v_items)
    w_map = _item_map(w_items)

    vers = (v_map.get("VERS") or {}).get("value") or ""
    vers_match = re.search(r"(\d+(?:\.\d+)?)", vers)
    las_version = vers_match.group(1) if vers_match else ""
    major = int(las_version.split(".")[0]) if las_version else 0
    wrap = _wrap((v_map.get("WRAP") or {}).get("value"))
    if major != 2:
        raise ValueError(
            f"LAS {las_version or vers or 'unknown'} in {src} is recognised-unsupported. "
            "G-AID processes CWLS LAS 2.0 WRAP.NO only."
        )
    if wrap == "YES":
        raise ValueError(f"WRAP.YES in {src} is recognised-unsupported. G-AID does not unwrap wrapped LAS ASCII.")
    if wrap != "NO":
        raise ValueError(f"LAS well-log requires WRAP.NO in {src}. I will not guess wrap handling.")
    if not c_items:
        raise ValueError(f"No LAS curve mnemonics in {src}")
    missing_units = [item["mnemonic"] for item in c_items if not item["unit"]]
    if missing_units:
        raise ValueError(
            f"Missing curve units for {missing_units} in {src}. Every curve must have MNEM.UNIT. Units are not inferred."
        )

    curves = [
        {
            "mnemonic": item["mnemonic"],
            "unit": item["unit"],
            "description": item["description"],
            "semantics": "unknown",
        }
        for item in c_items
    ]
    depth_index = curves[0]["mnemonic"]
    depth_units = curves[0]["unit"]
    if depth_index.upper() not in DEPTH_INDEX_MNEMONICS:
        raise ValueError(
            f"First curve '{depth_index}' is not a measured-depth index (DEPT/DEPTH/MD) in {src}."
        )

    well_id = ((w_map.get("WELL") or {}).get("value") or (w_map.get("WELL") or {}).get("description") or "").strip()
    null_raw = _number((w_map.get("NULL") or {}).get("value"))
    null_assumed = null_raw is None
    null_value = -999.25 if null_assumed else float(null_raw)

    strt = w_map.get("STRT") or {}
    stop = w_map.get("STOP") or {}
    step = w_map.get("STEP") or {}
    start_depth = _number(strt.get("value"))
    stop_depth = _number(stop.get("value"))
    step_value = _number(step.get("value"))
    for label, item in (("STRT", strt), ("STOP", stop)):
        unit = item.get("unit") or ""
        if unit and depth_units and unit.upper() != depth_units.upper():
            raise ValueError(f"{label} unit {unit} is inconsistent with depth curve unit {depth_units} in {src}.")

    rows: list[list[float]] = []
    for raw in sections["A"]:
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        try:
            nums = [float(part) for part in parts]
        except ValueError as exc:
            raise ValueError(f"Non-numeric ASCII data in {src}: {line[:80]}") from exc
        if len(nums) != len(curves):
            raise ValueError(
                f"ASCII row has {len(nums)} values; curve section lists {len(curves)} in {src}."
            )
        rows.append(nums)
    if not rows:
        raise ValueError(f"No LAS ASCII data in {src}")

    arr = np.asarray(rows, float)
    depths = arr[:, 0]
    if len(np.unique(depths)) != len(depths):
        raise ValueError(f"Duplicate depth values in {src}.")
    diffs = np.diff(depths)
    if np.any(diffs == 0):
        raise ValueError(f"Non-strict depth indexing in {src}.")
    increasing = bool(np.all(diffs > 0))
    decreasing = bool(np.all(diffs < 0))
    if not (increasing or decreasing):
        raise ValueError(f"Depth index is not monotonic in {src}.")
    if step_value not in (None, 0):
        if step_value > 0 and decreasing:
            raise ValueError(f"STEP is positive but depths decrease in {src}.")
        if step_value < 0 and increasing:
            raise ValueError(f"STEP is negative but depths increase in {src}.")

    data = {curves[i]["mnemonic"]: arr[:, i] for i in range(len(curves))}
    df = pd.DataFrame(data)
    df = df.replace(null_value, np.nan)
    # Null-value misuse: if the conventional null still remains as a finite sample after replace, flag later.
    null_remaining = int(((df == null_value).to_numpy()).sum()) if null_value == null_value else 0

    geo_x = _find(w_map, GEO_X)
    geo_y = _find(w_map, GEO_Y)
    proj_x = _find(w_map, PROJ_X)
    proj_y = _find(w_map, PROJ_Y)
    elev = _find(w_map, ELEV)
    coordinate_kind = "unknown"
    collar_x = collar_y = None
    if geo_x and geo_y:
        coordinate_kind = "geographic"
        collar_y = _number(geo_x.get("value"))
        collar_x = _number(geo_y.get("value"))
    elif proj_x and proj_y:
        coordinate_kind = "easting-northing"
        collar_x = _number(proj_x.get("value"))
        collar_y = _number(proj_y.get("value"))
    collar_z = _number(elev.get("value")) if elev else None

    epsg_raw = meta.get("epsg") or (w_map.get("EPSG") or {}).get("value") or (w_map.get("CRS") or {}).get("value") or ""
    epsg_match = re.search(r"(\d{4,6})", str(epsg_raw))
    epsg = int(epsg_match.group(1)) if epsg_match else None
    has_coords = collar_x is not None and collar_y is not None
    location_quality = "documented" if has_coords and epsg else "missing"
    warnings: list[str] = []
    if null_assumed:
        warnings.append("NULL was not documented in ~Well; -999.25 is assumed.")
    if not well_id:
        warnings.append("WELL identifier was not documented.")
    if has_coords and not epsg:
        warnings.append("Collar coordinates are present without a documented CRS.")
    if not has_coords:
        warnings.append("No well location documented. No map position is invented.")
    directional = [c["mnemonic"] for c in curves if c["mnemonic"].upper() in DIRECTIONAL]
    if directional:
        warnings.append(
            f"Directional/TVD mnemonics ({', '.join(directional)}) stored with unknown semantics. Trajectory is not computed."
        )
    if null_remaining:
        warnings.append("Null-value token still present after substitution; treat remaining sentinels as unknown.")

    return {
        "path": src,
        "las_version": las_version,
        "wrap": wrap,
        "well": well_id,
        "null": null_value,
        "null_assumed": null_assumed,
        "strt": start_depth,
        "stop": stop_depth,
        "step": step_value,
        "depth_index": depth_index,
        "depth_units": depth_units,
        "depth_reference": "measured depth",
        "curves": curves,
        "data": df,
        "n_rows": int(len(df)),
        "collar_x": collar_x,
        "collar_y": collar_y,
        "collar_z": collar_z,
        "collar_z_mnemonic": elev["mnemonic"] if elev else None,
        "coordinate_kind": coordinate_kind,
        "crs_epsg": epsg,
        "elevation_datum": meta.get("elevationdatum"),
        "location_quality": location_quality,
        "collar_mappable": bool(has_coords and epsg),
        "trajectory_computed": False,
        "well_items": w_items,
        "header_provenance": {
            "VERS": las_version,
            "WRAP": wrap,
            "WELL": well_id,
            "source": src,
            **({"banner": meta["banner"]} if meta.get("banner") else {}),
        },
        "warnings": warnings,
        "formula": "CWLS LAS 2.0 WRAP.NO ASCII well log. Measured depth is not TVD or a trajectory.",
    }
