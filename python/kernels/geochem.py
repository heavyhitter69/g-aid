"""Documented geochemistry kernels on the generic DAG.

There is no GeochemPipeline execution route.
Anomaly detection, prospectivity, targeting, resource estimation, and ML
classification are not implemented.
"""

from __future__ import annotations

import csv
import json
import math
import os
import statistics

from science.artifacts import make_artifact, skipped, task_dir, write_json, write_lineage


def _params(payload: dict) -> dict:
    return payload.get("parameters") or {}


def _out(payload: dict) -> str:
    return task_dir(payload)


def _find(directory: str, *names: str) -> str:
    for name in names:
        path = os.path.join(directory, name)
        if os.path.isfile(path):
            return path
    raise FileNotFoundError(f"None of {names} found in {directory}")


def _bound_geochem(params: dict) -> list[dict]:
    items = params.get("catalogInputs") or params.get("catalog_inputs") or []
    if not isinstance(items, list) or not items:
        raise ValueError("geochem_ingest requires parameters.catalogInputs from the frozen plan.")
    out = []
    for item in items:
        if not isinstance(item, dict):
            continue
        adapter = str(item.get("adapterId") or item.get("kind") or "").lower()
        fmt = str(item.get("formatId") or "").lower()
        if adapter in {"geochem-csv", "geochem-xyz"} or fmt in {"geochem-csv", "geochem-xyz"}:
            out.append(item)
    if not out:
        raise ValueError("No bound geochem-csv/geochem-xyz catalog records. I will not search by extension or sniff Fe/Cu columns.")
    return out


def _abs(params: dict, item: dict) -> str:
    rel = str(item.get("path") or "")
    filepath = item.get("absPath") or item.get("abs_path") or rel
    if filepath and not os.path.isabs(str(filepath)):
        filepath = os.path.abspath(os.path.join(str(params.get("baseDir") or ""), str(filepath)))
    return str(filepath)


def _mapping(item: dict) -> dict | None:
    mapping = item.get("geochemMapping") or item.get("geochem_mapping")
    return mapping if isinstance(mapping, dict) else None


def _write_canonical_csv(path: str, tables: list[dict]) -> None:
    element_keys: list[str] = []
    for table in tables:
        for sample in table.get("samples") or []:
            for key in sample.get("values") or {}:
                if key not in element_keys:
                    element_keys.append(key)
    fieldnames = [
        "source_path",
        "sample_id",
        "x",
        "y",
        "medium",
        "qc_flag",
        "batch",
        "date",
        "lab",
        "method",
        "crs",
        "kind",
    ]
    for key in element_keys:
        fieldnames.extend([key, f"{key}_qual", f"{key}_dl", f"{key}_censored"])
    with open(path, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for table in tables:
            for sample in table.get("samples") or []:
                row = {
                    "source_path": table.get("source_path"),
                    "sample_id": sample.get("sample_id"),
                    "x": sample.get("x"),
                    "y": sample.get("y"),
                    "medium": sample.get("medium"),
                    "qc_flag": sample.get("qc_flag"),
                    "batch": sample.get("batch"),
                    "date": sample.get("date"),
                    "lab": sample.get("lab"),
                    "method": sample.get("method"),
                    "crs": table.get("crs"),
                    "kind": "raw",
                }
                for key in element_keys:
                    val = (sample.get("values") or {}).get(key) or {}
                    row[key] = val.get("value")
                    row[f"{key}_qual"] = val.get("qualifier")
                    row[f"{key}_dl"] = val.get("detection_limit")
                    row[f"{key}_censored"] = val.get("censored")
                writer.writerow(row)


def geochem_ingest(payload: dict) -> dict:
    from formats.geochem import parse_geochem_table

    node_id = "geochem_ingest"
    out = _out(payload)
    params = _params(payload)
    tables = []
    sources = []
    events = []
    for item in _bound_geochem(params):
        filepath = _abs(params, item)
        parsed = parse_geochem_table(filepath, mapping=_mapping(item))
        parsed["catalog_id"] = item.get("catalogId") or item.get("catalog_id")
        parsed["checksum"] = item.get("checksum")
        parsed["source_path"] = item.get("path") or filepath
        tables.append(parsed)
        sources.append(str(item.get("path") or filepath))
        events.append(
            {
                "type": "NODE_PROGRESS",
                "message": (
                    f"Ingested geochemistry '{os.path.basename(filepath)}' n={parsed['n']} "
                    f"CRS={parsed['crs']} medium={parsed['medium']}. Below-detection stays censored."
                ),
            }
        )
    qc = {
        "product_name": "G-AID documented geochemical sample table",
        "format": "geochem-csv",
        "tables": [
            {
                "source_path": table["source_path"],
                "catalog_id": table.get("catalog_id"),
                "checksum": table.get("checksum"),
                "crs": table["crs"],
                "crs_epsg": table.get("crs_epsg"),
                "medium": table.get("medium"),
                "lab": table.get("lab"),
                "method": table.get("method"),
                "n": table["n"],
                "units": table.get("units"),
                "mixed_units": table.get("mixed_units"),
                "detection_limit_treatment": table.get("detection_limit_treatment"),
                "replaced_bdl_with_zero": False,
                "imputed": False,
                "log_transformed": False,
                "kind": "raw",
            }
            for table in tables
        ],
        "n_tables": len(tables),
        "replaced_bdl_with_zero": False,
        "imputed": False,
        "log_transformed": False,
    }
    canonical_json = os.path.join(out, "geochem_canonical.json")
    write_json(canonical_json, {"kind": "geochem-samples", "tables": tables, "product_kind": "raw"})
    canonical_csv = os.path.join(out, "geochem_canonical.csv")
    _write_canonical_csv(canonical_csv, tables)
    mapping_path = write_json(
        os.path.join(out, "geochem_mapping.json"),
        {"frozen": True, "tables": [{"source_path": t["source_path"], "mapping": t.get("mapping")} for t in tables]},
    )
    qc_path = write_json(os.path.join(out, "geochem_ingest_qc.json"), qc)
    write_lineage(out, node_id, "Documented G-AID GEOCHEM 1.0 ingest", {"n": len(tables)}, sources, [canonical_json, canonical_csv, qc_path, mapping_path])
    return {
        "artifacts": [
            make_artifact("artifact-geochem-canonical-json", "processed_dataset", "json", canonical_json, node_id),
            make_artifact("artifact-geochem-canonical-csv", "processed_dataset", "csv", canonical_csv, node_id),
            make_artifact("artifact-geochem-ingest-qc", "qc_report", "json", qc_path, node_id),
            make_artifact("artifact-geochem-mapping", "qc_report", "json", mapping_path, node_id),
        ],
        "events": events,
    }


def _load_canonical(out: str) -> dict:
    src = _find(out, "geochem_canonical.json")
    with open(src, encoding="utf-8") as handle:
        return json.load(handle)


def geochem_qc(payload: dict) -> dict:
    node_id = "geochem_qc"
    out = _out(payload)
    canonical = _load_canonical(out)
    tables = canonical.get("tables") or []
    duplicate_ids = []
    duplicate_locations = []
    invalid_numeric = 0
    missing_metadata = 0
    n_censored = 0
    n_values = 0
    mixed_units = False
    blanks = []
    standards = []
    field_dups = []
    lab_dups = []
    qc_rules_present = False
    for table in tables:
        mixed_units = mixed_units or bool(table.get("mixed_units"))
        if table.get("standard_expected"):
            qc_rules_present = True
        seen_ids: dict[str, int] = {}
        seen_xy: dict[tuple[float, float], int] = {}
        for sample in table.get("samples") or []:
            sid = str(sample.get("sample_id") or "")
            seen_ids[sid] = seen_ids.get(sid, 0) + 1
            x, y = sample.get("x"), sample.get("y")
            if isinstance(x, (int, float)) and isinstance(y, (int, float)):
                key = (round(float(x), 4), round(float(y), 4))
                seen_xy[key] = seen_xy.get(key, 0) + 1
            else:
                invalid_numeric += 1
            if not sample.get("medium"):
                missing_metadata += 1
            flag = str(sample.get("qc_flag") or "sample").lower()
            if flag == "blank":
                blanks.append(sid)
            elif flag == "standard":
                standards.append(sid)
            elif flag == "field_duplicate":
                field_dups.append(sid)
            elif flag == "lab_duplicate":
                lab_dups.append(sid)
            for val in (sample.get("values") or {}).values():
                n_values += 1
                if val.get("censored"):
                    n_censored += 1
                if val.get("value") == 0 and val.get("censored"):
                    invalid_numeric += 1
        duplicate_ids.extend([sid for sid, n in seen_ids.items() if sid and n > 1])
        duplicate_locations.extend([{"x": xy[0], "y": xy[1], "n": n} for xy, n in seen_xy.items() if n > 1])

    qa_qc = {
        "applied": False,
        "reason": "QA/QC summaries for blanks, standards, and duplicates run only when those records and expected-value rules are explicitly present.",
    }
    if (blanks or standards or field_dups or lab_dups) and qc_rules_present:
        qa_qc = {
            "applied": True,
            "blanks": {"n": len(blanks), "ids": blanks},
            "standards": {"n": len(standards), "ids": standards, "expected": [t.get("standard_expected") for t in tables if t.get("standard_expected")]},
            "field_duplicates": {"n": len(field_dups), "ids": field_dups},
            "lab_duplicates": {"n": len(lab_dups), "ids": lab_dups},
            "note": "Counts only. Recovery statistics require documented expected values per standard ID; no silent pass/fail is invented.",
        }
    elif blanks or standards or field_dups or lab_dups:
        qa_qc = {
            "applied": False,
            "reason": "QCFlag records are present, but StandardExpected / duplicate pairing rules were not documented. Counts are listed; pass/fail is not computed.",
            "blanks_n": len(blanks),
            "standards_n": len(standards),
            "field_duplicates_n": len(field_dups),
            "lab_duplicates_n": len(lab_dups),
        }

    report = {
        "product_name": "G-AID documented geochemical sample table",
        "n_tables": len(tables),
        "n_samples": sum(len(t.get("samples") or []) for t in tables),
        "n_values": n_values,
        "n_censored": n_censored,
        "duplicate_sample_ids": sorted(set(duplicate_ids)),
        "duplicate_locations": duplicate_locations,
        "mixed_units": mixed_units,
        "invalid_numeric": invalid_numeric,
        "missing_sample_metadata": missing_metadata,
        "replaced_bdl_with_zero": False,
        "imputed": False,
        "log_transformed": False,
        "qa_qc": qa_qc,
        "kind": "raw",
    }
    path = write_json(os.path.join(out, "geochem_qc.json"), report)
    write_lineage(out, node_id, "Geochemistry QC", {"n_censored": n_censored}, ["geochem_canonical.json"], [path])
    events = [{"type": "NODE_PROGRESS", "message": f"Geochemistry QC: {report['n_samples']} samples, {n_censored} censored. BDL was not zeroed."}]
    if mixed_units:
        events.append({"type": "QC_WARNING", "severity": "warning", "message": "Mixed element units are present. Direct comparison is blocked."})
    if duplicate_ids:
        events.append({"type": "QC_WARNING", "severity": "warning", "message": f"Duplicate sample IDs: {', '.join(sorted(set(duplicate_ids))[:8])}."})
    return {
        "artifacts": [make_artifact("artifact-geochem-qc", "qc_report", "json", path, node_id)],
        "events": events,
    }


def geochem_map_points(payload: dict) -> dict:
    node_id = "geochem_map_points"
    out = _out(payload)
    canonical = _load_canonical(out)
    tables = canonical.get("tables") or []
    features = []
    skipped_no_crs = []
    elements_shown = []
    for table in tables:
        crs = table.get("crs")
        if not crs:
            skipped_no_crs.append(table.get("source_path"))
            continue
        for sample in table.get("samples") or []:
            x, y = sample.get("x"), sample.get("y")
            if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
                continue
            for key, val in (sample.get("values") or {}).items():
                elements_shown.append(key)
                features.append(
                    {
                        "type": "Feature",
                        "id": sample.get("sample_id"),
                        "properties": {
                            "sample_id": sample.get("sample_id"),
                            "medium": sample.get("medium"),
                            "element": val.get("symbol"),
                            "element_key": key,
                            "value": val.get("value"),
                            "unit": val.get("units"),
                            "qualifier": val.get("qualifier"),
                            "censored": val.get("censored"),
                            "detection_limit": val.get("detection_limit"),
                            "qc_flag": sample.get("qc_flag"),
                            "source": table.get("source_path"),
                            "kind": "raw",
                            "filter_state": "unfiltered",
                            "crs": crs,
                        },
                        "geometry": {"type": "Point", "coordinates": [float(x), float(y)]},
                    }
                )
    if skipped_no_crs and not features:
        qc = {
            "skipped": True,
            "reason": "geochem_crs_required",
            "message": "Sample points are not mapped without a documented CRS. Ingest/QC remain available.",
            "collar_mapped": False,
        }
        qc_path = write_json(os.path.join(out, "geochem_points.meta.json"), qc)
        write_json(os.path.join(out, "geochem_map_qc.json"), qc)
        skip = skipped("geochem_map_points", "documented CRS required")
        skip["artifacts"] = [make_artifact("artifact-geochem-map-meta", "qc_report", "json", qc_path, node_id)]
        return skip
    crs = (tables[0].get("crs") if tables else None) or "unknown"
    fc: dict = {"type": "FeatureCollection", "features": features}
    if crs and crs != "OGC:CRS84":
        fc["crs"] = {"type": "name", "properties": {"name": crs}}
    geo_path = os.path.join(out, "geochem_points.geojson")
    with open(geo_path, "w", encoding="utf-8") as handle:
        json.dump(fc, handle, indent=2)
    meta = {
        "product_name": "G-AID documented geochemical sample table",
        "crs": crs,
        "n_features": len(features),
        "elements": sorted(set(elements_shown)),
        "skipped_no_crs": skipped_no_crs,
        "visual_scale": "raw observation (not an anomaly score)",
        "kind": "raw",
        "warnings": [
            "Assay values are observations, not ore or drill targets.",
            "Qualifiers, units, source, and filter state are map attributes.",
            "Below-detection samples remain censored (value null).",
        ],
    }
    meta_path = write_json(os.path.join(out, "geochem_points.meta.json"), meta)
    write_lineage(out, node_id, "Geochemistry sample points", {"n": len(features)}, ["geochem_canonical.json"], [geo_path, meta_path])
    return {
        "artifacts": [
            make_artifact("artifact-geochem-points", "vector", "geojson", geo_path, node_id),
            make_artifact("artifact-geochem-points-meta", "qc_report", "json", meta_path, node_id),
        ],
        "events": [{"type": "NODE_PROGRESS", "message": f"Mapped {len(features)} sample point observation(s). High values are not ore."}],
    }


def _stats(values: list[float]) -> dict:
    if not values:
        return {"n": 0, "min": None, "max": None, "median": None, "mean": None}
    return {
        "n": len(values),
        "min": min(values),
        "max": max(values),
        "median": statistics.median(values),
        "mean": statistics.fmean(values),
    }


def geochem_summary(payload: dict) -> dict:
    node_id = "geochem_summary"
    out = _out(payload)
    canonical = _load_canonical(out)
    params = _params(payload)
    requested = params.get("elements") or params.get("compareElements")
    if isinstance(requested, str):
        requested = [part.strip() for part in requested.split(",") if part.strip()]
    tables = canonical.get("tables") or []
    by_element: dict[str, dict] = {}
    for table in tables:
        for sample in table.get("samples") or []:
            for key, val in (sample.get("values") or {}).items():
                bucket = by_element.setdefault(
                    key,
                    {"symbol": val.get("symbol"), "units": val.get("units"), "uncensored": [], "n_censored": 0, "n": 0, "kind": "raw"},
                )
                bucket["n"] += 1
                if val.get("censored") or val.get("value") is None:
                    bucket["n_censored"] += 1
                else:
                    bucket["uncensored"].append(float(val["value"]))
    elements = []
    for key, bucket in sorted(by_element.items()):
        stats = _stats(bucket["uncensored"])
        elements.append(
            {
                "key": key,
                "symbol": bucket["symbol"],
                "units": bucket["units"],
                "n": bucket["n"],
                "n_censored": bucket["n_censored"],
                "n_uncensored": stats["n"],
                "min": stats["min"],
                "max": stats["max"],
                "median": stats["median"],
                "mean": stats["mean"],
                "kind": "raw",
                "log_transformed": False,
            }
        )
    selected = elements
    if requested:
        wanted = {str(name).lower() for name in requested}
        selected = [el for el in elements if el["key"].lower() in wanted or str(el["symbol"]).lower() in wanted]
    comparisons = []
    if len(selected) >= 2:
        left, right = selected[0], selected[1]
        left_u = (left.get("units") or "").lower()
        right_u = (right.get("units") or "").lower()
        blocked = (not left_u or not right_u or left_u == "unknown" or right_u == "unknown" or left_u != right_u)
        comparisons.append(
            {
                "left": left["key"],
                "right": right["key"],
                "blocked": blocked,
                "reason": (
                    f"Mixed/unknown units ({left.get('units')} vs {right.get('units')}) block direct comparison."
                    if blocked
                    else "Documented same-unit observation pair. Not a mineralisation index or ratio product."
                ),
            }
        )
    summary = {
        "product_name": "G-AID documented geochemical sample table",
        "elements": elements,
        "selected": selected,
        "comparisons": comparisons,
        "kind": "raw",
        "derived": False,
        "display_only": False,
        "log_transformed": False,
        "note": "Statistics use uncensored values only. Censored below-detection samples are counted, not zeroed.",
    }
    path = write_json(os.path.join(out, "geochem_summary.json"), summary)
    write_lineage(out, node_id, "Geochemistry summary statistics", {"n": len(elements)}, ["geochem_canonical.json"], [path])
    events = [{"type": "NODE_PROGRESS", "message": f"Wrote summary for {len(elements)} element column(s). Censored values were excluded from min/max/median."}]
    if any(c.get("blocked") for c in comparisons):
        events.append({"type": "QC_WARNING", "severity": "warning", "message": comparisons[0]["reason"]})
    return {
        "artifacts": [make_artifact("artifact-geochem-summary", "qc_report", "json", path, node_id)],
        "events": events,
    }


def geochem_display_transform(payload: dict) -> dict:
    node_id = "geochem_display_transform"
    out = _out(payload)
    params = _params(payload)
    transform = str(params.get("displayTransform") or params.get("display_transform") or "").lower()
    approved = bool(params.get("approved") or params.get("displayTransformApproved"))
    element = str(params.get("element") or params.get("displayElement") or "").strip()
    if transform != "log10" or not approved:
        qc = {
            "skipped": True,
            "reason": "display_transform_not_approved",
            "message": "Display transforms run only when statistically justified and explicitly user-approved. Original values are unchanged.",
            "requested": transform or None,
            "approved": approved,
        }
        path = write_json(os.path.join(out, "geochem_display.meta.json"), qc)
        skip = skipped("geochem_display_transform", "not approved")
        skip["artifacts"] = [make_artifact("artifact-geochem-display-meta", "qc_report", "json", path, node_id)]
        return skip
    canonical = _load_canonical(out)
    rows = []
    blocked = []
    for table in canonical.get("tables") or []:
        for sample in table.get("samples") or []:
            for key, val in (sample.get("values") or {}).items():
                if element and element.lower() not in {key.lower(), str(val.get("symbol") or "").lower()}:
                    continue
                units = val.get("units")
                if not units or units == "unknown":
                    blocked.append("unknown units")
                    continue
                if val.get("censored") or val.get("value") is None:
                    rows.append(
                        {
                            "sample_id": sample.get("sample_id"),
                            "element": key,
                            "raw_value": None,
                            "display_value": None,
                            "transform": "log10",
                            "skipped": True,
                            "reason": "censored or missing",
                            "kind": "display-only",
                            "units": units,
                        }
                    )
                    continue
                number = float(val["value"])
                if number <= 0:
                    rows.append(
                        {
                            "sample_id": sample.get("sample_id"),
                            "element": key,
                            "raw_value": number,
                            "display_value": None,
                            "transform": "log10",
                            "skipped": True,
                            "reason": "log10 requires strictly positive uncensored values",
                            "kind": "display-only",
                            "units": units,
                        }
                    )
                    continue
                rows.append(
                    {
                        "sample_id": sample.get("sample_id"),
                        "element": key,
                        "raw_value": number,
                        "display_value": math.log10(number),
                        "transform": "log10",
                        "skipped": False,
                        "reason": None,
                        "kind": "display-only",
                        "units": f"log10({units})",
                    }
                )
    csv_path = os.path.join(out, "geochem_display.csv")
    with open(csv_path, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["sample_id", "element", "raw_value", "display_value", "transform", "skipped", "reason", "kind", "units"],
        )
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
    meta = {
        "kind": "display-only",
        "transform": "log10",
        "approved": True,
        "element": element or "(all positive uncensored)",
        "originals_preserved": True,
        "n": len(rows),
        "n_written": sum(1 for row in rows if not row.get("skipped")),
        "blocked": blocked,
        "note": "Display-only. Canonical raw values are unchanged. Not an anomaly score.",
    }
    meta_path = write_json(os.path.join(out, "geochem_display.meta.json"), meta)
    write_lineage(out, node_id, "Approved log10 display transform of uncensored positive values", meta, ["geochem_canonical.json"], [csv_path, meta_path])
    return {
        "artifacts": [
            make_artifact("artifact-geochem-display", "processed_dataset", "csv", csv_path, node_id),
            make_artifact("artifact-geochem-display-meta", "qc_report", "json", meta_path, node_id),
        ],
        "events": [{"type": "NODE_PROGRESS", "message": f"Wrote display-only log10 for {meta['n_written']} uncensored positive value(s). Originals preserved."}],
    }


def geochem_interpret(payload: dict) -> dict:
    node_id = "geochem_interpret"
    out = _out(payload)
    canonical = _load_canonical(out)
    qcs = {}
    for name in ("geochem_ingest_qc.json", "geochem_qc.json", "geochem_summary.json", "geochem_points.meta.json", "geochem_display.meta.json"):
        path = os.path.join(out, name)
        if os.path.isfile(path):
            with open(path, encoding="utf-8") as handle:
                qcs[name] = json.load(handle)
    tables = canonical.get("tables") or []
    n = sum(len(t.get("samples") or []) for t in tables)
    media = sorted({t.get("medium") or "undocumented" for t in tables})
    units = sorted({u for t in tables for u in (t.get("units") or [])})
    observations = [
        f"{len(tables)} documented geochemistry table(s) were ingested ({n} samples).",
        f"Sample medium recorded as: {', '.join(media)}.",
        f"Documented units: {', '.join(units) or '(none)'}.",
    ]
    summary = qcs.get("geochem_summary.json") or {}
    for el in (summary.get("elements") or [])[:8]:
        observations.append(
            f"{el.get('key')}: n={el.get('n')}, n_censored={el.get('n_censored')}, "
            f"uncensored min/median/max={el.get('min')}/{el.get('median')}/{el.get('max')} {el.get('units')}."
        )
    report = {
        "product_name": "G-AID documented geochemical sample table",
        "observations": observations,
        "analytical_limitations": [
            "Lab method, detection limits, and qualifiers constrain what the numbers mean.",
            "Coverage is the sample locations present in the bound files, not a complete survey.",
        ],
        "assumptions": [
            "G-AID GEOCHEM 1.0 comment contract (CRS, Medium, documented element units) was required.",
            "Below-detection values are censored observations, not zeros.",
            "Display transforms, when present, are user-approved and do not replace canonical values.",
        ],
        "uncertainty": [
            "Sample medium and sampling density bias the observed range.",
            "Detection-limit treatment excludes censored values from min/max/median.",
            "Spatial association with faults, geology, gravity, magnetics, or radiometrics is not causal evidence.",
        ],
        "recommendations": [
            "Do not treat high values as ore, economic grade, mineralisation confirmation, or drill targets.",
            "Do not compare elements with unknown or mixed units.",
            "Keep anomaly detection, prospectivity, targeting, resource estimation, and ML classification out of this pack.",
        ],
        "not_established": [
            "Ore is not established.",
            "Economic grade is not established.",
            "Mineralisation is not established.",
            "Drill targets are not established.",
            "Anomaly detection is not established.",
            "Prospectivity is not established.",
            "Resource or reserve estimates are not established.",
            "Causal relationships from overlay are not established.",
        ],
        "geological_certainty_improved": False,
        "qc": qcs,
        "interpretation_limit": "High assay values are observations. Overlay and familiar element names do not prove mineralisation.",
    }
    path = write_json(os.path.join(out, "geochem_interpretation.json"), report)
    write_lineage(out, node_id, "Geochemistry interpretation limits", {"n": n}, ["geochem_canonical.json"], [path])
    return {
        "artifacts": [make_artifact("artifact-geochem-interpretation", "report", "json", path, node_id)],
        "events": [{"type": "NODE_PROGRESS", "message": "Wrote geochemistry interpretation limits. Geological certainty is not improved."}],
    }
