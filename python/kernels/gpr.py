"""GPR kernels on the generic DAG. Arbitrary DZT files are refused."""

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


def _bound_gpr(params: dict) -> list[dict]:
    items = params.get("catalogInputs") or params.get("catalog_inputs") or []
    if not isinstance(items, list) or not items:
        raise ValueError("gpr_ingest requires parameters.catalogInputs from the frozen plan.")
    out = []
    for item in items:
        if not isinstance(item, dict):
            continue
        adapter = str(item.get("adapterId") or item.get("kind") or "").lower()
        if adapter in {"gpr-csv"}:
            out.append(item)
    if not out:
        raise ValueError("No bound gpr-csv catalog records. I will not search by extension or decode DZT.")
    return out


def _write_section_csv(path: str, section: np.ndarray, dx: float, dz: float, z_reference: str, model_status: str, units: str) -> None:
    section = np.atleast_2d(np.asarray(section, float))
    rows = ["x,z,amplitude,z_reference,interpolation,model_status,units"]
    for ti, tr in enumerate(section):
        x = ti * dx
        for si, amp in enumerate(tr):
            if not np.isfinite(amp):
                continue
            rows.append(
                f"{x},{si * dz},{float(amp)},{z_reference},none — discrete samples,{model_status},{units}"
            )
    with open(path, "w", encoding="utf-8") as handle:
        handle.write("\n".join(rows) + "\n")


def gpr_ingest(payload: dict) -> dict:
    from formats.gpr import parse_gpr_table

    node_id = "gpr_ingest"
    out = _out(payload)
    params = _params(payload)
    frames = []
    qc_files = []
    events = []
    for item in _bound_gpr(params):
        rel = str(item.get("path") or "")
        filepath = item.get("absPath") or item.get("abs_path") or rel
        if filepath and not os.path.isabs(str(filepath)):
            filepath = os.path.abspath(os.path.join(str(params.get("baseDir") or ""), str(filepath)))
        parsed = parse_gpr_table(str(filepath))
        table = parsed["table"].copy()
        table["dt_ns"] = parsed["dt_ns"]
        table["dx_m"] = parsed["dx_m"]
        table["antenna_mhz"] = parsed["antenna_mhz"]
        table["units"] = parsed["units"]
        table["crs_epsg"] = parsed["crs_epsg"]
        table["velocity_ms"] = parsed["velocity_ms"] if parsed["velocity_ms"] else np.nan
        table["source_catalog_id"] = item.get("catalogId") or item.get("catalog_id")
        table["source_checksum"] = item.get("checksum")
        frames.append(table)
        qc = {
            "product_name": "G-AID GPR 1.0 canonical section",
            "n_traces": parsed["n_traces"],
            "n_samples": parsed["n_samples"],
            "dt_ns": parsed["dt_ns"],
            "dx_m": parsed["dx_m"],
            "antenna_mhz": parsed["antenna_mhz"],
            "units": parsed["units"],
            "crs_epsg": parsed["crs_epsg"],
            "velocity_ms": parsed["velocity_ms"],
            "velocity_assumed": False,
            "dzt_decoded": False,
            "catalog_id": item.get("catalogId") or item.get("catalog_id"),
            "checksum": item.get("checksum"),
            "formula": parsed["formula"],
        }
        qc_files.append(qc)
        events.append({"type": "NODE_PROGRESS", "message": f"Ingested G-AID GPR 1.0 {parsed['n_traces']} traces × {parsed['n_samples']} samples."})
    work = pd.concat(frames, ignore_index=True)
    path = os.path.join(out, "gpr_canonical.csv")
    work.to_csv(path, index=False)
    qc = {"files": qc_files, "n_traces": int(work["trace"].nunique()), "units": str(work["units"].iloc[0])}
    qc_path = write_json(os.path.join(out, "gpr_ingest_qc.json"), qc)
    write_lineage(out, node_id, "G-AID GPR 1.0 ingest", {"n": len(work)}, [str(item.get("path")) for item in _bound_gpr(params)], [path, qc_path])
    return {
        "artifacts": [
            make_artifact("artifact-gpr-canonical", "processed_dataset", "csv", path, node_id),
            make_artifact("artifact-gpr-ingest-qc", "qc_report", "json", qc_path, node_id),
        ],
        "events": events,
    }


def gpr_process(payload: dict) -> dict:
    from science.gpr import process_section

    node_id = "gpr_process"
    out = _out(payload)
    src = _find(out, "gpr_canonical.csv")
    df = pd.read_csv(src)
    dt_ns = float(df["dt_ns"].iloc[0])
    dx = float(df["dx_m"].iloc[0])
    antenna = float(df["antenna_mhz"].iloc[0])
    units = str(df["units"].iloc[0])
    traces = df.pivot_table(index="trace", columns="sample", values="amplitude", aggfunc="mean")
    traces = traces.reindex(sorted(traces.index), axis=0).reindex(sorted(traces.columns), axis=1)
    grid = traces.to_numpy(dtype=float)
    params = _params(payload)
    f_low = params.get("fLowHz") or params.get("f_low_hz")
    f_high = params.get("fHighHz") or params.get("f_high_hz")
    result = process_section(
        grid,
        dt=dt_ns * 1e-9,
        dx=dx,
        f_low=float(f_low) if f_low else None,
        f_high=float(f_high) if f_high else None,
        antenna_mhz=antenna,
    )
    section = result["bandpassed"]
    csv_path = os.path.join(out, "gpr_radargram.csv")
    _write_section_csv(
        csv_path,
        section,
        dx,
        dt_ns,
        z_reference="two-way time ns — not depth",
        model_status="processed radargram; not migrated; not utilities/voids/archaeology",
        units=units,
    )
    np.savez(
        os.path.join(out, "gpr_processed.npz"),
        bandpassed=section,
        dt_ns=dt_ns,
        dx_m=dx,
        velocity_ms=float(df["velocity_ms"].iloc[0]) if "velocity_ms" in df.columns and pd.notna(df["velocity_ms"].iloc[0]) and str(df["velocity_ms"].iloc[0]) != "" else 0.0,
    )
    qc = {
        "product_name": "G-AID GPR 1.0 processed radargram",
        "time_zero_sample": result["time_zero_sample"],
        "dewow_window": result["dewow_window"],
        "sec_power": result["sec_power"],
        "bandpass_hz": [result["f_low_hz"], result["f_high_hz"]],
        "bandpass_applied": result["bandpass_applied"],
        "bandpass_defaulted_from_antenna": result["bandpass_defaulted_from_antenna"],
        "dt_ns": dt_ns,
        "dx_m": dx,
        "antenna_mhz": antenna,
        "units": units,
        "vertical_axis": "two-way time ns",
        "migrated": False,
        "formula": result["formula"],
        "limitations": [
            "Two-way time is not depth.",
            "Dewow, time-zero, and SEC gain are processing choices.",
            "Utilities, voids, archaeology, water table, and rebar are not established.",
        ],
    }
    qc_path = write_json(os.path.join(out, "gpr_process_qc.json"), qc)
    write_lineage(out, node_id, result["formula"], {"dt_ns": dt_ns, "dx_m": dx, "antenna_mhz": antenna}, [src], [csv_path, qc_path])
    return {
        "artifacts": [
            make_artifact("artifact-gpr-radargram", "section", "csv", csv_path, node_id, [src], qc),
            make_artifact("artifact-gpr-process-qc", "qc_report", "json", qc_path, node_id, [src]),
        ],
        "events": [{"type": "NODE_PROGRESS", "message": f"Processed GPR radargram. Time-zero sample {qc['time_zero_sample']}. Two-way time, not depth."}],
    }


def gpr_migrate(payload: dict) -> dict:
    from science.seismic import kirchhoff_time_migrate_2d

    node_id = "gpr_migrate"
    out = _out(payload)
    params = _params(payload)
    src = _find(out, "gpr_processed.npz")
    loaded = np.load(src)
    documented = float(loaded["velocity_ms"]) if "velocity_ms" in loaded.files else 0.0
    vel = params.get("velocityMs") or params.get("velocity_ms")
    velocity_source = "user"
    if vel is None and documented > 0:
        vel = documented
        velocity_source = "contract"
    if vel is None:
        raise ValueError("gpr.migrate needs parameters.velocityMs. I will not assume 0.1 m/ns or a dielectric constant.")
    vel = float(vel)
    if vel <= 0:
        raise ValueError("Migration velocity must be positive.")
    section = loaded["bandpassed"]
    dt_ns = float(loaded["dt_ns"])
    dx = float(loaded["dx_m"])
    migrated = kirchhoff_time_migrate_2d(section, dt_ns * 1e-9, dx, vel)
    depth_dz = 0.5 * vel * (dt_ns * 1e-9)
    csv_path = os.path.join(out, "gpr_migrated.csv")
    _write_section_csv(
        csv_path,
        migrated,
        dx,
        depth_dz,
        z_reference="depth m from user velocity (0.5 v t); not ground truth",
        model_status="Kirchhoff time migration with user velocity; not a measured depth model",
        units="amp",
    )
    qc = {
        "product_name": "GPR Kirchhoff time migration (user velocity)",
        "migrated": True,
        "velocity_ms": vel,
        "velocity_source": velocity_source,
        "velocity_assumed": False,
        "dt_ns": dt_ns,
        "dx_m": dx,
        "depth_sample_m": depth_dz,
        "formula": "Kirchhoff 2-D time migration (Yilmaz 2001). z = 0.5 v t with user v.",
        "limitations": [
            "Migrated depth uses the supplied velocity and is not ground truth.",
            "Hyperbola collapse does not prove a pipe, void, or archaeological feature.",
        ],
    }
    qc_path = write_json(os.path.join(out, "gpr_migrate_qc.json"), qc)
    write_lineage(out, node_id, qc["formula"], {"velocityMs": vel}, [src], [csv_path, qc_path])
    return {
        "artifacts": [
            make_artifact("artifact-gpr-migrated", "section", "csv", csv_path, node_id, [src], qc),
            make_artifact("artifact-gpr-migrate-qc", "qc_report", "json", qc_path, node_id, [src]),
        ],
        "events": [{"type": "NODE_PROGRESS", "message": f"Kirchhoff migration at {vel} m/s (user-supplied). Depth is not ground truth."}],
    }


def gpr_gis_export(payload: dict) -> dict:
    from science.gis import write_geojson_points

    node_id = "gpr_gis_export"
    out = _out(payload)
    src = _find(out, "gpr_canonical.csv")
    df = pd.read_csv(src)
    epsg = int(df["crs_epsg"].iloc[0]) if "crs_epsg" in df.columns else 0
    if epsg <= 0:
        raise ValueError("GPR GIS export needs a documented EPSG on the G-AID GPR 1.0 contract. I will not invent a map CRS.")
    dx = float(df["dx_m"].iloc[0])
    traces = sorted(df["trace"].unique())
    xs = np.array([float(t) * dx for t in traces])
    ys = np.zeros_like(xs)
    path = os.path.join(out, "gpr_traces.geojson")
    write_geojson_points(xs, ys, [{"trace": int(t)} for t in traces], path, crs_epsg=epsg)
    qc = {"crs_epsg": epsg, "n_traces": len(traces), "line_geometry": "x = trace * dx_m, y = 0 (no northing documented)"}
    qc_path = write_json(os.path.join(out, "gpr_gis_qc.json"), qc)
    return {
        "artifacts": [
            make_artifact("artifact-gpr-traces", "vector", "geojson", path, node_id, [src]),
            make_artifact("artifact-gpr-gis-qc", "qc_report", "json", qc_path, node_id, [src]),
        ],
        "events": [{"type": "NODE_PROGRESS", "message": f"Wrote gpr_traces.geojson (EPSG:{epsg}). y=0 because no northing was documented."}],
    }


def gpr_interpret(payload: dict) -> dict:
    node_id = "gpr_interpret"
    out = _out(payload)
    qcs = {}
    for name in ("gpr_ingest_qc.json", "gpr_process_qc.json", "gpr_migrate_qc.json", "gpr_gis_qc.json"):
        path = os.path.join(out, name)
        if os.path.isfile(path):
            with open(path, encoding="utf-8") as handle:
                qcs[name] = json.load(handle)
    process = qcs.get("gpr_process_qc.json") or {}
    migrate = qcs.get("gpr_migrate_qc.json") or {}
    product = migrate.get("product_name") or process.get("product_name") or "G-AID GPR 1.0 processed radargram"
    report = {
        "product_name": product,
        "observations": [
            "GPR traces were ingested under the G-AID GPR 1.0 contract.",
            f"Process QC present: {'gpr_process_qc.json' in qcs}",
            f"Migration QC present: {'gpr_migrate_qc.json' in qcs}",
            f"Product reported in this run: {product}.",
        ],
        "assumptions": [
            process.get("antenna_mhz") and f"Antenna {process['antenna_mhz']} MHz was documented on the contract."
            or "Antenna frequency was required on ingest.",
            process.get("bandpass_defaulted_from_antenna")
            and "Bandpass used 0.2–2.0 × AntennaMHz because fLowHz/fHighHz were not supplied."
            or "Bandpass frequencies were recorded when applied.",
            migrate.get("velocity_ms")
            and f"Migration velocity {migrate['velocity_ms']} m/s was user-supplied."
            or "Kirchhoff migration was not applied.",
        ],
        "uncertainty": [
            "Two-way time is not depth unless a user velocity is applied.",
            "A user velocity is not a measured dielectric structure.",
            "Dewow, time-zero, SEC gain, and bandpass change amplitudes and apparent structure.",
        ],
        "recommendations": [
            "Do not pick utilities, voids, or archaeology from a radargram without field verification.",
            "Do not treat migrated depth as ground truth.",
        ],
        "not_established": [
            "Utilities are not established.",
            "Voids are not established.",
            "Archaeology is not established.",
            "Water table is not established.",
            "Rebar is not established.",
            "Lithology is not established.",
            "Measured depth is not established without an independently verified velocity.",
        ],
        "qc": qcs,
        "interpretation_limit": "A radargram is an observation. Overlay and colour scale do not prove a buried object.",
    }
    path = write_json(os.path.join(out, "gpr_interpretation.json"), report)
    return {
        "artifacts": [make_artifact("artifact-gpr-interpret", "report", "json", path, node_id)],
        "events": [{"type": "NODE_PROGRESS", "message": "Wrote evidence-bound GPR interpretation limits."}],
    }
