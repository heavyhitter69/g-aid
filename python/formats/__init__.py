"""Format readers. Each returns a pandas DataFrame in canonical columns where possible.

Canonical magnetic/gravity samples:
  timestamp, x, y, z, line_id, value, unit, source, crs_epsg
x,y are native file coordinates (lon/lat or projected); crs_epsg records which.
"""

from __future__ import annotations

import os
import re
from datetime import datetime, timezone

import numpy as np
import pandas as pd


DATE_PATTERNS = [
    re.compile(r"(20\d{2})[./\-](\d{1,2})[./\-](\d{1,2})"),
    re.compile(r"(\d{1,2})[./\-](\d{1,2})[./\-](20\d{2})"),
]


def parse_header_date(text: str) -> datetime | None:
    for pat in DATE_PATTERNS:
        match = pat.search(text)
        if not match:
            continue
        g = match.groups()
        if len(g[0]) == 4:
            y, mo, d = int(g[0]), int(g[1]), int(g[2])
        else:
            d, mo, y = int(g[0]), int(g[1]), int(g[2])
            if mo > 12:
                d, mo = mo, d
        try:
            return datetime(y, mo, d, tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def parse_gsm19(path: str, survey_date: datetime | None = None) -> pd.DataFrame:
    with open(path, "r", errors="ignore") as handle:
        lines = handle.readlines()
    header = "".join(lines[:80])
    date = survey_date or parse_header_date(header)
    if date is None:
        raise ValueError(
            f"GSM-19 file {os.path.basename(path)} has no survey date in the header. "
            "Pass parameters.surveyDate (YYYY-MM-DD). Refusing to invent a date."
        )
    start = None
    for i, line in enumerate(lines):
        if "time nT sq" in line or re.search(r"time\s+nT\s+sq", line, re.I):
            start = i + 1
            break
    if start is None:
        raise ValueError(f"Could not find 'time nT sq' header in {path}")
    rows = []
    for line in lines[start:]:
        parts = line.strip().split()
        if len(parts) < 2:
            continue
        t_str = parts[0]
        try:
            h = int(t_str[0:2])
            m = int(t_str[2:4])
            s = float(t_str[4:])
            dt = datetime(
                date.year,
                date.month,
                date.day,
                h,
                m,
                int(s),
                int((s - int(s)) * 1_000_000),
                tzinfo=timezone.utc,
            )
            rows.append({"timestamp": dt.timestamp(), "magnetic_field": float(parts[1]), "sq": float(parts[2]) if len(parts) > 2 else np.nan})
        except (ValueError, IndexError):
            continue
    if not rows:
        raise ValueError(f"No GSM-19 samples parsed from {path}")
    df = pd.DataFrame(rows)
    df["x"] = 0.0
    df["y"] = 0.0
    df["z"] = 0.0
    df["source"] = "base_station"
    df["line_id"] = "BASE"
    df["unit"] = "nT"
    df["crs_epsg"] = 4326
    df["value"] = df["magnetic_field"]
    df["survey_date"] = date.strftime("%Y-%m-%d")
    return df.sort_values("timestamp").reset_index(drop=True)


def _norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(name).lower())


def parse_magarrow(path: str) -> pd.DataFrame:
    raw = pd.read_csv(path, low_memory=False)
    cols = {_norm(c): c for c in raw.columns}
    def pick(*names):
        for n in names:
            if n in cols:
                return cols[n]
        return None

    lat_c = pick("latitude", "lat", "y")
    lon_c = pick("longitude", "lon", "long", "x")
    mag_c = pick("mag", "magnetic", "nT", "nt", "tmi", "magnt")
    date_c = pick("date")
    time_c = pick("time")
    alt_c = pick("altitude", "alt", "height", "msl", "hae")
    if lat_c is None or lon_c is None or mag_c is None:
        # MagArrow sometimes has extra commas; fall back to positional
        df_pos = pd.read_csv(path, names=list(range(80)), skiprows=1, low_memory=False)
        out = pd.DataFrame(
            {
                "Date": df_pos[1],
                "Time": df_pos[2],
                "y": pd.to_numeric(df_pos[3], errors="coerce"),
                "x": pd.to_numeric(df_pos[4], errors="coerce"),
                "magnetic_field": pd.to_numeric(df_pos[5], errors="coerce"),
            }
        )
        if df_pos.shape[1] > 10:
            out["z"] = pd.to_numeric(df_pos[10], errors="coerce")
        else:
            out["z"] = np.nan
        out["datetime_str"] = out["Date"].astype(str) + " " + out["Time"].astype(str)
        ts = pd.to_datetime(out["datetime_str"], errors="coerce", utc=True)
        out["timestamp"] = ts.map(lambda x: x.timestamp() if pd.notna(x) else np.nan)
    else:
        out = pd.DataFrame()
        out["y"] = pd.to_numeric(raw[lat_c], errors="coerce")
        out["x"] = pd.to_numeric(raw[lon_c], errors="coerce")
        out["magnetic_field"] = pd.to_numeric(raw[mag_c], errors="coerce")
        out["z"] = pd.to_numeric(raw[alt_c], errors="coerce") if alt_c else np.nan
        if date_c and time_c:
            out["datetime_str"] = raw[date_c].astype(str) + " " + raw[time_c].astype(str)
            ts = pd.to_datetime(out["datetime_str"], errors="coerce", utc=True)
            out["timestamp"] = ts.map(lambda x: x.timestamp() if pd.notna(x) else np.nan)
        elif date_c:
            ts = pd.to_datetime(raw[date_c], errors="coerce", utc=True)
            out["timestamp"] = ts.map(lambda x: x.timestamp() if pd.notna(x) else np.nan)
        else:
            raise ValueError(f"MagArrow file {os.path.basename(path)} has no Date/Time columns")
    out["source"] = "airborne"
    out["line_id"] = os.path.basename(path).split("-")[0].strip()
    out["unit"] = "nT"
    out["crs_epsg"] = 4326
    out["value"] = out["magnetic_field"]
    out = out.replace([np.inf, -np.inf], np.nan)
    out = out.dropna(subset=["x", "y", "magnetic_field", "timestamp"])
    # pandas NaT became large ints sometimes
    out = out[out["timestamp"] > 0]
    return out.reset_index(drop=True)


def parse_geosoft_xyz(path: str) -> pd.DataFrame:
    """Geosoft XYZ / space-delimited X Y [Z] value with optional / or \\ comments."""
    xs, ys, zs, vals, lines = [], [], [], [], []
    current_line = "1"
    with open(path, "r", errors="ignore") as handle:
        for raw in handle:
            line = raw.strip()
            if not line or line.startswith("/") or line.startswith("\\") or line.startswith("#"):
                if line.lower().startswith("/line") or line.lower().startswith("line"):
                    parts = line.replace("=", " ").split()
                    current_line = parts[-1]
                continue
            if line.lower().startswith("line"):
                current_line = line.split()[-1]
                continue
            parts = line.replace(",", " ").split()
            if len(parts) < 3:
                continue
            try:
                x = float(parts[0])
                y = float(parts[1])
                if len(parts) >= 4:
                    z = float(parts[2])
                    v = float(parts[3])
                else:
                    z = np.nan
                    v = float(parts[2])
            except ValueError:
                continue
            xs.append(x)
            ys.append(y)
            zs.append(z)
            vals.append(v)
            lines.append(current_line)
    if not vals:
        raise ValueError(f"No XYZ samples in {path}")
    df = pd.DataFrame({"x": xs, "y": ys, "z": zs, "value": vals, "line_id": lines})
    df["timestamp"] = np.arange(len(df), dtype=float)
    df["source"] = "xyz"
    df["crs_epsg"] = 0
    df["unit"] = ""
    return df


def parse_las(path: str) -> dict:
    """LAS 2.0 well log."""
    sections: dict[str, list[str]] = {"V": [], "W": [], "C": [], "P": [], "A": []}
    current = None
    with open(path, "r", errors="ignore") as handle:
        for line in handle:
            if line.startswith("~"):
                key = line[1].upper() if len(line) > 1 else "A"
                current = key if key in sections else "A"
                continue
            if current:
                sections[current].append(line.rstrip("\n"))
    curves = []
    for line in sections["C"]:
        if not line or line.startswith("#"):
            continue
        name = line.split(".", 1)[0].strip().split()[0] if "." in line else line.split()[0]
        curves.append(name)
    if not curves:
        raise ValueError(f"No LAS curve mnemonics in {path}")
    rows = []
    null = -999.25
    for line in sections["W"]:
        if "NULL" in line.upper():
            try:
                null = float(line.split(".", 1)[-1].split(":")[0].strip().split()[0])
            except (ValueError, IndexError):
                pass
    for line in sections["A"]:
        if not line.strip() or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) < 2:
            continue
        try:
            rows.append([float(p) for p in parts])
        except ValueError:
            continue
    if not rows:
        raise ValueError(f"No LAS ASCII data in {path}")
    arr = np.asarray(rows, float)
    n = min(arr.shape[1], len(curves))
    data = {curves[i]: arr[:, i] for i in range(n)}
    df = pd.DataFrame(data)
    df = df.replace(null, np.nan)
    well = ""
    for line in sections["W"]:
        if line.strip().upper().startswith("WELL"):
            well = line.split(":", 1)[-1].strip()
    return {"well": well, "null": null, "curves": curves[:n], "data": df, "path": path}


def parse_dzt(path: str) -> dict:
    """GSSI SIR DZT (1024-byte header when rh_nbits==16 and rh_ant=..., common case)."""
    with open(path, "rb") as handle:
        header = handle.read(1024)
        if len(header) < 128:
            raise ValueError(f"DZT header too short: {path}")
        nsamp = struct_u16(header, 4)
        bits = struct_u16(header, 6)
        zero = struct_u16(header, 8)
        sps = struct_u16(header, 10) or 1
        spm = struct_f32(header, 14) or 1.0
        range_ns = struct_f32(header, 18) or 50.0
        data = handle.read()
    width = 4 if bits == 32 else 2
    n_trace_bytes = nsamp * width
    if n_trace_bytes <= 0:
        raise ValueError("DZT nsamp is zero")
    n_traces = len(data) // n_trace_bytes
    dtype = np.int32 if bits == 32 else np.int16
    traces = np.frombuffer(data[: n_traces * n_trace_bytes], dtype=dtype).reshape(n_traces, nsamp).astype(np.float32)
    traces -= zero
    dt = (range_ns * 1e-9) / max(nsamp, 1)
    dx = 1.0 / spm if spm else 0.05
    return {
        "traces": traces,
        "ns": int(nsamp),
        "n_traces": int(n_traces),
        "dt_s": float(dt),
        "dx_m": float(dx),
        "range_ns": float(range_ns),
        "path": path,
    }


def struct_u16(buf: bytes, offset: int) -> int:
    import struct

    return struct.unpack_from("<H", buf, offset)[0]


def struct_f32(buf: bytes, offset: int) -> float:
    import struct

    return struct.unpack_from("<f", buf, offset)[0]
