"""G-AID GEOCHEM 1.0 documented assay/sample reader.

Element-like column names are not geochemistry. Classification requires a
G-AID GEOCHEM banner and/or / CRS= plus / Medium=. Below-detection values
stay censored; they are never replaced with zero.
"""

from __future__ import annotations

import csv
import math
import os
import re
from typing import Any

GEOCHEM_BANNER = re.compile(r"g-aid\s*geochem", re.I)
COMMENT_RE = re.compile(r"^[/\\#;]")
ELEMENT_UNIT = re.compile(
    r"^(?P<symbol>[A-Za-z][A-Za-z0-9]*)_(?P<unit>ppm|ppb|pct|percent|wt%|wtpct)$",
    re.I,
)
BDL_TOKEN = re.compile(r"^(bdl|nd|n\.?d\.?|ldl|n/a|-)$", re.I)
LT_TOKEN = re.compile(r"^<\s*(?P<dl>[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)$")
QUAL_CENSOR = re.compile(r"^(<|>|u|lt|bdl|nd)$", re.I)


def _norm(name: str) -> str:
    return re.sub(r"[\s\-]+", "_", str(name).replace("\ufeff", "").strip().lower())


def looks_like_geochem(text: str) -> bool:
    if GEOCHEM_BANNER.search(text or ""):
        return True
    comments = "\n".join(
        line for line in (text or "").splitlines() if COMMENT_RE.match(line.strip()) or line.strip().lower().startswith("/")
    )
    return bool(re.search(r"/\s*CRS\s*=", comments, re.I) and re.search(r"/\s*Medium\s*=", comments, re.I))


def parse_comment_meta(text: str) -> dict[str, Any]:
    comments = [
        line.strip()
        for line in (text or "").splitlines()
        if COMMENT_RE.match(line.strip()) or line.strip().lower().startswith("/")
    ]
    blob = "\n".join(comments)
    epsg_match = re.search(r"EPSG\s*[=:]\s*(\d{4,5})", blob, re.I) or re.search(r"CRS\s*[=:]\s*EPSG:(\d{4,5})", blob, re.I)
    crs84 = bool(re.search(r"CRS\s*[=:]\s*OGC:CRS84", blob, re.I))
    crs_name = re.search(r"CRS\s*[=:]\s*([^\n]+)", blob, re.I)
    medium = re.search(r"Medium\s*[=:]\s*([^\n]+)", blob, re.I)
    units = re.search(r"Units\s*[=:]\s*([^\n]+)", blob, re.I)
    lab = re.search(r"Lab\s*[=:]\s*([^\n]+)", blob, re.I)
    method = re.search(r"Method\s*[=:]\s*([^\n]+)", blob, re.I)
    dl_treat = re.search(r"DetectionLimitTreatment\s*[=:]\s*([^\n]+)", blob, re.I)
    std_exp = re.search(r"StandardExpected\s*[=:]\s*([^\n]+)", blob, re.I)
    epsg = int(epsg_match.group(1)) if epsg_match else None
    if crs84:
        crs = "OGC:CRS84"
    elif epsg:
        crs = f"EPSG:{epsg}"
    elif crs_name:
        crs = crs_name.group(1).strip()
    else:
        crs = None
    return {
        "crs": crs,
        "crs_epsg": epsg,
        "medium": medium.group(1).strip() if medium else None,
        "units": units.group(1).strip() if units else None,
        "lab": lab.group(1).strip() if lab else None,
        "method": method.group(1).strip() if method else None,
        "detection_limit_treatment": (dl_treat.group(1).strip() if dl_treat else "censored"),
        "standard_expected": std_exp.group(1).strip() if std_exp else None,
        "comments": comments,
    }


def normalize_unit(raw: str | None) -> str | None:
    if not raw:
        return None
    value = re.sub(r"\s+", "", str(raw).strip().lower())
    if value in {"ppm", "ug/g", "µg/g"}:
        return "ppm"
    if value in {"ppb", "ng/g"}:
        return "ppb"
    if value in {"pct", "percent", "%", "wt%", "wtpct", "wt.%"}:
        return "pct"
    return str(raw).strip()


def parse_censored(raw: Any) -> dict[str, Any]:
    text = "" if raw is None else str(raw).strip()
    if not text:
        return {"numeric": None, "censored": False, "qualifier": None, "detection_limit": None}
    if BDL_TOKEN.match(text):
        return {"numeric": None, "censored": True, "qualifier": "BDL", "detection_limit": None}
    lt = LT_TOKEN.match(text)
    if lt:
        dl = float(lt.group("dl"))
        return {"numeric": None, "censored": True, "qualifier": "<", "detection_limit": dl}
    if text == "<":
        return {"numeric": None, "censored": True, "qualifier": "<", "detection_limit": None}
    try:
        num = float(text)
        if math.isfinite(num):
            return {"numeric": num, "censored": False, "qualifier": None, "detection_limit": None}
    except ValueError:
        pass
    return {"numeric": None, "censored": False, "qualifier": None, "detection_limit": None}


def qualifier_censored(raw: Any) -> bool:
    if raw is None:
        return False
    return bool(QUAL_CENSOR.match(str(raw).strip()))


def _split(line: str) -> list[str]:
    cleaned = re.sub(r"^[/\\#;]\s*", "", line).strip()
    if not cleaned:
        return []
    if "," in cleaned:
        return [part.strip() for part in next(csv.reader([cleaned])) if part.strip()]
    return cleaned.split()


def _is_numeric_row(cols: list[str]) -> bool:
    if len(cols) < 2:
        return False
    return all(re.match(r"^-?\d+(\.\d+)?([eE][+-]?\d+)?$", col) for col in cols)


def find_header_columns(text: str) -> list[str]:
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if COMMENT_RE.match(line):
            cols = _split(line)
            if len(cols) >= 3 and not _is_numeric_row(cols) and any(re.search(r"sample|site|x|y|easting|northing", c, re.I) for c in cols):
                return cols
            continue
        cols = _split(line)
        if len(cols) >= 3 and not _is_numeric_row(cols):
            return cols
        break
    return []


SAMPLE_ALIASES = {"sampleid", "sample_id", "sampid", "site", "site_id", "sample"}
X_ALIASES = {"x", "easting", "east"}
Y_ALIASES = {"y", "northing", "north"}
MEDIUM_ALIASES = {"medium", "type", "sample_type", "samplemedium", "lithology"}
QC_ALIASES = {"qcflag", "qc_flag", "qc", "sample_class"}
BATCH_ALIASES = {"batch", "job", "workorder"}
DATE_ALIASES = {"date", "sample_date", "sampled"}
LAB_ALIASES = {"lab", "laboratory"}
METHOD_ALIASES = {"method", "anal_method", "analytical_method"}
RESERVED = SAMPLE_ALIASES | X_ALIASES | Y_ALIASES | MEDIUM_ALIASES | QC_ALIASES | BATCH_ALIASES | DATE_ALIASES | LAB_ALIASES | METHOD_ALIASES


def _alias_hit(aliases: set[str], columns: list[str]) -> str | None:
    hits = [col for col in columns if _norm(col) in aliases]
    return hits[0] if len(hits) == 1 else None


def parse_element_column(name: str) -> dict[str, str] | None:
    cleaned = str(name).replace("\ufeff", "").strip()
    if re.search(r"_(qual|qualifier|dl|lod|detection_limit)$", cleaned, re.I):
        return None
    match = ELEMENT_UNIT.match(cleaned)
    if not match:
        return None
    return {
        "column": cleaned,
        "symbol": match.group("symbol"),
        "units": normalize_unit(match.group("unit")) or match.group("unit"),
    }


def suggest_mapping(columns: list[str], meta: dict[str, Any]) -> dict[str, Any] | None:
    sample_id = _alias_hit(SAMPLE_ALIASES, columns)
    x = _alias_hit(X_ALIASES, columns)
    y = _alias_hit(Y_ALIASES, columns)
    if not sample_id or not x or not y:
        return None
    elements = []
    for col in columns:
        parsed = parse_element_column(col)
        if parsed:
            stem = re.sub(r"_(ppm|ppb|pct|percent|wt%|wtpct)$", "", parsed["column"], flags=re.I)
            qual = next((c for c in columns if _norm(c) in {_norm(f"{stem}_qual"), _norm(f"{stem}_qualifier"), _norm(f"{parsed['symbol']}_qual")}), None)
            dl = next((c for c in columns if _norm(c) in {_norm(f"{stem}_dl"), _norm(f"{stem}_lod"), _norm(f"{parsed['symbol']}_dl")}), None)
            parsed["qualifierColumn"] = qual
            parsed["detectionLimitColumn"] = dl
            elements.append(parsed)
    if not elements:
        default_unit = normalize_unit(meta.get("units"))
        if default_unit:
            for col in columns:
                if _norm(col) in RESERVED:
                    continue
                if re.match(r"^[A-Z][a-z]?$", col.strip()) or re.match(r"^[A-Z][a-z]{0,8}$", col.strip()):
                    elements.append({"column": col, "symbol": col, "units": default_unit})
    if not elements:
        return None
    return {
        "sampleId": sample_id,
        "x": x,
        "y": y,
        "medium": _alias_hit(MEDIUM_ALIASES, columns),
        "elements": elements,
        "qcFlag": _alias_hit(QC_ALIASES, columns),
        "batch": _alias_hit(BATCH_ALIASES, columns),
        "date": _alias_hit(DATE_ALIASES, columns),
        "lab": _alias_hit(LAB_ALIASES, columns),
        "method": _alias_hit(METHOD_ALIASES, columns),
        "reviewed": False,
    }


def mapping_is_canonical(mapping: dict[str, Any], columns: list[str]) -> bool:
    if mapping.get("sampleId") != "SampleID" or mapping.get("x") != "X" or mapping.get("y") != "Y":
        return False
    if "SampleID" not in columns or "X" not in columns or "Y" not in columns:
        return False
    if mapping.get("medium") and mapping.get("medium") != "Medium":
        return False
    elements = mapping.get("elements") or []
    if not elements:
        return False
    for el in elements:
        parsed = parse_element_column(el.get("column") or "")
        if not parsed or parsed["symbol"] != el.get("symbol"):
            return False
    return True


def _read_table(path: str) -> tuple[list[str], list[list[str]], str]:
    with open(path, encoding="utf-8", errors="ignore") as handle:
        text = handle.read()
    if not looks_like_geochem(text):
        raise ValueError(
            f"{os.path.basename(path)} is not a G-AID GEOCHEM 1.0 table. "
            "Element-like column names are not assay data."
        )
    columns = find_header_columns(text)
    if not columns:
        raise ValueError(f"{os.path.basename(path)} has no named geochemistry header.")
    rows: list[list[str]] = []
    header_seen = False
    for raw in text.splitlines():
        line = raw.strip()
        if not line or COMMENT_RE.match(line):
            continue
        cols = _split(line)
        if not header_seen and not _is_numeric_row(cols):
            header_seen = True
            continue
        header_seen = True
        if len(cols) < len(columns):
            cols = cols + [""] * (len(columns) - len(cols))
        rows.append(cols[: len(columns)])
    return columns, rows, text


def parse_geochem_table(path: str, mapping: dict[str, Any] | None = None) -> dict[str, Any]:
    columns, rows, text = _read_table(path)
    meta = parse_comment_meta(text)
    suggested = mapping if mapping and mapping.get("sampleId") else suggest_mapping(columns, meta)
    if not suggested:
        raise ValueError(
            f"{os.path.basename(path)} is missing SampleID/X/Y and documented element columns. "
            "Store a reviewed mapping before processing."
        )
    if not mapping_is_canonical(suggested, columns) and not suggested.get("reviewed"):
        raise ValueError(
            f"{os.path.basename(path)} needs a reviewed column mapping. Canonical headers are SampleID, X, Y, Medium, Element_unit."
        )
    if not meta.get("crs") and meta.get("crs_epsg") is None:
        raise ValueError(f"{os.path.basename(path)} has no documented CRS (/ CRS=EPSG:… or / CRS=OGC:CRS84).")
    if not meta.get("medium") and not suggested.get("medium"):
        raise ValueError(f"{os.path.basename(path)} has no documented sample medium (/ Medium=… or Medium column).")

    idx = {name: columns.index(name) for name in columns}

    def cell(row: list[str], name: str | None) -> str:
        if not name or name not in idx:
            return ""
        return row[idx[name]] if idx[name] < len(row) else ""

    samples = []
    for row in rows:
        sample = {
            "sample_id": cell(row, suggested["sampleId"]),
            "x": None,
            "y": None,
            "medium": cell(row, suggested.get("medium")) or meta.get("medium"),
            "qc_flag": (cell(row, suggested.get("qcFlag")) or "sample").strip().lower() or "sample",
            "batch": cell(row, suggested.get("batch")) or None,
            "date": cell(row, suggested.get("date")) or None,
            "lab": cell(row, suggested.get("lab")) or meta.get("lab"),
            "method": cell(row, suggested.get("method")) or meta.get("method"),
            "values": {},
        }
        try:
            sample["x"] = float(cell(row, suggested["x"]))
        except ValueError:
            sample["x"] = None
        try:
            sample["y"] = float(cell(row, suggested["y"]))
        except ValueError:
            sample["y"] = None
        for el in suggested.get("elements") or []:
            parsed = parse_censored(cell(row, el.get("column")))
            qual_raw = cell(row, el.get("qualifierColumn"))
            dl_raw = cell(row, el.get("detectionLimitColumn"))
            censored = parsed["censored"] or qualifier_censored(qual_raw)
            dl = parsed["detection_limit"]
            if dl is None and dl_raw:
                try:
                    dl = float(dl_raw)
                except ValueError:
                    dl = None
            numeric = parsed["numeric"]
            if censored:
                numeric = None
            key = f"{el.get('symbol')}_{normalize_unit(el.get('units')) or el.get('units') or 'unknown'}"
            sample["values"][key] = {
                "symbol": el.get("symbol"),
                "units": normalize_unit(el.get("units")) or el.get("units"),
                "value": numeric,
                "censored": censored,
                "qualifier": parsed["qualifier"] or (qual_raw.strip() if qual_raw else None),
                "detection_limit": dl,
                "source_column": el.get("column"),
                "kind": "raw",
            }
        if sample["sample_id"]:
            samples.append(sample)

    units = sorted({v["units"] for s in samples for v in s["values"].values() if v.get("units")})
    return {
        "kind": "geochem-samples",
        "product_name": "G-AID documented geochemical sample table",
        "source_path": path,
        "crs": meta.get("crs"),
        "crs_epsg": meta.get("crs_epsg"),
        "medium": meta.get("medium"),
        "lab": meta.get("lab"),
        "method": meta.get("method"),
        "detection_limit_treatment": meta.get("detection_limit_treatment") or "censored",
        "standard_expected": meta.get("standard_expected"),
        "mapping": suggested,
        "columns": columns,
        "units": units,
        "mixed_units": len(set(units)) > 1,
        "samples": samples,
        "n": len(samples),
        "replaced_bdl_with_zero": False,
        "imputed": False,
        "log_transformed": False,
    }
