"""ERT kernels on the generic DAG. Arbitrary .dat files are refused."""

from __future__ import annotations

import json
import os

import numpy as np
import pandas as pd

from science.artifacts import make_artifact, task_dir, write_json, write_lineage


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


def _bound_ert(params: dict) -> list[dict]:
    items = params.get("catalogInputs") or params.get("catalog_inputs") or []
    if not isinstance(items, list) or not items:
        raise ValueError("ert_ingest requires parameters.catalogInputs from the frozen plan.")
    out = []
    for item in items:
        if not isinstance(item, dict):
            continue
        adapter = str(item.get("adapterId") or item.get("kind") or "").lower()
        if adapter in {"ert-dat", "ert-csv"}:
            out.append(item)
    if not out:
        raise ValueError("No bound ert-dat or ert-csv catalog records. I will not search by extension.")
    return out


def ert_ingest(payload: dict) -> dict:
    from formats.ert import parse_ert_dat

    node_id = "ert_ingest"
    out = _out(payload)
    params = _params(payload)
    frames = []
    qc_files = []
    events = []
    for item in _bound_ert(params):
        rel = str(item.get("path") or "")
        filepath = item.get("absPath") or item.get("abs_path") or rel
        if filepath and not os.path.isabs(str(filepath)):
            filepath = os.path.abspath(os.path.join(str(params.get("baseDir") or ""), str(filepath)))
        adapter = str(item.get("adapterId") or "").lower()
        if adapter == "ert-csv":
            df = pd.read_csv(filepath)
            required = {"midpoint_x", "a", "n", "rhoa"}
            missing = required - set(df.columns)
            if missing:
                raise ValueError(f"ERT CSV missing columns {sorted(missing)}. Mapping must be reviewed.")
            parsed = {
                "title": os.path.basename(str(filepath)),
                "array": str(df["array"].iloc[0]) if "array" in df.columns else "",
                "array_code": None,
                "spacing": float(df["a"].median()) if len(df) else None,
                "units": "ohm.m",
                "epsg": int(df["crs_epsg"].iloc[0]) if "crs_epsg" in df.columns else None,
                "measurements": df.to_dict(orient="records"),
                "topography_flag": 0,
                "topography": [],
                "n": int(len(df)),
                "duplicates": 0,
            }
            if not parsed["array"]:
                raise ValueError("ERT CSV requires an array column. I will not default the array type.")
        else:
            parsed = parse_ert_dat(str(filepath))
            df = pd.DataFrame(parsed["measurements"])
        df["catalog_id"] = item.get("catalogId") or item.get("catalog_id")
        df["units"] = "ohm.m"
        if parsed.get("epsg"):
            df["crs_epsg"] = parsed["epsg"]
        frames.append(df)
        qc_files.append(
            {
                "path": rel or str(filepath),
                "catalogId": df["catalog_id"].iloc[0],
                "n": parsed["n"],
                "array": parsed["array"],
                "array_code": parsed.get("array_code"),
                "spacing_m": parsed.get("spacing"),
                "units": "ohm.m",
                "epsg": parsed.get("epsg"),
                "topography_flag": parsed.get("topography_flag"),
                "topography_n": len(parsed.get("topography") or []),
                "duplicates": parsed.get("duplicates") or 0,
                "topography_used_in_forward": False,
            }
        )
        events.append({"type": "NODE_PROGRESS", "message": f"Read {os.path.basename(str(filepath))} ({parsed['n']} ERT measurements, array={parsed['array']})."})
        if parsed.get("topography"):
            pd.DataFrame(parsed["topography"]).to_csv(os.path.join(out, "ert_topography.csv"), index=False)
    combined = pd.concat(frames, ignore_index=True)
    if (combined["rhoa"] <= 0).any():
        raise ValueError("Apparent resistivity must be > 0.")
    path = os.path.join(out, "ert_canonical.csv")
    combined.to_csv(path, index=False)
    qc_path = write_json(
        os.path.join(out, "ert_ingest_qc.json"),
        {
            "files": qc_files,
            "n": int(len(combined)),
            "array": combined["array"].iloc[0] if "array" in combined.columns else None,
            "units": "ohm.m",
            "assumptions": "None. Array, spacing, and units came from the G-AID ERT 1.0 contract.",
            "topography_used_in_forward": False,
        },
    )
    write_lineage(out, node_id, "G-AID ERT 1.0 ingest", {"files": qc_files}, [f["path"] for f in qc_files], [path, qc_path])
    return {
        "artifacts": [
            make_artifact("artifact-ert-canonical", "raw_dataset", "csv", path, node_id),
            make_artifact("artifact-ert-ingest-qc", "qc_report", "json", qc_path, node_id),
        ],
        "events": events,
    }


def ert_pseudosection(payload: dict) -> dict:
    from science.ert import pseudosection_xyz

    node_id = "ert_pseudosection"
    out = _out(payload)
    src = _find(out, "ert_canonical.csv")
    df = pd.read_csv(src)
    meas = df.to_dict(orient="records")
    x, z, rho = pseudosection_xyz(meas)
    work = pd.DataFrame(
        {
            "x": x,
            "z": z,
            "z_reference": "pseudo-depth n*a/2 — plotting convention not inversion depth",
            "rhoa_ohm_m": rho,
            "a": [m["a"] for m in meas],
            "n": [m["n"] for m in meas],
            "array": [m.get("array", "") for m in meas],
        }
    )
    path = os.path.join(out, "ert_pseudosection.csv")
    work.to_csv(path, index=False)
    survey = {
        "n": int(len(work)),
        "array": work["array"].iloc[0] if len(work) else None,
        "units": "ohm.m",
        "interpolation": "none — discrete measurements at conventional pseudo-depth",
        "model_status": "not a depth model",
        "formula": "pseudo-depth = n·a/2 (dipole-dipole plotting convention)",
        "limitations": [
            "Pseudosection ≠ depth model.",
            "Apparent resistivity ≠ true resistivity.",
        ],
    }
    survey_path = write_json(os.path.join(out, "ert_survey.json"), survey)
    write_lineage(out, node_id, survey["formula"], survey, [src], [path, survey_path])
    return {
        "artifacts": [
            make_artifact("artifact-ert-pseudo", "section", "csv", path, node_id, [src], survey),
            make_artifact("artifact-ert-survey", "qc_report", "json", survey_path, node_id, [src]),
        ],
        "events": [{"type": "NODE_PROGRESS", "message": f"Pseudosection {len(work)} points. Pseudo-depth is not a depth model."}],
    }


def ert_invert(payload: dict) -> dict:
    from science.ert import invert_2d_smooth

    node_id = "ert_invert"
    out = _out(payload)
    params = _params(payload)
    src = _find(out, "ert_canonical.csv")
    df = pd.read_csv(src)
    if len(df) < 8:
        raise ValueError("2-D inversion needs at least 8 measurements.")
    meas = [{"midpoint_x": float(r.midpoint_x), "a": float(r.a), "n": float(r.n), "rhoa": float(r.rhoa)} for r in df.itertuples()]
    result = invert_2d_smooth(
        meas,
        max_iter=int(params.get("maxIterations") or params.get("max_iterations") or 8),
        lam=float(params.get("dampingFactor") or params.get("damping_factor") or 0.2),
        max_misfit_percent=float(params.get("maxMisfitPercent") or params.get("max_misfit_percent") or 25.0),
        fail_on_divergence=True,
    )
    json_path = write_json(os.path.join(out, "ert_2d_model.json"), result)
    z = result["z_m"]
    x = result["x_m"]
    rho = np.array(result["resistivity_ohm_m"])
    rows = [
        {
            "x": x[j],
            "z": z[i],
            "z_reference": "model depth below a flat surface; topography not used",
            "resistivity_ohm_m": float(rho[i, j]),
            "interpolation": "smoothness-constrained model cells",
            "model_status": "2-D smoothness inversion — not Res2DInv",
        }
        for i in range(len(z))
        for j in range(len(x))
    ]
    csv_path = os.path.join(out, "ert_2d_model.csv")
    pd.DataFrame(rows).to_csv(csv_path, index=False)
    qc = {
        "misfit_percent": result["misfit_percent"],
        "rms_log": result["rms_log"],
        "iterations": result["iterations"],
        "converged": result["converged"],
        "topography_used": False,
        "n_measurements": int(len(df)),
        "units": "ohm.m",
        "formula": result["formula"],
        "limitations": result["limitations"],
        "not_res2dinv": True,
        "not_3d": True,
    }
    qc_path = write_json(os.path.join(out, "ert_invert_qc.json"), qc)
    write_lineage(out, node_id, qc["formula"], qc, [src], [json_path, csv_path, qc_path])
    return {
        "artifacts": [
            make_artifact("artifact-ert-inv", "section", "json", json_path, node_id, [src], qc),
            make_artifact("artifact-ert-inv-csv", "section", "csv", csv_path, node_id, [src]),
            make_artifact("artifact-ert-inv-qc", "qc_report", "json", qc_path, node_id, [src]),
        ],
        "events": [
            {
                "type": "NODE_PROGRESS",
                "message": f"2-D smoothness inversion misfit={qc['misfit_percent']:.2f}%. Topography not used. Not Res2DInv.",
            }
        ],
    }


def ert_gis_export(payload: dict) -> dict:
    from science.gis import write_geojson_points

    node_id = "ert_gis_export"
    out = _out(payload)
    src = _find(out, "ert_canonical.csv")
    df = pd.read_csv(src)
    if "crs_epsg" not in df.columns or not int(df["crs_epsg"].iloc[0]):
        raise ValueError("ERT GIS export needs a documented CRS. I will not write GeoJSON as 4326 by default.")
    epsg = int(df["crs_epsg"].iloc[0])
    y = df["y"] if "y" in df.columns else np.zeros(len(df))
    path = os.path.join(out, "ert_electrodes.geojson")
    props = [{"value": float(v), "units": "ohm.m"} for v in df["rhoa"]]
    write_geojson_points(df["midpoint_x"], y, props, path, crs_epsg=epsg)
    return {
        "artifacts": [make_artifact("artifact-ert-electrodes", "vector", "geojson", path, node_id, [src])],
        "events": [{"type": "NODE_PROGRESS", "message": f"Wrote ert_electrodes.geojson (EPSG:{epsg}). Midpoints only; y=0 if no northing."}],
    }


def ert_interpret(payload: dict) -> dict:
    node_id = "ert_interpret"
    out = _out(payload)
    qcs = {}
    for name in ("ert_ingest_qc.json", "ert_survey.json", "ert_invert_qc.json"):
        path = os.path.join(out, name)
        if os.path.isfile(path):
            with open(path, encoding="utf-8") as handle:
                qcs[name] = json.load(handle)
    inverted = "ert_invert_qc.json" in qcs
    report = {
        "observations": [
            "ERT measurements were ingested under the G-AID ERT 1.0 contract.",
            f"Pseudosection present: {'ert_survey.json' in qcs}",
            f"2-D inversion present: {inverted}",
        ],
        "assumptions": [
            "Apparent resistivity is as supplied in ohm·m.",
            "Pseudo-depth n·a/2 is a plotting convention.",
            inverted
            and "2-D model uses a homogeneous-half-space sensitivity kernel; topography is not in the forward operator."
            or "2-D inversion did not run in this plan.",
        ],
        "uncertainty": [
            "A smoothness model is non-unique.",
            "The kernel is not equivalent to Res2DInv or a 2.5-D finite-difference forward model.",
        ],
        "recommendations": [
            "Do not treat a resistivity high/low as lithology, groundwater, ore, or a drill target.",
        ],
        "not_established": [
            "Groundwater is not established.",
            "Lithology is not established.",
            "Ore bodies are not established.",
            "Drill targets are not established.",
            "3-D inversion was not performed.",
        ],
        "qc": qcs,
        "interpretation_limit": "Apparent resistivity and a smoothness model are not geology.",
    }
    path = write_json(os.path.join(out, "ert_interpretation.json"), report)
    return {
        "artifacts": [make_artifact("artifact-ert-interpret", "report", "json", path, node_id)],
        "events": [{"type": "NODE_PROGRESS", "message": "Wrote evidence-bound ERT interpretation limits."}],
    }
