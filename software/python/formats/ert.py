"""G-AID ERT 1.0 contract (Res2DInv-style). An arbitrary .dat file is not ERT data.

Required layout:
  <title>
  <unit electrode spacing metres>
  <array type integer: 1 wenner, 2 pole-pole, 3 dipole-dipole, 6 pole-dipole, 7 schlumberger>
  <n measurements>
  x  a  n  rhoa   (exactly n lines; x = array midpoint)
  <topography flag 0 or 1>
  [if 1: n_topo then x elev rows]

Required comment:
  / Units=ohm.m  (ohm-m, ohm.m, Ωm accepted)
Optional:
  / EPSG=<integer>  (required for GIS/map, optional for section-only)
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

ARRAY_CODES = {
    1: "wenner",
    2: "pole_pole",
    3: "dipole_dipole",
    6: "pole_dipole",
    7: "schlumberger",
}

_COMMENT = re.compile(
    r"^(?:/\s*|#\s*|;\s*)?(Units|EPSG|CRS|Array|ElevationDatum)\s*=\s*(.+)$",
    re.IGNORECASE,
)


def parse_ert_comments(text: str) -> dict[str, str]:
    found: dict[str, str] = {}
    for raw in text.splitlines():
        m = _COMMENT.match(raw.strip())
        if m:
            found[m.group(1).lower()] = m.group(2).strip()
    return found


def units_ohm_m(raw: str | None) -> bool:
    if not raw:
        return False
    t = raw.lower().replace(" ", "").replace("Ω", "ohm").replace("omega", "ohm")
    return t in {"ohm.m", "ohm-m", "ohmm", "ohm_m", "ohm/m"} or t.endswith("ohm.m") or t.endswith("ohm-m")


def _is_comment(line: str) -> bool:
    s = line.strip()
    return not s or s.startswith(("/", "#", ";"))


def sniff_ert_dat(path: str | Path) -> bool:
    p = Path(path)
    if p.suffix.lower() != ".dat":
        return False
    try:
        text = p.read_text(encoding="utf-8", errors="replace")[:8000]
    except OSError:
        return False
    comments = parse_ert_comments(text)
    if not units_ohm_m(comments.get("units")):
        return False
    return _looks_like_layout(text)


def _looks_like_layout(text: str) -> bool:
    body = [ln.strip() for ln in text.splitlines() if ln.strip() and not _is_comment(ln)]
    if len(body) < 6:
        return False
    try:
        spacing = float(body[1].split()[0])
        array_code = int(float(body[2].split()[0]))
        n_data = int(float(body[3].split()[0]))
    except (ValueError, IndexError):
        return False
    if spacing <= 0 or array_code not in ARRAY_CODES or n_data < 1:
        return False
    if len(body) < 4 + min(n_data, 1) + 1:
        return False
    parts = body[4].split()
    if len(parts) < 4:
        return False
    try:
        [float(p) for p in parts[:4]]
    except ValueError:
        return False
    return True


def parse_ert_dat(path: str | Path) -> dict[str, Any]:
    p = Path(path)
    text = p.read_text(encoding="utf-8", errors="replace")
    comments = parse_ert_comments(text)
    if not units_ohm_m(comments.get("units")):
        raise ValueError("ERT .dat requires / Units=ohm.m. I will not assume resistivity units.")
    body = [ln.rstrip("\n") for ln in text.splitlines()]
    content = [ln for ln in body if not _is_comment(ln)]
    if len(content) < 6:
        raise ValueError("ERT file is too short for the G-AID ERT 1.0 layout.")
    title = content[0].strip()
    try:
        spacing = float(content[1].split()[0])
    except (ValueError, IndexError) as exc:
        raise ValueError("ERT unit electrode spacing (line 2) is missing or not a number.") from exc
    if spacing <= 0:
        raise ValueError("ERT electrode spacing must be > 0.")
    try:
        array_code = int(float(content[2].split()[0]))
    except (ValueError, IndexError) as exc:
        raise ValueError("ERT array type (line 3) is missing. I will not default the array.") from exc
    if array_code not in ARRAY_CODES:
        raise ValueError(
            f"Unsupported ERT array code {array_code}. Supported: 1 wenner, 2 pole-pole, 3 dipole-dipole, 6 pole-dipole, 7 schlumberger."
        )
    array = ARRAY_CODES[array_code]
    try:
        n_data = int(float(content[3].split()[0]))
    except (ValueError, IndexError) as exc:
        raise ValueError("ERT measurement count (line 4) is missing or not an integer.") from exc
    if n_data < 1:
        raise ValueError("ERT measurement count must be ≥ 1.")
    measurements: list[dict[str, Any]] = []
    i = 4
    while i < len(content) and len(measurements) < n_data:
        parts = content[i].split()
        i += 1
        if len(parts) < 4:
            raise ValueError(f"ERT measurement must be 'x a n rhoa'. Got: {parts!r}")
        try:
            x, a, n, rhoa = (float(parts[0]), float(parts[1]), float(parts[2]), float(parts[3]))
        except ValueError as exc:
            raise ValueError(f"ERT measurement is not numeric: {parts!r}") from exc
        if a <= 0 or n < 1 or rhoa <= 0:
            raise ValueError(f"Invalid ERT geometry or ρa (a={a}, n={n}, rhoa={rhoa}).")
        measurements.append(
            {
                "midpoint_x": x,
                "a": a,
                "n": n,
                "rhoa": rhoa,
                "array": array,
                "array_code": array_code,
            }
        )
    if len(measurements) != n_data:
        raise ValueError(f"ERT declared {n_data} measurements but parsed {len(measurements)}.")
    topo_flag = 0
    topography: list[dict[str, float]] = []
    if i < len(content):
        try:
            topo_flag = int(float(content[i].split()[0]))
        except (ValueError, IndexError) as exc:
            raise ValueError("ERT topography flag must be 0 or 1.") from exc
        i += 1
        if topo_flag not in {0, 1}:
            raise ValueError("ERT topography flag must be 0 or 1.")
        if topo_flag == 1:
            if i >= len(content):
                raise ValueError("ERT topography flag is 1 but topography records are missing.")
            try:
                n_topo = int(float(content[i].split()[0]))
            except (ValueError, IndexError) as exc:
                raise ValueError("ERT topography count is missing.") from exc
            if n_topo < 1:
                raise ValueError("ERT topography flag is 1 but topography records are missing or empty.")
            i += 1
            for _ in range(n_topo):
                if i >= len(content):
                    raise ValueError("ERT topography rows are incomplete.")
                parts = content[i].split()
                i += 1
                if len(parts) < 2:
                    raise ValueError("ERT topography row must be 'x elev'.")
                try:
                    tx, elev = float(parts[0]), float(parts[1])
                except ValueError as exc:
                    raise ValueError("ERT topography values must be numeric.") from exc
                if not (tx == tx and elev == elev):  # NaN
                    raise ValueError("ERT topography contains non-finite values.")
                topography.append({"x": tx, "elevation_m": elev})
            if len(topography) != n_topo:
                raise ValueError("ERT topography count does not match rows.")
    xs = [m["midpoint_x"] for m in measurements]
    seen = set()
    duplicates = 0
    for m in measurements:
        key = (round(m["midpoint_x"], 6), round(m["a"], 6), round(m["n"], 6))
        if key in seen:
            duplicates += 1
        seen.add(key)
    epsg_raw = comments.get("epsg") or comments.get("crs")
    epsg = None
    if epsg_raw:
        mm = re.search(r"(\d{4,6})", epsg_raw)
        if mm:
            epsg = int(mm.group(1))
    return {
        "title": title,
        "array": array,
        "array_code": array_code,
        "spacing": spacing,
        "units": "ohm.m",
        "epsg": epsg,
        "measurements": measurements,
        "topography_flag": topo_flag,
        "topography": topography,
        "n": len(measurements),
        "duplicates": duplicates,
        "xmin": min(xs),
        "xmax": max(xs),
        "formula": "ρa as supplied (apparent resistivity). Geometric factor not re-derived unless V/I are present.",
    }
