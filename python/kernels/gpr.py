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
        from science.gpr import sampling_from_dt

        samp = sampling_from_dt(float(parsed["dt_ns"]) * 1e-9)
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
            "sampling_hz": samp["sampling_hz"],
            "nyquist_hz": samp["nyquist_hz"],
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


def _flag(params: dict, *names: str, default: bool = True) -> bool:
    for name in names:
        if name in params and params[name] is not None:
            value = params[name]
            if isinstance(value, str):
                return value.strip().lower() not in {"0", "false", "no", "off"}
            return bool(value)
    return default


def _num(params: dict, *names: str, default=None):
    for name in names:
        if params.get(name) not in (None, ""):
            return params[name]
    return default


def gpr_process(payload: dict) -> dict:
    from science.gpr import process_section, sampling_from_dt

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
    f_low = _num(params, "fLowHz", "f_low_hz")
    f_high = _num(params, "fHighHz", "f_high_hz")
    samp = sampling_from_dt(dt_ns * 1e-9)
    result = process_section(
        grid,
        dt=dt_ns * 1e-9,
        dx=dx,
        f_low=float(f_low) if f_low not in (None, "") else None,
        f_high=float(f_high) if f_high not in (None, "") else None,
        antenna_mhz=antenna,
        dewow_window=int(_num(params, "dewowWindow", "dewow_window") or 31),
        sec_power=float(_num(params, "secPower", "sec_power") or 2.0),
        sec_exp=float(_num(params, "secExp", "sec_exp") or 0.0),
        time_zero_threshold=float(_num(params, "timeZeroThreshold", "time_zero_threshold") or 0.05),
        filter_order=int(_num(params, "filterOrder", "filter_order") or 4),
        apply_dewow=_flag(params, "applyDewow", "apply_dewow", default=True),
        apply_time_zero=_flag(params, "applyTimeZero", "apply_time_zero", default=True),
        apply_sec_gain=_flag(params, "applySecGain", "apply_sec_gain", default=True),
        apply_bandpass=_flag(params, "applyBandpass", "apply_bandpass", default=True),
    )
    section = result["section"]
    filt = result["bandpass"]
    if filt["bandpass_applied"]:
        model_status = (
            f"processed radargram; Nyquist-safe band-pass {filt['applied_low_hz']/1e6:.4g}–{filt['applied_high_hz']/1e6:.4g} MHz; "
            "not migrated; visually enhanced ≠ geological certainty"
        )
    elif filt["bandpass_refused"]:
        model_status = f"processed radargram; band-pass refused: {filt['refusal_reason']}; not migrated"
    else:
        model_status = "processed radargram; band-pass off; not migrated; visually enhanced ≠ geological certainty"
    csv_path = os.path.join(out, "gpr_radargram.csv")
    _write_section_csv(
        csv_path,
        section,
        dx,
        dt_ns,
        z_reference="two-way time ns — not depth",
        model_status=model_status,
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
        "dt_ns": dt_ns,
        "sampling_hz": samp["sampling_hz"],
        "nyquist_hz": samp["nyquist_hz"],
        "dx_m": dx,
        "antenna_mhz": antenna,
        "units": units,
        "vertical_axis": "two-way time ns",
        "migrated": False,
        "geological_certainty_improved": False,
        "dewow_applied": result["dewow_applied"],
        "dewow_window": result["dewow_window"],
        "dewow_formula": result["dewow_formula"],
        "time_zero_applied": result["time_zero_applied"],
        "time_zero_sample": result["time_zero_sample"],
        "time_zero_threshold": result["time_zero_threshold"],
        "time_zero_method": result["time_zero_method"],
        "sec_applied": result["sec_applied"],
        "sec_power": result["sec_power"],
        "sec_exp": result["sec_exp"],
        "sec_formula": result["sec_formula"],
        "filter_order": result["filter_order"],
        "bandpass": filt,
        "requested_filter_hz": [filt["requested_low_hz"], filt["requested_high_hz"]],
        "applied_filter_hz": [filt["applied_low_hz"], filt["applied_high_hz"]],
        "bandpass_applied": filt["bandpass_applied"],
        "bandpass_defaulted_from_antenna": filt["bandpass_defaulted_from_antenna"],
        "bandpass_adjusted": filt["bandpass_adjusted"],
        "bandpass_refused": filt["bandpass_refused"],
        "formula": result["formula"],
        "limitations": result["limitations"],
        "frozen_parameters": {
            "applyDewow": result["dewow_applied"],
            "dewowWindow": result["dewow_window"],
            "applyTimeZero": result["time_zero_applied"],
            "timeZeroThreshold": result["time_zero_threshold"],
            "applySecGain": result["sec_applied"],
            "secPower": result["sec_power"],
            "secExp": result["sec_exp"],
            "applyBandpass": filt["apply_bandpass_requested"],
            "filterOrder": result["filter_order"],
            "fLowHz": f_low,
            "fHighHz": f_high,
        },
    }
    qc_path = write_json(os.path.join(out, "gpr_process_qc.json"), qc)
    write_json(os.path.join(out, "gpr_radargram.meta.json"), {
        "kind": "gpr-radargram",
        "vertical_axis": "two-way time ns — not depth",
        "sampling_hz": samp["sampling_hz"],
        "nyquist_hz": samp["nyquist_hz"],
        "bandpass_applied": filt["bandpass_applied"],
        "bandpass_adjusted": filt["bandpass_adjusted"],
        "bandpass_refused": filt["bandpass_refused"],
        "requested_filter_hz": [filt["requested_low_hz"], filt["requested_high_hz"]],
        "applied_filter_hz": [filt["applied_low_hz"], filt["applied_high_hz"]],
        "refusal_reason": filt["refusal_reason"],
        "adjustment_reason": filt["adjustment_reason"],
        "geological_certainty_improved": False,
    })
    write_lineage(
        out,
        node_id,
        result["formula"],
        {"dt_ns": dt_ns, "dx_m": dx, "antenna_mhz": antenna, "sampling_hz": samp["sampling_hz"], "nyquist_hz": samp["nyquist_hz"], "bandpass": filt},
        [src],
        [csv_path, qc_path],
    )
    msg = (
        f"Processed GPR radargram. fs={samp['sampling_hz']/1e6:.4g} MHz, Nyquist={samp['nyquist_hz']/1e6:.4g} MHz. "
        f"{'Band-pass applied.' if filt['bandpass_applied'] else 'Band-pass not applied.'} Two-way time, not depth. "
        "A visually enhanced radargram does not have improved geological certainty."
    )
    if filt.get("adjustment_reason"):
        msg += " " + filt["adjustment_reason"]
    if filt.get("refusal_reason") and filt["bandpass_refused"]:
        msg += " " + filt["refusal_reason"]
    return {
        "artifacts": [
            make_artifact("artifact-gpr-radargram", "section", "csv", csv_path, node_id, [src], qc),
            make_artifact("artifact-gpr-process-qc", "qc_report", "json", qc_path, node_id, [src]),
        ],
        "events": [{"type": "NODE_PROGRESS", "message": msg}],
    }


def _migration_benchmark_gate() -> tuple[bool, dict]:
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    path = os.path.join(root, "docs", "validation", "results", "gpr_migration_benchmark.json")
    if not os.path.isfile(path):
        return False, {
            "all_passed": False,
            "unavailable_reason": "Migration benchmark file is missing. Kirchhoff migration is unavailable.",
        }
    with open(path, encoding="utf-8") as handle:
        data = json.load(handle)
    return bool(data.get("all_passed")), data


def gpr_migrate(payload: dict) -> dict:
    from science.seismic import kirchhoff_time_migrate_2d
    from science.gpr import MIGRATION_FORMULA, sampling_from_dt

    node_id = "gpr_migrate"
    allowed, bench = _migration_benchmark_gate()
    if not allowed:
        raise ValueError(
            bench.get("unavailable_reason")
            or "Kirchhoff time migration is unavailable until the documented diffraction benchmark passes."
        )
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
    samp = sampling_from_dt(dt_ns * 1e-9)
    migrated = kirchhoff_time_migrate_2d(section, dt_ns * 1e-9, dx, vel)
    depth_dz = 0.5 * vel * (dt_ns * 1e-9)
    csv_path = os.path.join(out, "gpr_migrated.csv")
    _write_section_csv(
        csv_path,
        migrated,
        dx,
        depth_dz,
        z_reference="depth m from user velocity (0.5 v t); not ground truth",
        model_status="Kirchhoff time migration with user velocity; not a measured depth model; not geological certainty",
        units="amp",
    )
    qc = {
        "product_name": "GPR Kirchhoff time migration (user velocity)",
        "migrated": True,
        "velocity_ms": vel,
        "velocity_source": velocity_source,
        "velocity_assumed": False,
        "dt_ns": dt_ns,
        "sampling_hz": samp["sampling_hz"],
        "nyquist_hz": samp["nyquist_hz"],
        "dx_m": dx,
        "depth_sample_m": depth_dz,
        "formula": MIGRATION_FORMULA,
        "benchmark_passed": True,
        "benchmark_file": "docs/validation/results/gpr_migration_benchmark.json",
        "geological_certainty_improved": False,
        "limitations": [
            "Migrated depth uses the supplied velocity and is not ground truth.",
            "Hyperbola collapse does not prove a pipe, void, or archaeological feature.",
            "The operator passed a noise-free constant-velocity diffraction benchmark. Field data are not that case.",
        ],
    }
    qc_path = write_json(os.path.join(out, "gpr_migrate_qc.json"), qc)
    write_json(os.path.join(out, "gpr_migrated.meta.json"), {
        "kind": "gpr-radargram",
        "vertical_axis": "depth m from user velocity (0.5 v t); not ground truth",
        "velocity_ms": vel,
        "geological_certainty_improved": False,
    })
    write_lineage(out, node_id, qc["formula"], {"velocityMs": vel, "benchmark_passed": True}, [src], [csv_path, qc_path])
    return {
        "artifacts": [
            make_artifact("artifact-gpr-migrated", "section", "csv", csv_path, node_id, [src], qc),
            make_artifact("artifact-gpr-migrate-qc", "qc_report", "json", qc_path, node_id, [src]),
        ],
        "events": [{"type": "NODE_PROGRESS", "message": f"Kirchhoff migration at {vel} m/s (user-supplied). Depth is not ground truth. Benchmark passed."}],
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
            and (
                "Bandpass used 0.2–2.0 × AntennaMHz because fLowHz/fHighHz were not supplied."
                + (
                    " Corners were then adjusted to a documented Nyquist-safe high-cut."
                    if process.get("bandpass_adjusted")
                    else ""
                )
            )
            or process.get("bandpass_refused")
            and "Band-pass was refused; traces were not filtered."
            or "Bandpass frequencies were recorded when applied.",
            migrate.get("velocity_ms")
            and f"Migration velocity {migrate['velocity_ms']} m/s was user-supplied."
            or "Kirchhoff migration was not applied.",
        ],
        "uncertainty": [
            "Two-way time is not depth unless a user velocity is applied.",
            "A user velocity is not a measured dielectric structure.",
            "Dewow, time-zero, SEC gain, and band-pass change amplitudes and apparent structure.",
            "A visually enhanced radargram does not have improved geological certainty.",
            process.get("bandpass_refused") and process.get("bandpass", {}).get("refusal_reason")
            or process.get("bandpass_adjusted") and process.get("bandpass", {}).get("adjustment_reason")
            or "Band-pass status is recorded in process QC.",
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
