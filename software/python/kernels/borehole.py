"""LAS well-log / borehole kernels on the generic DAG.

There is no BoreholePipeline execution route.
"""

from __future__ import annotations

import json
import os

import numpy as np
import pandas as pd

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


def _bound_las(params: dict) -> list[dict]:
    items = params.get("catalogInputs") or params.get("catalog_inputs") or []
    if not isinstance(items, list) or not items:
        raise ValueError("las_ingest requires parameters.catalogInputs from the frozen plan.")
    out = []
    for item in items:
        if not isinstance(item, dict):
            continue
        adapter = str(item.get("adapterId") or item.get("kind") or "").lower()
        if adapter in {"las-well"}:
            out.append(item)
    if not out:
        raise ValueError("No bound las-well catalog records. I will not search by extension or decode LASF LiDAR.")
    return out


def _truthy(value) -> bool:
    if isinstance(value, str):
        return value.strip().lower() not in {"0", "false", "no", "off", ""}
    return bool(value)


def las_ingest(payload: dict) -> dict:
    from formats.las import parse_las_20

    node_id = "las_ingest"
    out = _out(payload)
    params = _params(payload)
    frames = []
    qc_files = []
    events = []
    sources = []
    for item in _bound_las(params):
        rel = str(item.get("path") or "")
        filepath = item.get("absPath") or item.get("abs_path") or rel
        if filepath and not os.path.isabs(str(filepath)):
            filepath = os.path.abspath(os.path.join(str(params.get("baseDir") or ""), str(filepath)))
        parsed = parse_las_20(str(filepath))
        table = parsed["data"].copy()
        table["well_id"] = parsed["well"]
        table["depth_reference"] = "measured depth"
        table["source_catalog_id"] = item.get("catalogId") or item.get("catalog_id")
        table["source_checksum"] = item.get("checksum")
        frames.append(table)
        qc = {
            "product_name": "G-AID LAS 2.0 canonical log",
            "las_standard": "CWLS LAS 2.0 WRAP.NO",
            "las_version": parsed["las_version"],
            "wrap": parsed["wrap"],
            "well_id": parsed["well"],
            "null_value": parsed["null"],
            "null_assumed": parsed["null_assumed"],
            "strt": parsed["strt"],
            "stop": parsed["stop"],
            "step": parsed["step"],
            "depth_index": parsed["depth_index"],
            "depth_units": parsed["depth_units"],
            "depth_reference": "measured depth",
            "n_rows": parsed["n_rows"],
            "curves": parsed["curves"],
            "collar_x": parsed["collar_x"],
            "collar_y": parsed["collar_y"],
            "collar_z": parsed["collar_z"],
            "collar_z_mnemonic": parsed["collar_z_mnemonic"],
            "coordinate_kind": parsed["coordinate_kind"],
            "crs_epsg": parsed["crs_epsg"],
            "elevation_datum": parsed["elevation_datum"],
            "location_quality": parsed["location_quality"],
            "collar_mappable": parsed["collar_mappable"],
            "trajectory_computed": False,
            "catalog_id": item.get("catalogId") or item.get("catalog_id"),
            "checksum": item.get("checksum"),
            "header_provenance": parsed["header_provenance"],
            "warnings": parsed["warnings"],
            "formula": parsed["formula"],
        }
        qc_files.append(qc)
        sources.append(str(item.get("path") or filepath))
        events.append(
            {
                "type": "NODE_PROGRESS",
                "message": f"Ingested LAS 2.0 well '{parsed['well'] or '(unnamed)'}' curves={[c['mnemonic'] for c in parsed['curves']]}. Measured depth is not TVD.",
            }
        )
    work = pd.concat(frames, ignore_index=True)
    path = os.path.join(out, "borehole_canonical.csv")
    work.to_csv(path, index=False)
    qc = {"files": qc_files, "n_rows": int(len(work)), "depth_reference": "measured depth", "trajectory_computed": False}
    qc_path = write_json(os.path.join(out, "borehole_ingest_qc.json"), qc)
    write_lineage(out, node_id, "CWLS LAS 2.0 WRAP.NO ingest", {"n": len(work)}, sources, [path, qc_path])
    return {
        "artifacts": [
            make_artifact("artifact-borehole-canonical", "processed_dataset", "csv", path, node_id),
            make_artifact("artifact-borehole-ingest-qc", "qc_report", "json", qc_path, node_id),
        ],
        "events": events,
    }


def borehole_view(payload: dict) -> dict:
    node_id = "borehole_view"
    out = _out(payload)
    src = _find(out, "borehole_canonical.csv")
    qc_path = os.path.join(out, "borehole_ingest_qc.json")
    df = pd.read_csv(src)
    with open(qc_path, encoding="utf-8") as handle:
        ingest = json.load(handle)
    file_qc = (ingest.get("files") or [{}])[0]
    depth_index = file_qc.get("depth_index") or (df.columns[0] if len(df.columns) else "DEPT")
    if depth_index not in df.columns:
        depth_index = df.columns[0]
    params = _params(payload)
    requested = params.get("selectedCurves") or params.get("selected_curves") or []
    if isinstance(requested, str):
        requested = [part.strip() for part in requested.split(",") if part.strip()]
    curve_meta = file_qc.get("curves") or []
    by_name = {str(item.get("mnemonic")): item for item in curve_meta if isinstance(item, dict)}
    skip = {depth_index, "well_id", "depth_reference", "source_catalog_id", "source_checksum"}
    available = [name for name in df.columns if name not in skip]
    if requested:
        selected = [name for name in requested if name in available]
        if not selected:
            selected = available
    else:
        selected = available
    tracks = []
    for name in selected:
        meta = by_name.get(name) or {"mnemonic": name, "unit": "", "description": "", "semantics": "unknown"}
        samples = []
        null_gaps = 0
        for depth, value in zip(df[depth_index].tolist(), df[name].tolist()):
            if value is None or (isinstance(value, float) and not np.isfinite(value)) or (isinstance(value, str) and value.strip() == ""):
                samples.append({"depth": float(depth) if np.isfinite(depth) else None, "value": None})
                null_gaps += 1
            else:
                try:
                    samples.append({"depth": float(depth), "value": float(value)})
                except (TypeError, ValueError):
                    samples.append({"depth": float(depth) if np.isfinite(depth) else None, "value": None})
                    null_gaps += 1
        tracks.append(
            {
                "mnemonic": name,
                "units": meta.get("unit") or "",
                "description": meta.get("description") or "",
                "semantics": "unknown",
                "null_gaps": null_gaps,
                "samples": samples,
            }
        )
    payload_json = {
        "kind": "borehole-log",
        "product_name": "G-AID LAS 2.0 measured-depth log",
        "depth_reference": "measured depth",
        "depth_index": depth_index,
        "depth_units": file_qc.get("depth_units") or "",
        "null_value": file_qc.get("null_value"),
        "well_id": file_qc.get("well_id") or "",
        "las_version": file_qc.get("las_version"),
        "wrap": file_qc.get("wrap"),
        "selected_curves": selected,
        "tracks": tracks,
        "trajectory_computed": False,
        "catalog_id": file_qc.get("catalog_id"),
        "checksum": file_qc.get("checksum"),
        "header_provenance": file_qc.get("header_provenance") or {},
        "warnings": [
            "Measured depth is not true vertical depth or a spatial trajectory.",
            "Curve mnemonics have unknown semantics unless the user supplied meaning.",
            *(file_qc.get("warnings") or []),
        ],
    }
    path = write_json(os.path.join(out, "borehole_tracks.json"), payload_json)
    meta_path = write_json(
        os.path.join(out, "borehole_tracks.meta.json"),
        {
            "kind": "borehole-log",
            "vertical_axis": "measured depth",
            "depth_reference": "measured depth",
            "trajectory_computed": False,
        },
    )
    write_lineage(out, node_id, "Borehole multi-track viewer metadata", {"selected": selected}, [src], [path, meta_path])
    return {
        "artifacts": [
            make_artifact("artifact-borehole-tracks", "section", "json", path, node_id, [src]),
            make_artifact("artifact-borehole-tracks-meta", "qc_report", "json", meta_path, node_id, [src]),
        ],
        "events": [{"type": "NODE_PROGRESS", "message": f"Wrote borehole tracks for {selected} as measured depth (not TVD)."}],
    }


def borehole_map_collar(payload: dict) -> dict:
    from science.gis import write_geojson_points

    node_id = "borehole_map_collar"
    out = _out(payload)
    qc_path = os.path.join(out, "borehole_ingest_qc.json")
    if not os.path.isfile(qc_path):
        raise FileNotFoundError("borehole_map_collar needs borehole_ingest_qc.json from las_ingest.")
    with open(qc_path, encoding="utf-8") as handle:
        ingest = json.load(handle)
    file_qc = (ingest.get("files") or [{}])[0]
    params = _params(payload)
    confirmed = _truthy(params.get("collarCrsConfirmed") or params.get("collar_crs_confirmed"))
    x = file_qc.get("collar_x")
    y = file_qc.get("collar_y")
    epsg = file_qc.get("crs_epsg")
    kind = file_qc.get("coordinate_kind") or "unknown"
    if epsg in (None, "", 0) and confirmed and kind == "geographic":
        epsg = 4326
        quality = "user-confirmed"
    elif epsg not in (None, "", 0) and x is not None and y is not None:
        quality = "documented"
    else:
        quality = "missing"
    has_xy = x is not None and y is not None
    if not has_xy or not epsg:
        reason = (
            "Collar mapping needs coordinates and a documented CRS (or an explicit user-confirmed CRS). "
            "A vertical log is still viewable. No map position was invented."
        )
        skip_qc = write_json(
            os.path.join(out, "borehole_collar_qc.json"),
            {
                "skipped": True,
                "reason": "borehole_crs_required" if has_xy else "borehole_collar_xy_required",
                "coordinate_kind": kind,
                "location_quality": quality,
                "collar_mapped": False,
                "trajectory_computed": False,
                "message": reason,
            },
        )
        write_lineage(out, node_id, "Collar mapping skipped", {"skipped": True}, [qc_path], [skip_qc])
        result = skipped(node_id, reason)
        result["artifacts"] = [make_artifact("artifact-borehole-collar-qc", "qc_report", "json", skip_qc, node_id)]
        return result

    props = [
        {
            "well_id": file_qc.get("well_id") or "",
            "depth_reference": "measured depth",
            "coordinate_kind": kind,
            "location_quality": quality,
            "elevation": file_qc.get("collar_z"),
            "elevation_mnemonic": file_qc.get("collar_z_mnemonic"),
            "elevation_datum": file_qc.get("elevation_datum"),
            "crs_epsg": int(epsg),
            "trajectory_computed": False,
        }
    ]
    geo_path = os.path.join(out, "borehole_collar.geojson")
    write_geojson_points([float(x)], [float(y)], props, geo_path, crs_epsg=int(epsg))
    meta_path = write_json(
        os.path.join(out, "borehole_collar.meta.json"),
        {
            "kind": "borehole-collar",
            "crs_epsg": int(epsg),
            "coordinate_kind": kind,
            "location_quality": quality,
            "collar_mapped": True,
            "trajectory_computed": False,
            "note": "Point is a collar, not a well path. Elevation is a datum reference, not a 3-D trajectory.",
        },
    )
    qc = {
        "skipped": False,
        "collar_mapped": True,
        "crs_epsg": int(epsg),
        "coordinate_kind": kind,
        "location_quality": quality,
        "x": float(x),
        "y": float(y),
        "z": file_qc.get("collar_z"),
        "trajectory_computed": False,
    }
    qc_out = write_json(os.path.join(out, "borehole_collar_qc.json"), qc)
    write_lineage(out, node_id, "Collar GeoJSON from documented or user-confirmed CRS", qc, [qc_path], [geo_path, meta_path, qc_out])
    return {
        "artifacts": [
            make_artifact("artifact-borehole-collar", "vector", "geojson", geo_path, node_id, [qc_path], qc),
            make_artifact("artifact-borehole-collar-qc", "qc_report", "json", qc_out, node_id),
        ],
        "events": [
            {
                "type": "NODE_PROGRESS",
                "message": f"Wrote borehole collar GeoJSON (EPSG:{int(epsg)}, {kind}, {quality}). Not a well path.",
            }
        ],
    }


def borehole_interpret(payload: dict) -> dict:
    node_id = "borehole_interpret"
    out = _out(payload)
    qcs = {}
    for name in ("borehole_ingest_qc.json", "borehole_tracks.meta.json", "borehole_collar_qc.json"):
        path = os.path.join(out, name)
        if os.path.isfile(path):
            with open(path, encoding="utf-8") as handle:
                qcs[name] = json.load(handle)
    ingest = (qcs.get("borehole_ingest_qc.json") or {}).get("files") or [{}]
    file_qc = ingest[0] if ingest else {}
    collar = qcs.get("borehole_collar_qc.json") or {}
    curves = file_qc.get("curves") or []
    observed = [
        f"{item.get('mnemonic')} [{item.get('unit') or 'unit missing'}] (semantics unknown)"
        for item in curves
        if isinstance(item, dict)
    ]
    params = _params(payload)
    user_meaning = params.get("curveMeanings") or params.get("curve_meanings") or {}
    if isinstance(user_meaning, str):
        user_meaning = {}
    user_lines = [f"User-supplied meaning for {k}: {v}" for k, v in user_meaning.items()]
    report = {
        "product_name": "G-AID LAS 2.0 measured-depth log",
        "observations": [
            "LAS 2.0 WRAP.NO curves were ingested as measured-depth samples.",
            f"Well identifier: {file_qc.get('well_id') or '(not documented)'}.",
            f"Observed curves: {', '.join(observed) or '(none)'}.",
            f"Collar mapped: {bool(collar.get('collar_mapped'))}.",
            f"Depth reference recorded as {file_qc.get('depth_reference') or 'measured depth'}.",
        ],
        "user_supplied_curve_meaning": user_lines or ["No user-supplied curve meanings were provided."],
        "assumptions": [
            "NULL substitution uses the documented ~Well NULL, or the conventional -999.25 when NULL was missing (flagged assumed).",
            "WRAP.NO one-line-per-depth ASCII was required.",
            "A mapped collar uses only documented or explicitly user-confirmed CRS. Geographic vs easting-northing is distinguished in QC.",
        ],
        "uncertainty": [
            "Measured depth is not true vertical depth.",
            "A collar point is not a well trajectory.",
            "Unknown curve semantics remain unknown even when the mnemonic is familiar (GR, RHOB, NPHI, resistivity, sonic).",
            "Overlapping map layers at a collar are geometric coincidence, not a joint geological proof.",
        ],
        "recommendations": [
            "Do not classify lithology, pick aquifers, or claim mineralisation from these curves without a declared validated capability and independent evidence.",
            "Supply a documented CRS before mapping a collar.",
            "Keep deviation surveys out of this pack until a tested survey contract exists.",
        ],
        "not_established": [
            "Lithology is not established.",
            "Aquifer identification is not established.",
            "Mineralisation is not established.",
            "Water, ore, or reservoir is not established.",
            "Well-to-well correlation is not established.",
            "Resource estimation is not established.",
            "Drill targeting is not established.",
            "True vertical depth is not established.",
            "A 3-D well trajectory is not established.",
        ],
        "geological_certainty_improved": False,
        "qc": qcs,
        "interpretation_limit": "Observed curves are measurements at measured depth. Overlay and mnemonic names do not prove geology.",
    }
    path = write_json(os.path.join(out, "borehole_interpretation.json"), report)
    return {
        "artifacts": [make_artifact("artifact-borehole-interpret", "report", "json", path, node_id)],
        "events": [{"type": "NODE_PROGRESS", "message": "Wrote evidence-bound borehole interpretation limits."}],
    }
