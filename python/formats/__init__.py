"""Format readers. Each returns a pandas DataFrame in canonical columns where possible.

Canonical magnetic/gravity samples:
  timestamp, x, y, z, line_id, value, unit, source, crs_epsg
x,y are native file coordinates (lon/lat or projected); crs_epsg records which.
"""

from __future__ import annotations

import csv
import os
import re
from datetime import datetime, timezone

import numpy as np
import pandas as pd


DATE_PATTERNS = [
    re.compile(r"(20\d{2})[./\-](\d{1,2})[./\-](\d{1,2})"),
    re.compile(r"(\d{1,2})[./\-](\d{1,2})[./\-](20\d{2})"),
]

_ROMAN_MONTHS = {
    "I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6,
    "VII": 7, "VIII": 8, "IX": 9, "X": 10, "XI": 11, "XII": 12,
    "JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6,
    "JUL": 7, "AUG": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DEC": 12,
}
_ROMAN_PAT = re.compile(
    r"\b(\d{1,2})\s+(XII|XI|IX|X|VIII|VII|VI|IV|V|III|II|I|"
    r"JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{2}|\d{4})\b",
    re.I,
)


def _full_year(year: int) -> int:
    if year < 100:
        return 2000 + year if year < 80 else 1900 + year
    return year


def _from_roman_match(match: re.Match[str]) -> datetime | None:
    day = int(match.group(1))
    month = _ROMAN_MONTHS.get(match.group(2).upper())
    year = _full_year(int(match.group(3)))
    if month is None:
        return None
    try:
        return datetime(year, month, day, tzinfo=timezone.utc)
    except ValueError:
        return None


def parse_header_date(text: str) -> datetime | None:
    """Read a survey date from instrument headers. Never invent one.

    Gem Systems GSM-19 stamps the survey on the /ID line as ``25 IV 26``
    (day, Roman month, 2-digit year). The firmware banner ``23 VI 2022`` is
    not the flight date and is ignored when an /ID stamp exists.
    """
    lines = text.splitlines()
    for line in lines:
        if "/id" in line.lower():
            match = _ROMAN_PAT.search(line)
            if match:
                parsed = _from_roman_match(match)
                if parsed:
                    return parsed
            for pat in DATE_PATTERNS:
                num = pat.search(line)
                if not num:
                    continue
                g = num.groups()
                try:
                    if len(g[0]) == 4:
                        return datetime(int(g[0]), int(g[1]), int(g[2]), tzinfo=timezone.utc)
                    day, month, year = int(g[0]), int(g[1]), int(g[2])
                    if month > 12:
                        day, month = month, day
                    return datetime(year, month, day, tzinfo=timezone.utc)
                except ValueError:
                    continue

    cleaned = "\n".join(
        line for line in lines
        if not line.lower().startswith("/gps") and "v7." not in line.lower()
    )
    for pat in DATE_PATTERNS:
        match = pat.search(cleaned)
        if not match:
            continue
        g = match.groups()
        try:
            if len(g[0]) == 4:
                y, mo, d = int(g[0]), int(g[1]), int(g[2])
            else:
                d, mo, y = int(g[0]), int(g[1]), int(g[2])
                if mo > 12:
                    d, mo = mo, d
            return datetime(y, mo, d, tzinfo=timezone.utc)
        except ValueError:
            continue

    match = _ROMAN_PAT.search(cleaned)
    if match:
        return _from_roman_match(match)
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


def _read_magarrow_table(path: str) -> pd.DataFrame:
    """Read MagArrow CSV the way Oasis / QGIS do: keep named columns, ignore NMEA extras.

    GPS-fix rows embed ``$GNGGA`` / ``$GNRMC`` in single quotes, which pandas'
    default reader treats as extra commas and aborts the whole file.
    """
    with open(path, "r", errors="ignore", newline="") as handle:
        first = handle.readline()
        if not first.strip():
            raise ValueError(f"MagArrow file {os.path.basename(path)} is empty")
        header = next(csv.reader([first], skipinitialspace=True))
        names = [c.strip() for c in header]
        width = len(names)
        if width < 6:
            raise ValueError(f"MagArrow file {os.path.basename(path)} has no usable header")

        body: list[list[str]] = []
        for quote in ("'", '"'):
            handle.seek(0)
            handle.readline()
            reader = csv.reader(handle, delimiter=",", quotechar=quote, skipinitialspace=True)
            rows = []
            for row in reader:
                if not row or all(not cell.strip() for cell in row):
                    continue
                if len(row) > width:
                    row = row[:width]
                elif len(row) < width:
                    row = row + [""] * (width - len(row))
                rows.append(row)
            if rows:
                body = rows
                break
        if not body:
            raise ValueError(f"MagArrow file {os.path.basename(path)} has no data rows")
    return pd.DataFrame(body, columns=names)


def parse_magarrow(path: str) -> pd.DataFrame:
    raw = _read_magarrow_table(path)
    cols = {_norm(c): c for c in raw.columns}

    def pick(*names: str) -> str | None:
        for n in names:
            if n in cols:
                return cols[n]
        return None

    lat_c = pick("latitude", "lat", "y")
    lon_c = pick("longitude", "lon", "long", "x")
    mag_c = pick("mag", "magnetic", "nt", "tmi", "magnt")
    date_c = pick("date")
    time_c = pick("time")
    alt_c = pick("altitude", "alt", "height", "msl", "hae")
    if lat_c is None or lon_c is None or mag_c is None:
        # Positional fallback when headers are missing but the MagArrow layout is standard
        df_pos = raw.copy()
        df_pos.columns = list(range(len(df_pos.columns)))
        out = pd.DataFrame(
            {
                "Date": df_pos[1] if 1 in df_pos.columns else df_pos.iloc[:, 1],
                "Time": df_pos[2] if 2 in df_pos.columns else df_pos.iloc[:, 2],
                "y": pd.to_numeric(df_pos.iloc[:, 3], errors="coerce"),
                "x": pd.to_numeric(df_pos.iloc[:, 4], errors="coerce"),
                "magnetic_field": pd.to_numeric(df_pos.iloc[:, 5], errors="coerce"),
            }
        )
        if df_pos.shape[1] > 10:
            out["z"] = pd.to_numeric(df_pos.iloc[:, 10], errors="coerce")
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


def magarrow_survey_date(df: pd.DataFrame) -> datetime | None:
    if df is None or df.empty or "timestamp" not in df.columns:
        return None
    ts = df["timestamp"].dropna()
    if ts.empty:
        return None
    return datetime.fromtimestamp(float(ts.iloc[0]), tz=timezone.utc).replace(tzinfo=None)


def parse_geosoft_xyz(path: str) -> pd.DataFrame:
    """Deprecated loose XYZ. Gravity pack uses formats.gravity.parse_gravity_table."""
    from formats.gravity import parse_gravity_table

    df, _qc = parse_gravity_table(path)
    return df


def parse_las(path: str) -> dict:
    """CWLS LAS 2.0 WRAP.NO well log. LASF / WRAP.YES / LAS 3.0 raise ValueError."""
    from formats.las import parse_las_20

    return parse_las_20(path)


def parse_geojson(path: str, role: str | None = None, role_reviewed: bool = False) -> dict:
    """Documented GeoJSON. RFC 7946 files are OGC:CRS84; legacy crs and .prj are custom contracts."""
    from formats.geojson import parse_geojson as impl

    return impl(path, role=role, role_reviewed=role_reviewed)


def parse_dzt(path: str) -> dict:
    """Recognised-unsupported. G-AID does not invent dt, dx, or antenna from a DZT header."""
    raise ValueError(
        f"GSSI DZT is recognised-unsupported ({path}). Convert to a documented G-AID GPR 1.0 CSV. "
        "I will not invent dt, dx, or antenna frequency from a binary header."
    )


def struct_u16(buf: bytes, offset: int) -> int:
    import struct

    return struct.unpack_from("<H", buf, offset)[0]


def struct_f32(buf: bytes, offset: int) -> float:
    import struct

    return struct.unpack_from("<f", buf, offset)[0]
