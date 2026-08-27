"""Documented GeoJSON vector kernels on the generic DAG.

There is no GisPipeline / VectorPipeline execution route.
Buffer, clip, dissolve, reprojection, and attribute editing are not implemented.
"""

from __future__ import annotations

import csv
import json
import os

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


def _bound_geojson(params: dict) -> list[dict]:
    items = params.get("catalogInputs") or params.get("catalog_inputs") or []
    if not isinstance(items, list) or not items:
        raise ValueError("vector_ingest requires parameters.catalogInputs from the frozen plan.")
    out = []
    for item in items:
        if not isinstance(item, dict):
            continue
        adapter = str(item.get("adapterId") or item.get("kind") or "").lower()
        fmt = str(item.get("formatId") or "").lower()
        if adapter == "geojson" or fmt == "geojson":
            out.append(item)
    if not out:
        raise ValueError("No bound geojson catalog records. I will not search by extension or decode shapefile/GPKG.")
    return out


def _abs(params: dict, item: dict) -> str:
    rel = str(item.get("path") or "")
    filepath = item.get("absPath") or item.get("abs_path") or rel
    if filepath and not os.path.isabs(str(filepath)):
        filepath = os.path.abspath(os.path.join(str(params.get("baseDir") or ""), str(filepath)))
    return str(filepath)


def _role(item: dict) -> tuple[str, bool]:
    mapping = item.get("vectorRole") or item.get("vector_role") or {}
    if isinstance(mapping, dict) and mapping.get("reviewed"):
        return str(mapping.get("role") or "generic-vector"), True
    return "generic-vector", False


def vector_ingest(payload: dict) -> dict:
    from formats.geojson import parse_geojson

    node_id = "vector_ingest"
    out = _out(payload)
    params = _params(payload)
    layers = []
    sources = []
    events = []
    for item in _bound_geojson(params):
        filepath = _abs(params, item)
        role, reviewed = _role(item)
        parsed = parse_geojson(filepath, role=role, role_reviewed=reviewed)
        parsed["catalog_id"] = item.get("catalogId") or item.get("catalog_id")
        parsed["checksum"] = item.get("checksum")
        parsed["source_path"] = item.get("path") or filepath
        layers.append(parsed)
        sources.append(str(item.get("path") or filepath))
        events.append(
            {
                "type": "NODE_PROGRESS",
                "message": (
                    f"Ingested GeoJSON '{os.path.basename(filepath)}' "
                    f"features={parsed['feature_count']} CRS={parsed['crs']} role={parsed['role']} "
                    f"(reviewed={reviewed}). Role is not geology proof."
                ),
            }
        )
    qc = {
        "product_name": "G-AID documented GeoJSON vector layer",
        "format": "geojson",
        "layers": [
            {
                "source_path": layer["source_path"],
                "catalog_id": layer.get("catalog_id"),
                "checksum": layer.get("checksum"),
                "crs": layer["crs"],
                "crs_epsg": layer["crs_epsg"],
                "crs_source": layer["crs_source"],
                "geojson_contract": layer.get("geojson_contract"),
                "axis_order": layer.get("axis_order"),
                "coordinate_order": layer.get("coordinate_order"),
                "geometry_types": layer["geometry_types"],
                "attribute_names": layer["attribute_names"],
                "feature_count": layer["feature_count"],
                "bbox": layer["bbox"],
                "role": layer["role"],
                "role_reviewed": layer["role_reviewed"],
                "warnings": layer["warnings"],
            }
            for layer in layers
        ],
        "n_layers": len(layers),
        "reprojected": False,
        "geoprocessing": False,
    }
    canonical = os.path.join(out, "vector_canonical.json")
    write_json(canonical, {"kind": "gis-vector", "layers": layers})
    qc_path = write_json(os.path.join(out, "vector_ingest_qc.json"), qc)
    write_lineage(out, node_id, "Documented GeoJSON ingest", {"n": len(layers)}, sources, [canonical, qc_path])
    return {
        "artifacts": [
            make_artifact("artifact-vector-canonical", "processed_dataset", "json", canonical, node_id),
            make_artifact("artifact-vector-ingest-qc", "qc_report", "json", qc_path, node_id),
        ],
        "events": events,
    }


def vector_view(payload: dict) -> dict:
    node_id = "vector_view"
    out = _out(payload)
    src = _find(out, "vector_canonical.json")
    with open(src, encoding="utf-8") as handle:
        canonical = json.load(handle)
    tracks = {
        "kind": "gis-vector",
        "product_name": "G-AID documented GeoJSON vector layer",
        "layers": [],
        "warnings": [
            "This layer is source geometry and attributes. It is not an AI-confirmed geological interpretation.",
            "Attribute names have unknown semantics unless the user supplied meaning.",
        ],
    }
    for layer in canonical.get("layers") or []:
        tracks["layers"].append(
            {
                "source_path": layer.get("source_path"),
                "catalog_id": layer.get("catalog_id"),
                "crs": layer.get("crs"),
                "crs_source": layer.get("crs_source"),
                "geojson_contract": layer.get("geojson_contract"),
                "axis_order": layer.get("axis_order"),
                "coordinate_order": layer.get("coordinate_order"),
                "role": layer.get("role"),
                "role_reviewed": layer.get("role_reviewed"),
                "geometry_types": layer.get("geometry_types"),
                "attribute_names": layer.get("attribute_names"),
                "feature_count": layer.get("feature_count"),
                "bbox": layer.get("bbox"),
                "features": layer.get("features"),
                "origin": "source",
            }
        )
    path = write_json(os.path.join(out, "vector_tracks.json"), tracks)
    meta = write_json(
        os.path.join(out, "vector_tracks.meta.json"),
        {
            "kind": "gis-vector",
            "crs_required_for_overlay": True,
            "silent_reprojection": False,
            "role_inferred_from_filename": False,
        },
    )
    write_lineage(out, node_id, "Vector viewer metadata", {"n": len(tracks["layers"])}, [src], [path, meta])
    return {
        "artifacts": [
            make_artifact("artifact-vector-tracks", "vector", "json", path, node_id),
            make_artifact("artifact-vector-tracks-meta", "qc_report", "json", meta, node_id),
        ],
        "events": [{"type": "NODE_PROGRESS", "message": "Wrote vector viewer metadata. Overlay is not geological proof."}],
    }


def _bbox_overlap(a: dict, b: dict) -> bool:
    return a["minX"] <= b["maxX"] and a["maxX"] >= b["minX"] and a["minY"] <= b["maxY"] and a["maxY"] >= b["minY"]


def _point_in_ring(x: float, y: float, ring: list[dict]) -> bool:
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = float(ring[i]["x"]), float(ring[i]["y"])
        xj, yj = float(ring[j]["x"]), float(ring[j]["y"])
        intersect = ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi)
        if intersect:
            inside = not inside
        j = i
    return inside


def _feature_pts(feature: dict) -> list[dict]:
    return [p for p in (feature.get("coordinates") or []) if isinstance(p, dict)]


def _relation(left: dict, right: dict) -> str:
    lt = str(left.get("geometry_type") or "")
    rt = str(right.get("geometry_type") or "")
    lp, rp = _feature_pts(left), _feature_pts(right)
    if "Polygon" in lt and rp:
        if all(_point_in_ring(p["x"], p["y"], lp) for p in rp if "x" in p):
            return "contains"
    if "Polygon" in rt and lp:
        if all(_point_in_ring(p["x"], p["y"], rp) for p in lp if "x" in p):
            return "within"
    if "Polygon" in lt and lp and rp:
        if any(_point_in_ring(p["x"], p["y"], lp) for p in rp if "x" in p):
            return "intersects"
    if "Polygon" in rt and lp and rp:
        if any(_point_in_ring(p["x"], p["y"], rp) for p in lp if "x" in p):
            return "intersects"
    return "bbox-overlap"


def _lonlat_storage(layer: dict) -> bool:
    return str(layer.get("coordinate_order") or "") == "lon-lat"


def _crs_pair(left: dict, right: dict) -> dict:
    a = str(left.get("crs") or "")
    b = str(right.get("crs") or "")
    if a == b:
        return {"allowed": True, "code": "same-crs", "crs": a, "decision": None, "reason": f"Both layers use {a}."}
    keys = {a, b}
    if keys == {"OGC:CRS84", "EPSG:4326"}:
        if _lonlat_storage(left) and _lonlat_storage(right):
            return {
                "allowed": True,
                "code": "crs84-epsg4326-geojson-lonlat",
                "crs": "OGC:CRS84+EPSG:4326",
                "decision": "geojson-lonlat-no-axis-swap",
                "reason": (
                    "OGC:CRS84 and EPSG:4326 are different CRS identities. "
                    "Documented compatibility uses stored GeoJSON [lon, lat] without an axis swap or reprojection."
                ),
            }
        return {
            "allowed": False,
            "code": "crs84-epsg4326-axis-order",
            "reason": "OGC:CRS84 vs EPSG:4326 axis order is not compatible without GeoJSON [lon, lat] storage on both layers.",
        }
    return {
        "allowed": False,
        "code": "conflicting-crs",
        "reason": f"Conflicting CRS {a} vs {b}. Reprojection is not a registered capability.",
    }


def vector_overlap(payload: dict) -> dict:
    node_id = "vector_overlap"
    out = _out(payload)
    src = _find(out, "vector_canonical.json")
    with open(src, encoding="utf-8") as handle:
        canonical = json.load(handle)
    layers = canonical.get("layers") or []
    missing_crs = [
        layer
        for layer in layers
        if not str(layer.get("crs") or "").strip()
        or str(layer.get("crs")).strip().lower() in {"unknown", "epsg:0", "crs unknown"}
    ]
    if len(layers) < 2:
        qc = {
            "skipped": True,
            "reason": "gis_overlap_needs_two_layers",
            "message": "Spatial overlap needs at least two documented same-CRS vector layers. I will not invent a second layer.",
            "geological_certainty_improved": False,
            "reprojected": False,
        }
        qc_path = write_json(os.path.join(out, "vector_overlap_qc.json"), qc)
        write_lineage(out, node_id, "Vector overlap skipped", qc, [src], [qc_path])
        return {
            "artifacts": [make_artifact("artifact-vector-overlap-qc", "qc_report", "json", qc_path, node_id)],
            "events": [{"type": "NODE_PROGRESS", "message": f"vector_overlap skipped: {qc['reason']}"}],
        }
    if missing_crs:
        qc = {
            "skipped": True,
            "reason": "gis_crs_required",
            "message": (
                "Spatial overlap needs a documented CRS on every layer "
                "(OGC:CRS84, a validated legacy mapping, or a G-AID custom import EPSG). "
                "I will not silently reproject or swap axes."
            ),
            "geological_certainty_improved": False,
            "reprojected": False,
            "missing_crs": [layer.get("source_path") for layer in missing_crs],
        }
        qc_path = write_json(os.path.join(out, "vector_overlap_qc.json"), qc)
        write_lineage(out, node_id, "Vector overlap skipped", qc, [src], [qc_path])
        return {
            "artifacts": [make_artifact("artifact-vector-overlap-qc", "qc_report", "json", qc_path, node_id)],
            "events": [{"type": "NODE_PROGRESS", "message": f"vector_overlap skipped: {qc['reason']}"}],
        }

    rows = []
    blocked = []
    decisions = []
    for i, left in enumerate(layers):
        for right in layers[i + 1 :]:
            pair = _crs_pair(left, right)
            decisions.append(
                {
                    "left": left.get("source_path"),
                    "right": right.get("source_path"),
                    "code": pair["code"],
                    "compatibility_decision": pair.get("decision"),
                    "left_crs": left.get("crs"),
                    "right_crs": right.get("crs"),
                    "left_axis_order": left.get("axis_order"),
                    "right_axis_order": right.get("axis_order"),
                    "left_coordinate_order": left.get("coordinate_order"),
                    "right_coordinate_order": right.get("coordinate_order"),
                }
            )
            if not pair["allowed"]:
                blocked.append(
                    {
                        "left": left.get("source_path"),
                        "right": right.get("source_path"),
                        "reason": pair["reason"],
                    }
                )
                continue
            if not _bbox_overlap(left.get("bbox") or {}, right.get("bbox") or {}):
                continue
            for lf in left.get("features") or []:
                for rf in right.get("features") or []:
                    relation = _relation(lf, rf)
                    rows.append(
                        {
                            "left_path": left.get("source_path"),
                            "right_path": right.get("source_path"),
                            "left_id": lf.get("id"),
                            "right_id": rf.get("id"),
                            "left_role": left.get("role"),
                            "right_role": right.get("role"),
                            "crs": pair.get("crs") or left.get("crs"),
                            "compatibility_decision": pair.get("decision") or "",
                            "relation": relation,
                            "reason": (
                                f"Geometric {relation}. {pair['reason']} "
                                "Spatial overlap does not establish geological, mineral, or causal relationships."
                            ),
                        }
                    )

    table_path = os.path.join(out, "vector_overlap.csv")
    fieldnames = [
        "left_path",
        "right_path",
        "left_id",
        "right_id",
        "left_role",
        "right_role",
        "crs",
        "compatibility_decision",
        "relation",
        "reason",
    ]
    with open(table_path, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
    json_path = write_json(
        os.path.join(out, "vector_overlap.json"),
        {"kind": "gis-overlap", "rows": rows, "blocked": blocked, "crs_decisions": decisions, "reprojected": False, "axis_swap": False},
    )
    qc = {
        "skipped": False,
        "n_rows": len(rows),
        "blocked": blocked,
        "crs_decisions": decisions,
        "reprojected": False,
        "axis_swap": False,
        "geological_certainty_improved": False,
        "interpretation_limit": "Overlap is a geometric table, not a prospectivity map.",
    }
    qc_path = write_json(os.path.join(out, "vector_overlap_qc.json"), qc)
    write_lineage(out, node_id, "Same-CRS geometric overlap", {"n": len(rows)}, [src], [table_path, json_path, qc_path])
    return {
        "artifacts": [
            make_artifact("artifact-vector-overlap-csv", "table", "csv", table_path, node_id),
            make_artifact("artifact-vector-overlap-json", "table", "json", json_path, node_id),
            make_artifact("artifact-vector-overlap-qc", "qc_report", "json", qc_path, node_id),
        ],
        "events": [
            {
                "type": "NODE_PROGRESS",
                "message": f"Wrote {len(rows)} geometric overlap row(s). Overlap is not a mineral target.",
            }
        ],
    }


def vector_export(payload: dict) -> dict:
    node_id = "vector_export"
    out = _out(payload)
    src = _find(out, "vector_canonical.json")
    with open(src, encoding="utf-8") as handle:
        canonical = json.load(handle)
    exported = []
    for index, layer in enumerate(canonical.get("layers") or []):
        epsg = layer.get("crs_epsg")
        crs_key = layer.get("crs") or (f"EPSG:{epsg}" if epsg else "")
        fc: dict = {"type": "FeatureCollection", "features": []}
        if crs_key == "OGC:CRS84":
            # RFC 7946 export: no legacy crs member.
            pass
        elif epsg:
            fc["crs"] = {"type": "name", "properties": {"name": f"EPSG:{epsg}"}}
        for feature in layer.get("features") or []:
            coords = feature.get("coordinates") or []
            gtype = feature.get("geometry_type") or "Point"
            if gtype == "Point" and coords:
                geometry = {"type": "Point", "coordinates": [coords[0]["x"], coords[0]["y"]]}
            elif "Line" in gtype:
                geometry = {"type": "LineString", "coordinates": [[p["x"], p["y"]] for p in coords]}
            else:
                geometry = {"type": "Polygon", "coordinates": [[[p["x"], p["y"]] for p in coords]]}
            props = dict(feature.get("properties") or {})
            props["_g_aid_semantics"] = "unknown"
            props["_g_aid_crs"] = crs_key
            props["_g_aid_geojson_contract"] = layer.get("geojson_contract")
            props["_g_aid_axis_order"] = layer.get("axis_order")
            props["_g_aid_coordinate_order"] = layer.get("coordinate_order")
            props["_g_aid_role"] = layer.get("role")
            props["_g_aid_role_reviewed"] = layer.get("role_reviewed")
            fc["features"].append({"type": "Feature", "id": feature.get("id"), "properties": props, "geometry": geometry})
        name = f"vector_export_{index + 1}.geojson"
        path = os.path.join(out, name)
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(fc, handle, indent=2)
        exported.append(path)
    meta = write_json(
        os.path.join(out, "vector_export.meta.json"),
        {
            "format": "geojson",
            "rfc7946_crs84": True,
            "shapefile": False,
            "geopackage": False,
            "reprojected": False,
            "attribute_editing": False,
            "files": [os.path.basename(path) for path in exported],
        },
    )
    write_lineage(out, node_id, "GeoJSON export of ingested vectors", {"n": len(exported)}, [src], exported + [meta])
    artifacts = [make_artifact(f"artifact-vector-export-{i}", "vector", "geojson", path, node_id) for i, path in enumerate(exported)]
    artifacts.append(make_artifact("artifact-vector-export-meta", "qc_report", "json", meta, node_id))
    return {
        "artifacts": artifacts,
        "events": [{"type": "NODE_PROGRESS", "message": f"Exported {len(exported)} GeoJSON layer(s). Shapefile/GPKG export is not implemented."}],
    }


def vector_interpret(payload: dict) -> dict:
    node_id = "vector_interpret"
    out = _out(payload)
    src = _find(out, "vector_canonical.json")
    with open(src, encoding="utf-8") as handle:
        canonical = json.load(handle)
    overlap_qc = {}
    overlap_path = os.path.join(out, "vector_overlap_qc.json")
    if os.path.isfile(overlap_path):
        with open(overlap_path, encoding="utf-8") as handle:
            overlap_qc = json.load(handle)
    layers = canonical.get("layers") or []
    observations = [
        f"{len(layers)} documented GeoJSON layer(s) were ingested as source geometry.",
        "Observed geometry types: "
        + ", ".join(sorted({g for layer in layers for g in (layer.get("geometry_types") or [])}))
        + ".",
    ]
    for layer in layers:
        observations.append(
            f"{layer.get('source_path')}: {layer.get('feature_count')} feature(s), CRS {layer.get('crs')}, "
            f"contract={layer.get('geojson_contract')}, axis_order={layer.get('axis_order')}, "
            f"role={layer.get('role')} (reviewed={layer.get('role_reviewed')})."
        )
    report = {
        "product_name": "G-AID documented GeoJSON vector layer",
        "observations": observations,
        "user_supplied_curve_meaning": [
            "No attribute meanings were supplied. Field names remain unknown semantics.",
        ],
        "assumptions": [
            "RFC 7946 GeoJSON with no crs member is documented OGC:CRS84 (lon, lat degrees). It is not EPSG:4326.",
            "A legacy GeoJSON crs member is not the RFC 7946 CRS mechanism.",
            "Companion .prj or / EPSG= annotations are a G-AID custom import contract, not standard RFC 7946.",
            "OGC:CRS84 vs EPSG:4326 overlay, when allowed, uses stored GeoJSON [lon, lat] without an axis swap.",
            "User-assigned roles are catalog labels, not geological confirmation.",
        ],
        "uncertainty": [
            "Spatial overlap is geometric coincidence.",
            "A fault line, geology polygon, tenure boundary, occurrence, alteration label, or sample point remains source information.",
        ],
        "recommendations": [
            "Do not generate mineral targets, prospectivity maps, resource/reserve claims, or drill recommendations from overlays.",
            "Assign layer roles explicitly. Do not infer geology from filenames.",
            "Keep shapefile and GeoPackage out of processing until a tested parser exists.",
        ],
        "not_established": [
            "Geological interpretation is not established.",
            "Mineral targeting is not established.",
            "Prospectivity is not established.",
            "Resource or reserve estimates are not established.",
            "Drill recommendations are not established.",
            "Causal relationships from overlay are not established.",
            "Shapefile or GeoPackage ingest is not established.",
        ],
        "geological_certainty_improved": False,
        "qc": {
            "vector_ingest_qc.json": True,
            "vector_overlap_qc.json": overlap_qc,
        },
        "interpretation_limit": "Observed vectors are source layers. Overlay and mnemonic-like field names do not prove geology.",
    }
    path = write_json(os.path.join(out, "vector_interpretation.json"), report)
    write_lineage(out, node_id, "Vector interpretation limits", {"n": len(layers)}, [src], [path])
    return {
        "artifacts": [make_artifact("artifact-vector-interpretation", "report", "json", path, node_id)],
        "events": [{"type": "NODE_PROGRESS", "message": "Wrote vector interpretation limits. Geological certainty is not improved."}],
    }
