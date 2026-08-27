"""Kernel dispatcher — every node the agent can run.

Unknown tools fail. Nothing is simulated. Missing inputs raise FileNotFoundError.
"""

from __future__ import annotations

import json
import os

import numpy as np
import pandas as pd

from science.artifacts import (
    make_artifact,
    skipped,
    step_enabled,
    task_dir,
    write_json,
    write_lineage,
)


def get_handler(node_id: str):
    if node_id == "file_discovery":
        from nodes.file_discovery import discover_files
        return discover_files
    if node_id == "flight_path_cleaner":
        from nodes.flight_path_cleaner import clean_flight_path
        return clean_flight_path
    if node_id == "time_synchronizer":
        from nodes.time_synchronizer import synchronize_time
        return synchronize_time
    if node_id == "diurnal_corrector":
        from nodes.diurnal_corrector import compute_correction
        return compute_correction
    if node_id == "qc_engine":
        from nodes.qc_engine import run_qc
        return run_qc
    if node_id == "excel_export_adapter":
        from adapters.excel_export_adapter import export_excel
        return export_excel
    if node_id == "report_export_adapter":
        from adapters.report_export_adapter import export_report
        return export_report
    mapping = {
        "igrf_corrector": igrf_corrector,
        "heading_lag_corrector": heading_lag_corrector,
        "tie_line_leveler": tie_line_leveler,
        "microleveller": microleveller,
        "mag_gridder": mag_gridder,
        "grid_microleveller": grid_microleveller,
        "rtp_filter": rtp_filter,
        "fft_derivatives": fft_derivatives,
        "map_composer": map_composer,
        "gis_export": gis_export,
        "lineament_extractor": lineament_extractor,
        "euler_deconvolution": euler_deconvolution_node,
        "gravity_ingest": gravity_ingest,
        "gravity_freeair": gravity_freeair,
        "gravity_bouguer": gravity_bouguer,
        "gravity_terrain": gravity_terrain,
        "grav_gridder": grav_gridder,
        "regional_residual": regional_residual,
        "grav_gis_export": grav_gis_export,
        "grav_interpret": grav_interpret,
        "gravity_reduce": gravity_reduce,
        "ert_ingest": ert_ingest,
        "ert_pseudosection": ert_pseudosection,
        "ert_invert": ert_invert,
        "ert_gis_export": ert_gis_export,
        "ert_interpret": ert_interpret,
        "rad_ingest": rad_ingest,
        "rad_grid": rad_grid,
        "rad_ternary": rad_ternary,
        "rad_ratios": rad_ratios,
        "rad_gis_export": rad_gis_export,
        "rad_interpret": rad_interpret,
        "seismic_process": seismic_process,
        "radiometric_correct": radiometric_correct,
        "gpr_process": gpr_process,
        "las_ingest": las_ingest,
        "crs_reproject": crs_reproject,
        "xyz_ingest": xyz_ingest,
    }
    return mapping.get(node_id)


def dispatch(node_id: str, payload: dict) -> dict:
    handler = get_handler(node_id)
    if handler is None:
        raise ValueError(f"Unknown kernel: {node_id}. Refusing to simulate.")
    return handler(payload)


def _params(payload: dict) -> dict:
    return payload.get("parameters") or {}


def _find(directory: str, *names: str) -> str:
    for name in names:
        path = os.path.join(directory, name)
        if os.path.isfile(path):
            return path
    raise FileNotFoundError(f"None of {names} found in {directory}")


def _value_column(df: pd.DataFrame) -> str:
    for col in (
        "igrf_residual_nT",
        "leveled_magnetic_field",
        "heading_corrected_nT",
        "corrected_magnetic_field",
        "magnetic_field",
        "bouguer_mgal",
        "value",
    ):
        if col in df.columns:
            return col
    raise ValueError(f"No magnetic/gravity value column in {list(df.columns)}")


def igrf_corrector(payload: dict) -> dict:
    if not step_enabled(payload, "igrf", default=True):
        return skipped("igrf_corrector", "not in plan")
    from science.igrf import decimal_year, igrf13

    node_id = "igrf_corrector"
    out = task_dir(payload)
    src = _find(out, "airborne_corrected.csv", "airborne_cleaned.csv", "airborne_canonical.csv")
    df = pd.read_csv(src)
    params = _params(payload)
    alt_default = float(params.get("surveyAltitudeM") or params.get("altitude_m") or 0.0)
    year_override = params.get("decimalYear")
    events = []
    f_vals = np.empty(len(df))
    inc_vals = np.empty(len(df))
    dec_vals = np.empty(len(df))
    extra = False
    value_col = _value_column(df)
    df = df.reset_index(drop=True)
    zcol = df["z"].to_numpy() if "z" in df.columns else np.full(len(df), np.nan)
    tscol = df["timestamp"].to_numpy() if "timestamp" in df.columns else np.full(len(df), np.nan)
    for i in range(len(df)):
        lat = float(df.at[i, "y"])
        lon = float(df.at[i, "x"])
        alt_m = float(zcol[i]) if np.isfinite(zcol[i]) else alt_default
        if abs(lat) > 90 or abs(lon) > 180:
            raise ValueError(
                "IGRF requires geodetic lat/lon in columns y, x. "
                "Reproject to EPSG:4326 first (crs_reproject)."
            )
        ts = float(tscol[i]) if np.isfinite(tscol[i]) else None
        if year_override is not None:
            year = float(year_override)
        elif ts is not None:
            year = decimal_year(timestamp=ts)
        else:
            finite_ts = tscol[np.isfinite(tscol)]
            if len(finite_ts) == 0:
                raise ValueError("IGRF needs timestamps or parameters.decimalYear")
            year = decimal_year(timestamp=float(np.median(finite_ts)))
        res = igrf13(lat, lon, alt_m / 1000.0, year)
        f_vals[i] = res.f
        inc_vals[i] = res.inclination
        dec_vals[i] = res.declination
        extra = extra or res.extrapolated
    df["igrf_nT"] = f_vals
    df["igrf_inclination"] = inc_vals
    df["igrf_declination"] = dec_vals
    df["igrf_residual_nT"] = df[value_col] - df["igrf_nT"]
    path = os.path.join(out, "airborne_igrf.csv")
    df.to_csv(path, index=False)
    qc = {
        "mean_igrf_nT": float(np.nanmean(f_vals)),
        "mean_inclination_deg": float(np.nanmean(inc_vals)),
        "mean_declination_deg": float(np.nanmean(dec_vals)),
        "mean_residual_nT": float(np.nanmean(df["igrf_residual_nT"])),
        "extrapolated": extra,
        "formula": "B_anom = B_obs - F_IGRF13(lat, lon, h, t)  (Alken et al. 2021)",
        "year_note": "IGRF-13 official SV window is 2020.0–2025.0; outside that range SV is extrapolated.",
    }
    qc_path = write_json(os.path.join(out, "igrf_qc.json"), qc)
    write_lineage(out, node_id, qc["formula"], {"altitude_m_default": alt_default}, [src], [path, qc_path])
    if extra:
        events.append({"type": "QC_WARNING", "severity": "warning", "message": "IGRF year outside 2020–2025; SV extrapolated."})
    events.append({"type": "NODE_PROGRESS", "message": f"IGRF removed. Mean I={qc['mean_inclination_deg']:.2f}°, D={qc['mean_declination_deg']:.2f}°."})
    return {
        "artifacts": [
            make_artifact("artifact-igrf-1", "processed_dataset", "csv", path, node_id, [src]),
            make_artifact("artifact-igrf-qc-1", "qc_report", "json", qc_path, node_id, [src], qc),
        ],
        "events": events,
    }


def heading_lag_corrector(payload: dict) -> dict:
    if not step_enabled(payload, "headingLag", default=True):
        return skipped("heading_lag_corrector", "not in plan")
    from science.crs import project_points
    from science.magnetics import apply_lag, estimate_lag_from_reciprocal_lines, heading_correction, heading_from_track

    node_id = "heading_lag_corrector"
    out = task_dir(payload)
    src = _find(out, "airborne_igrf.csv", "airborne_corrected.csv")
    df = pd.read_csv(src)
    col = _value_column(df)
    events = []
    lag_info = estimate_lag_from_reciprocal_lines(df.assign(magnetic_field=df[col]), "magnetic_field")
    work = df.copy()
    if lag_info.get("applied") and lag_info.get("lag_samples"):
        work = apply_lag(work, col, int(lag_info["lag_samples"]))
        events.append({"type": "NODE_PROGRESS", "message": f"Lag {lag_info['lag_samples']} samples applied from reciprocal lines."})
    else:
        events.append({"type": "NODE_PROGRESS", "message": f"Lag not applied ({lag_info.get('reason')})."})
    east, north, crs = project_points(work["x"], work["y"])
    hd = heading_from_track(east, north)
    corrected, hinfo = heading_correction(work[col].to_numpy(), hd)
    work["heading_rad"] = hd
    work["heading_corrected_nT"] = corrected
    path = os.path.join(out, "airborne_heading_lag.csv")
    work.to_csv(path, index=False)
    meta = {"lag": lag_info, "heading": hinfo, "crs_epsg": crs.epsg}
    write_json(os.path.join(out, "heading_lag_qc.json"), meta)
    write_lineage(out, node_id, "Luyendyk 1997 heading; reciprocal-line lag", meta, [src], [path])
    events.append({"type": "NODE_PROGRESS", "message": f"Heading correction rms={hinfo.get('rms_nT', 0):.3f} nT."})
    return {"artifacts": [make_artifact("artifact-heading-1", "processed_dataset", "csv", path, node_id, [src], meta)], "events": events}


def tie_line_leveler(payload: dict) -> dict:
    if not step_enabled(payload, "level", default=True):
        return skipped("tie_line_leveler", "not in plan")
    from science.crs import project_points
    from science.magnetics import tie_line_level

    node_id = "tie_line_leveler"
    out = task_dir(payload)
    src = _find(out, "airborne_heading_lag.csv", "airborne_igrf.csv", "airborne_corrected.csv")
    df = pd.read_csv(src)
    col = _value_column(df)
    east, north, crs = project_points(df["x"], df["y"])
    work = df.copy()
    work["x"] = east
    work["y"] = north
    work["magnetic_field"] = work[col]
    leveled, info = tie_line_level(
        work,
        radius_m=float(_params(payload).get("tieRadiusM") or 25.0),
        hold=str(_params(payload).get("levelHold") or "ties"),
        degree=int(_params(payload).get("levelDegree") or 0),
        max_shift_nT=float(_params(payload).get("maxLevelShiftNT") or 80.0),
    )
    leveled["leveled_magnetic_field"] = leveled["magnetic_field"]
    # restore lon/lat for GIS if original was geographic
    leveled["easting"] = east
    leveled["northing"] = north
    leveled["x"] = df["x"].to_numpy()
    leveled["y"] = df["y"].to_numpy()
    path = os.path.join(out, "airborne_leveled.csv")
    leveled.to_csv(path, index=False)
    qc_path = write_json(os.path.join(out, "leveling_qc.json"), info)
    write_lineage(out, node_id, "Oasis-style statistical levelling; ties held (Mittal 1984)", info, [src], [path])
    events = [{"type": "NODE_PROGRESS", "message": f"Tie-line levelling: {info}"}]
    return {
        "artifacts": [
            make_artifact("artifact-level-1", "processed_dataset", "csv", path, node_id, [src], info),
            make_artifact("artifact-level-qc-1", "qc_report", "json", qc_path, node_id, [src]),
        ],
        "events": events,
    }


def microleveller(payload: dict) -> dict:
    if not step_enabled(payload, "level", default=True):
        return skipped("microleveller", "not in plan")
    from science.magnetics import microlevel_along_line

    node_id = "microleveller"
    out = task_dir(payload)
    src = _find(out, "airborne_leveled.csv", "airborne_heading_lag.csv", "airborne_igrf.csv", "airborne_corrected.csv")
    df = pd.read_csv(src)
    col = _value_column(df)
    leveled, info = microlevel_along_line(
        df,
        col,
        window=int(_params(payload).get("microlevelWindow") or 101),
        max_amp_nT=float(_params(payload).get("microlevelMaxAmpNT") or 8.0),
    )
    path = os.path.join(out, "airborne_microleveled.csv")
    leveled.to_csv(path, index=False)
    write_json(os.path.join(out, "microlevel_qc.json"), info)
    events = [{"type": "NODE_PROGRESS", "message": f"Microlevelling: {info}"}]
    if not info.get("applied"):
        events.append({"type": "QC_WARNING", "severity": "warning", "message": info.get("reason", "microlevel not applied")})
    return {
        "artifacts": [make_artifact("artifact-microlevel-1", "processed_dataset", "csv", path, node_id, [src], info)],
        "events": events,
    }


def _tmi_basename(out: str) -> str:
    if os.path.isfile(os.path.join(out, "tmi_microleveled.npz")):
        return "tmi_microleveled"
    return "tmi_grid"


def _run_grid_microlevel(payload: dict, out: str, grid, crs) -> dict:
    from science.gis import export_grid_bundle
    from science.magnetics import microlevel_grid

    params = _params(payload)
    spacing = params.get("lineSpacingM")
    azimuth = params.get("flightAzimuthDeg")
    qc_path = os.path.join(out, "leveling_qc.json")
    if os.path.isfile(qc_path):
        with open(qc_path, encoding="utf-8") as handle:
            level_qc = json.load(handle)
        spacing = spacing or level_qc.get("line_spacing_m")
        azimuth = azimuth if azimuth is not None else level_qc.get("flight_azimuth_deg")
    if not spacing:
        return {
            "artifacts": [],
            "events": [{"type": "NODE_PROGRESS", "message": "grid_microleveller skipped: no line spacing (need ties/traverses or lineSpacingM)"}],
        }
    leveled, info = microlevel_grid(
        grid,
        float(spacing),
        float(azimuth or 0.0),
        max_amp_nT=float(params.get("gridMicrolevelMaxAmpNT") or 6.0),
    )
    paths = export_grid_bundle(leveled, out, "tmi_microleveled", crs)
    np.savez(
        os.path.join(out, "tmi_microleveled.npz"),
        values=leveled.masked(),
        x0=leveled.x0,
        y0=leveled.y0,
        dx=leveled.dx,
        dy=leveled.dy,
        crs=grid.crs_epsg,
    )
    write_json(os.path.join(out, "grid_microlevel_qc.json"), info)
    artifacts = [make_artifact(f"artifact-tmi-ml-{ext}", "grid", ext, p, "mag_gridder", [], info) for ext, p in paths.items()]
    return {
        "artifacts": artifacts,
        "events": [{"type": "NODE_PROGRESS", "message": f"2-D microlevel removed {info.get('rms_removed_nT', 0):.3f} nT RMS corrugation."}],
    }


def grid_microleveller(payload: dict) -> dict:
    if not step_enabled(payload, "level", default=True):
        return skipped("grid_microleveller", "not in plan")
    from science.crs import CRS
    from science.gis import export_grid_bundle
    from science.magnetics import microlevel_grid

    node_id = "grid_microleveller"
    out = task_dir(payload)
    grid = _load_grid(out, "tmi_grid")
    params = _params(payload)
    spacing = params.get("lineSpacingM")
    azimuth = params.get("flightAzimuthDeg")
    qc_path = os.path.join(out, "leveling_qc.json")
    if os.path.isfile(qc_path):
        with open(qc_path, encoding="utf-8") as handle:
            level_qc = json.load(handle)
        spacing = spacing or level_qc.get("line_spacing_m")
        azimuth = azimuth if azimuth is not None else level_qc.get("flight_azimuth_deg")
    if not spacing:
        return skipped("grid_microleveller", "no line spacing (need ties/traverses or lineSpacingM)")
    leveled, info = microlevel_grid(
        grid,
        float(spacing),
        float(azimuth or 0.0),
        max_amp_nT=float(params.get("gridMicrolevelMaxAmpNT") or 6.0),
    )
    crs = CRS(grid.crs_epsg, f"EPSG:{grid.crs_epsg}", "projected")
    paths = export_grid_bundle(leveled, out, "tmi_microleveled", crs)
    np.savez(
        os.path.join(out, "tmi_microleveled.npz"),
        values=leveled.masked(),
        x0=leveled.x0,
        y0=leveled.y0,
        dx=leveled.dx,
        dy=leveled.dy,
        crs=grid.crs_epsg,
    )
    write_json(os.path.join(out, "grid_microlevel_qc.json"), info)
    write_lineage(out, node_id, info.get("formula", "Minty 1991 2-D microlevel"), info, ["tmi_grid"], list(paths.values()))
    artifacts = [make_artifact(f"artifact-tmi-ml-{ext}", "grid", ext, p, node_id, [], info) for ext, p in paths.items()]
    return {
        "artifacts": artifacts,
        "events": [{"type": "NODE_PROGRESS", "message": f"2-D microlevel removed {info.get('rms_removed_nT', 0):.3f} nT RMS corrugation."}],
    }


def mag_gridder(payload: dict) -> dict:
    if not step_enabled(payload, "grid", default=True):
        return skipped("mag_gridder", "not in plan")
    from science.crs import project_points
    from science.gis import export_grid_bundle
    from science.grid import minimum_curvature, suggest_spacing

    node_id = "mag_gridder"
    out = task_dir(payload)
    src = _find(out, "airborne_microleveled.csv", "airborne_leveled.csv", "airborne_heading_lag.csv", "airborne_igrf.csv", "airborne_corrected.csv")
    df = pd.read_csv(src)
    col = _value_column(df)
    east, north, crs = project_points(df["x"], df["y"])
    dx = _params(payload).get("cellSizeM")
    grid = minimum_curvature(
        east,
        north,
        df[col].to_numpy(),
        dx=float(dx) if dx else None,
        tension=float(_params(payload).get("gridTension") or 0.25),
        crs_epsg=crs.epsg,
        units="nT",
        name="tmi",
    )
    paths = export_grid_bundle(grid, out, "tmi_grid", crs)
    meta = {"crs_epsg": crs.epsg, "dx": grid.dx, "nx": grid.nx, "ny": grid.ny, **grid.metadata}
    write_json(os.path.join(out, "grid_qc.json"), meta)
    np.savez(os.path.join(out, "tmi_grid.npz"), values=grid.masked(), x0=grid.x0, y0=grid.y0, dx=grid.dx, dy=grid.dy, crs=crs.epsg)
    write_lineage(out, node_id, "Thin-plate spline = 2-D minimum curvature (Duchon 1977 / Briggs 1974)", meta, [src], list(paths.values()))
    artifacts = [
        make_artifact(f"artifact-grid-{ext}", "grid", ext, p, node_id, [src], meta) for ext, p in paths.items()
    ]
    events = [{"type": "NODE_PROGRESS", "message": f"Gridded {grid.nx}×{grid.ny} at {grid.dx:.2f} m, EPSG:{crs.epsg}."}]
    if step_enabled(payload, "level", default=True):
        extra = _run_grid_microlevel(payload, out, grid, crs)
        artifacts.extend(extra["artifacts"])
        events.extend(extra["events"])
    return {"artifacts": artifacts, "events": events}


def _load_grid(out: str, basename: str = "tmi_grid"):
    from science.grid import Grid

    npz = os.path.join(out, f"{basename}.npz")
    if not os.path.isfile(npz):
        raise FileNotFoundError(f"Missing {npz} — run mag_gridder first")
    data = np.load(npz)
    return Grid(
        values=np.array(data["values"], float),
        x0=float(data["x0"]),
        y0=float(data["y0"]),
        dx=float(data["dx"]),
        dy=float(data["dy"]),
        crs_epsg=int(data["crs"]),
        units="nT",
        name=basename,
    )


def rtp_filter(payload: dict) -> dict:
    if not step_enabled(payload, "rtp", default=True):
        return skipped("rtp_filter", "not in plan")
    from science.crs import CRS
    from science.fft_filters import reduction_to_equator, reduction_to_pole
    from science.gis import export_grid_bundle

    node_id = "rtp_filter"
    out = task_dir(payload)
    grid = _load_grid(out, _tmi_basename(out))
    params = _params(payload)
    inc = params.get("inclination")
    dec = params.get("declination")
    if inc is None or dec is None:
        qc_path = os.path.join(out, "igrf_qc.json")
        if os.path.isfile(qc_path):
            with open(qc_path, encoding="utf-8") as handle:
                igrf = json.load(handle)
            inc = igrf["mean_inclination_deg"]
            dec = igrf["mean_declination_deg"]
        else:
            raise ValueError("RTP needs inclination and declination (run igrf_corrector or pass parameters).")
    inc = float(inc)
    dec = float(dec)
    force = bool(params.get("forceRtp") or False)
    events = []
    try:
        rtp, qc = reduction_to_pole(grid, inc, dec, force=force)
    except ValueError as exc:
        events.append({"type": "QC_WARNING", "severity": "critical", "message": str(exc)})
        rte = reduction_to_equator(grid, inc, dec)
        paths = export_grid_bundle(rte, out, "rte_grid", CRS(grid.crs_epsg, f"EPSG:{grid.crs_epsg}", "projected"))
        np.savez(os.path.join(out, "rte_grid.npz"), values=rte.masked(), x0=rte.x0, y0=rte.y0, dx=rte.dx, dy=rte.dy, crs=grid.crs_epsg)
        write_json(os.path.join(out, "rtp_qc.json"), {"refused": True, "reason": str(exc), "wrote": "rte_grid"})
        return {
            "artifacts": [make_artifact("artifact-rte-1", "grid", "tif", paths["tif"], node_id, [], {"reason": str(exc)})],
            "events": events + [{"type": "NODE_PROGRESS", "message": "Wrote RTE instead of unstable RTP."}],
        }
    paths = export_grid_bundle(rtp, out, "rtp_grid", CRS(grid.crs_epsg, f"EPSG:{grid.crs_epsg}", "projected"))
    np.savez(os.path.join(out, "rtp_grid.npz"), values=rtp.masked(), x0=rtp.x0, y0=rtp.y0, dx=rtp.dx, dy=rtp.dy, crs=grid.crs_epsg)
    qc_dict = {
        "inclination": qc.inclination,
        "declination": qc.declination,
        "low_latitude": qc.low_latitude,
        "regularized": qc.regularized,
        "warning": qc.warning,
        "formula": "Blakely 1995 eq. 12.18; Li 2008 damper if |I|<15°",
    }
    write_json(os.path.join(out, "rtp_qc.json"), qc_dict)
    if qc.warning:
        events.append({"type": "QC_WARNING", "severity": "warning", "message": qc.warning})
    events.append({"type": "NODE_PROGRESS", "message": f"RTP at I={inc:.2f}°, D={dec:.2f}°."})
    artifacts = [make_artifact(f"artifact-rtp-{ext}", "grid", ext, p, node_id, [], qc_dict) for ext, p in paths.items()]
    return {"artifacts": artifacts, "events": events}


def fft_derivatives(payload: dict) -> dict:
    if not step_enabled(payload, "derivatives", default=True):
        return skipped("fft_derivatives", "not in plan")
    from science.crs import CRS
    from science.fft_filters import (
        butterworth_highpass,
        derivative_suite,
        pseudo_gravity,
        upward_continue,
    )
    from science.gis import export_grid_bundle

    node_id = "fft_derivatives"
    out = task_dir(payload)
    params = _params(payload)
    if os.path.isfile(os.path.join(out, "rtp_grid.npz")):
        source = "rtp_grid"
    elif os.path.isfile(os.path.join(out, "rte_grid.npz")):
        source = "rte_grid"
    else:
        source = _tmi_basename(out)
    grid = _load_grid(out, source)
    suite = derivative_suite(grid, downward_m=float(params.get("downwardHeightM") or 50.0))
    height = float(params.get("continuationHeightM") or 50.0)
    suite[f"uc_{int(height)}m"] = upward_continue(grid, height)
    suite["pseudo_gravity"] = pseudo_gravity(grid)
    hp_cut = params.get("highpassCutoffM")
    if hp_cut:
        suite[f"hp_{int(float(hp_cut))}m"] = butterworth_highpass(grid, float(hp_cut))
    artifacts = []
    crs = CRS(grid.crs_epsg, f"EPSG:{grid.crs_epsg}", "projected")
    products = []
    tmi_name = _tmi_basename(out)
    products.append({"id": "TMI", "file": tmi_name, "units": "nT", "formula": "Residual total magnetic intensity after reduction chain"})
    if source == "rtp_grid":
        products.append({"id": "RTP", "file": "rtp_grid", "units": "nT", "formula": "Blakely 1995 eq. 12.18; Li 2008 damper if |I|<15°"})
    if source == "rte_grid":
        products.append({"id": "RTE", "file": "rte_grid", "units": "nT", "formula": "Reduction to equator (low-latitude alternative to RTP)"})
    id_map = {
        "analytic_signal": ("AS", "nT/m", "Roest, Verhoef & Pilkington 1992 total gradient"),
        "1vd": ("1VD", "nT/m", "Blakely 1995 first vertical derivative"),
        "2vd": ("2VD", "nT/m²", "Blakely 1995 second vertical derivative"),
        "thd": ("THD", "nT/m", "Total horizontal derivative"),
        "tilt": ("TILT", "deg", "Miller & Singh 1994 tilt angle"),
        "pseudo_gravity": ("PG", "nT·m", "Baranov 1957 pseudo-gravity"),
    }
    for name, g in suite.items():
        paths = export_grid_bundle(g, out, name, crs)
        np.savez(os.path.join(out, f"{name}.npz"), values=g.masked(), x0=g.x0, y0=g.y0, dx=g.dx, dy=g.dy, crs=grid.crs_epsg)
        artifacts.append(make_artifact(f"artifact-{name}-tif", "grid", "tif", paths["tif"], node_id))
        label, units, formula = id_map.get(name, (name.upper(), g.units, "Blakely 1995 FFT operator"))
        products.append({"id": label, "file": name, "units": units, "formula": formula})
    igrf = {}
    igrf_path = os.path.join(out, "igrf_qc.json")
    if os.path.isfile(igrf_path):
        with open(igrf_path, encoding="utf-8") as handle:
            igrf = json.load(handle)
    manifest = {
        "name": "G-AID MAGMAP",
        "source_grid": source,
        "inclination_deg": igrf.get("mean_inclination_deg"),
        "declination_deg": igrf.get("mean_declination_deg"),
        "products": products,
        "citations": [
            "Blakely (1995) Potential Theory in Gravity and Magnetic Applications, ch. 12",
            "Roest, Verhoef & Pilkington (1992) Magnetic interpretation using the 3-D analytic signal",
            "Miller & Singh (1994) Potential field tilt",
            "Baranov (1957) A new method for interpretation of aeromagnetic maps",
            "Li (2008) Magnetic reduction-to-the-pole at low latitudes",
        ],
    }
    write_json(os.path.join(out, "magmap_manifest.json"), manifest)
    write_lineage(
        out,
        node_id,
        "G-AID MAGMAP: Blakely 1995 FFT suite on RTP/TMI",
        {"source": source},
        [source],
        [a["path"] for a in artifacts],
    )
    return {
        "artifacts": artifacts,
        "events": [{"type": "NODE_PROGRESS", "message": f"MAGMAP wrote {len(suite)} products from {source}."}],
    }


def map_composer(payload: dict) -> dict:
    if not (step_enabled(payload, "gis", default=True) or step_enabled(payload, "grid", default=True)):
        return skipped("map_composer", "not in plan")
    from science.map_figure import write_potential_field_map

    node_id = "map_composer"
    out = task_dir(payload)
    survey = str(_params(payload).get("projectName") or "")
    specs = [
        (_tmi_basename(out), "TMI residual", "nT", "RdBu_r"),
        ("rtp_grid", "RTP", "nT", "RdBu_r"),
        ("rte_grid", "RTE", "nT", "RdBu_r"),
        ("1vd", "First vertical derivative", "nT/m", "RdBu_r"),
        ("analytic_signal", "Analytic signal", "nT/m", "cividis"),
        ("thd", "Total horizontal derivative", "nT/m", "cividis"),
        ("tilt", "Tilt angle", "deg", "RdBu_r"),
    ]
    artifacts = []
    written = []
    for basename, product, units, cmap in specs:
        npz = os.path.join(out, f"{basename}.npz")
        if not os.path.isfile(npz):
            continue
        grid = _load_grid(out, basename)
        png = os.path.join(out, f"map_{basename}.png")
        write_potential_field_map(
            grid,
            png,
            title="",
            product=product,
            units=units,
            survey=survey,
            cmap=cmap,
            hillshade=True,
        )
        artifacts.append(make_artifact(f"artifact-map-{basename}", "plot", "png", png, node_id))
        written.append(product)
    if not artifacts:
        return skipped("map_composer", "no grids to map")
    return {
        "artifacts": artifacts,
        "events": [{"type": "NODE_PROGRESS", "message": f"Wrote report maps: {', '.join(written)}."}],
    }


def gis_export(payload: dict) -> dict:
    if not step_enabled(payload, "gis", default=True):
        return skipped("gis_export", "not in plan")
    from science.gis import write_geojson_points

    node_id = "gis_export"
    out = task_dir(payload)
    artifacts = []
    events = []
    try:
        src = _find(out, "airborne_microleveled.csv", "airborne_leveled.csv", "airborne_igrf.csv", "airborne_corrected.csv")
        df = pd.read_csv(src)
        col = _value_column(df)
        path = os.path.join(out, "flight_path.geojson")
        props = [{"value": float(v), "line_id": str(df["line_id"].iloc[i]) if "line_id" in df.columns else ""} for i, v in enumerate(df[col])]
        write_geojson_points(df["x"], df["y"], props, path, crs_epsg=4326)
        artifacts.append(make_artifact("artifact-flight-geojson", "vector", "geojson", path, node_id, [src]))
        events.append({"type": "NODE_PROGRESS", "message": "Wrote flight_path.geojson (EPSG:4326)."})
    except FileNotFoundError as exc:
        events.append({"type": "QC_WARNING", "severity": "warning", "message": str(exc)})
    maps = map_composer(payload)
    artifacts.extend(maps.get("artifacts") or [])
    events.extend(maps.get("events") or [])
    return {"artifacts": artifacts, "events": events}


def lineament_extractor(payload: dict) -> dict:
    if not step_enabled(payload, "lineaments", default=True):
        return skipped("lineament_extractor", "not in plan")
    from science.gis import write_geojson_lines
    from science.lineaments import extract_lineaments

    node_id = "lineament_extractor"
    out = task_dir(payload)
    name = "thd" if os.path.isfile(os.path.join(out, "thd.npz")) else "tmi_grid"
    grid = _load_grid(out, name)
    result = extract_lineaments(grid, percentile=float(_params(payload).get("lineamentPercentile") or 85))
    path = os.path.join(out, "lineaments.geojson")
    write_geojson_lines(
        [ln["coordinates"] for ln in result["lineaments"]],
        path,
        result["lineaments"],
        crs_epsg=grid.crs_epsg,
    )
    write_json(os.path.join(out, "lineaments_qc.json"), {k: v for k, v in result.items() if k != "lineaments"} | {"n": len(result["lineaments"])})
    return {
        "artifacts": [make_artifact("artifact-lineaments", "vector", "geojson", path, node_id)],
        "events": [{"type": "NODE_PROGRESS", "message": f"Extracted {len(result['lineaments'])} lineaments."}],
    }


def euler_deconvolution_node(payload: dict) -> dict:
    if not step_enabled(payload, "derivatives", default=True):
        return skipped("euler_deconvolution", "not in plan")
    from science.euler import euler_deconvolution
    from science.gis import write_geojson_points

    node_id = "euler_deconvolution"
    out = task_dir(payload)
    name = "rtp_grid" if os.path.isfile(os.path.join(out, "rtp_grid.npz")) else "tmi_grid"
    grid = _load_grid(out, name)
    result = euler_deconvolution(
        grid,
        structural_index=float(_params(payload).get("structuralIndex") or 1.0),
        window=int(_params(payload).get("eulerWindow") or 10),
    )
    sols = result["solutions"]
    csv_path = os.path.join(out, "euler_solutions.csv")
    pd.DataFrame(sols).to_csv(csv_path, index=False) if sols else pd.DataFrame(columns=["x", "y", "depth_m"]).to_csv(csv_path, index=False)
    if sols:
        write_geojson_points(
            [s["x"] for s in sols],
            [s["y"] for s in sols],
            sols,
            os.path.join(out, "euler_solutions.geojson"),
            crs_epsg=grid.crs_epsg,
        )
    write_json(os.path.join(out, "euler_qc.json"), {k: v for k, v in result.items() if k != "solutions"})
    return {
        "artifacts": [make_artifact("artifact-euler", "vector", "csv", csv_path, node_id)],
        "events": [{"type": "NODE_PROGRESS", "message": f"Euler deconvolution: {len(sols)} solutions (SI={result['structural_index']})."}],
    }


def gravity_ingest(payload: dict) -> dict:
    from kernels.gravity import gravity_ingest as impl
    return impl(payload)


def gravity_freeair(payload: dict) -> dict:
    from kernels.gravity import gravity_freeair as impl
    return impl(payload)


def gravity_bouguer(payload: dict) -> dict:
    from kernels.gravity import gravity_bouguer as impl
    return impl(payload)


def gravity_terrain(payload: dict) -> dict:
    from kernels.gravity import gravity_terrain as impl
    return impl(payload)


def grav_gridder(payload: dict) -> dict:
    from kernels.gravity import grav_gridder as impl
    return impl(payload)


def grav_gis_export(payload: dict) -> dict:
    from kernels.gravity import grav_gis_export as impl
    return impl(payload)


def grav_interpret(payload: dict) -> dict:
    from kernels.gravity import grav_interpret as impl
    return impl(payload)


def gravity_reduce(payload: dict) -> dict:
    raise ValueError(
        "gravity_reduce is not on the live DAG. Use gravity_freeair/gravity_bouguer. "
        "Density is never defaulted to 2.67."
    )


def regional_residual(payload: dict) -> dict:
    from kernels.gravity import regional_residual as impl
    return impl(payload)


def ert_ingest(payload: dict) -> dict:
    from kernels.ert import ert_ingest as impl
    return impl(payload)


def ert_pseudosection(payload: dict) -> dict:
    from kernels.ert import ert_pseudosection as impl
    return impl(payload)


def ert_invert(payload: dict) -> dict:
    from kernels.ert import ert_invert as impl
    return impl(payload)


def ert_gis_export(payload: dict) -> dict:
    from kernels.ert import ert_gis_export as impl
    return impl(payload)


def ert_interpret(payload: dict) -> dict:
    from kernels.ert import ert_interpret as impl
    return impl(payload)


def rad_ingest(payload: dict) -> dict:
    from kernels.radiometrics import rad_ingest as impl
    return impl(payload)


def rad_grid(payload: dict) -> dict:
    from kernels.radiometrics import rad_grid as impl
    return impl(payload)


def rad_ternary(payload: dict) -> dict:
    from kernels.radiometrics import rad_ternary as impl
    return impl(payload)


def rad_ratios(payload: dict) -> dict:
    from kernels.radiometrics import rad_ratios as impl
    return impl(payload)


def rad_gis_export(payload: dict) -> dict:
    from kernels.radiometrics import rad_gis_export as impl
    return impl(payload)


def rad_interpret(payload: dict) -> dict:
    from kernels.radiometrics import rad_interpret as impl
    return impl(payload)


def radiometric_correct(payload: dict) -> dict:
    raise ValueError(
        "radiometric_correct is not a live capability. Height correction, stripping, NASVD, "
        "dead-time, background, and concentration conversion are not implemented as a supported "
        "pack. Use rad.ingest for already-corrected G-AID RAD 1.0 tables."
    )


def seismic_process(payload: dict) -> dict:
    if not step_enabled(payload, "seismic", default=True):
        return skipped("seismic_process", "not in plan")
    from science.seismic import agc, bandpass, kirchhoff_time_migrate_2d, nmo_correct, pick_horizon, power_spectral_density, read_segy
    from science.gis import write_ascii_grid
    from science.grid import Grid

    node_id = "seismic_process"
    out = task_dir(payload)
    src = _params(payload).get("inputPath")
    if not src:
        raise FileNotFoundError("Seismic processing needs parameters.inputPath to a SEG-Y file")
    segy = read_segy(src)
    params = _params(payload)
    traces = segy.traces
    f_low = float(params.get("fLow") or 8.0)
    f_high = float(params.get("fHigh") or 80.0)
    traces_bp = bandpass(traces, segy.dt_s, f_low, f_high)
    traces_agc = agc(traces_bp, int(params.get("agcWindow") or 128))
    vel = params.get("nmoVelocityMs")
    nmo = nmo_correct(traces_agc, segy.offsets_m, segy.dt_s, float(vel)) if vel else None
    psd = power_spectral_density(traces_bp, segy.dt_s, int(params.get("window_length") or 256))
    np.savez(os.path.join(out, "seismic_processed.npz"), traces=traces_agc, dt=segy.dt_s, offsets=segy.offsets_m, nmo=nmo if nmo is not None else np.array([]))
    section = traces_agc
    ntr, ns = section.shape
    step_t = max(1, ntr // 400)
    step_s = max(1, ns // 500)
    preview = section[::step_t, ::step_s]
    grid = Grid(values=preview.T, x0=0.0, y0=0.0, dx=float(np.nanmedian(np.diff(segy.offsets_m))) if len(segy.offsets_m) > 1 else 1.0, dy=segy.dt_s * step_s, crs_epsg=0, units="amp", name="seismic_section")
    write_ascii_grid(grid, os.path.join(out, "seismic_section.asc"))
    seed_tr = int(ntr // 2)
    seed_s = int(np.argmax(np.abs(section[seed_tr])))
    picks = pick_horizon(section, seed_tr, seed_s)
    pd.DataFrame({"trace": np.arange(ntr), "sample": picks["sample"], "confidence": picks["confidence"]}).to_csv(os.path.join(out, "horizon_picks.csv"), index=False)
    events = [{"type": "NODE_PROGRESS", "message": f"SEG-Y {segy.n_traces} traces, dominant f={psd['dominant_frequency_hz']:.1f} Hz."}]
    vel_mig = params.get("migrateVelocityMs") or vel
    if vel_mig and ntr * ns <= 120000:
        dx = float(np.nanmedian(np.diff(segy.offsets_m))) if len(segy.offsets_m) > 1 else 10.0
        migrated = kirchhoff_time_migrate_2d(section[:: max(1, ntr // 80), :: max(1, ns // 200)], segy.dt_s * max(1, ns // 200), dx * max(1, ntr // 80), float(vel_mig))
        np.savez(os.path.join(out, "seismic_migrated.npz"), traces=migrated)
        events.append({"type": "NODE_PROGRESS", "message": "Kirchhoff time migration written (downsampled)."})
    elif vel_mig:
        events.append({"type": "QC_WARNING", "severity": "warning", "message": "Section too large for Kirchhoff in this run; set migrateVelocityMs on a cropped line."})
    qc = {
        "n_traces": segy.n_traces,
        "ns": segy.ns,
        "dt_s": segy.dt_s,
        "format_code": segy.format_code,
        "psd": psd,
        "nmo_applied": vel is not None,
        "horizon": {"seed_trace": seed_tr, "seed_sample": seed_s, **{k: v for k, v in picks.items() if k != "sample"}},
        "formula": "Butterworth bandpass + RMS AGC; NMO t^2=t0^2+x^2/v^2 if velocity given; Sheriff & Geldart horizon track",
    }
    path = write_json(os.path.join(out, "seismic_qc.json"), qc)
    return {"artifacts": [make_artifact("artifact-segy", "seismic", "json", path, node_id, [src], qc)], "events": events}


def gpr_process(payload: dict) -> dict:
    if not step_enabled(payload, "gpr", default=True):
        return skipped("gpr_process", "not in plan")
    from formats import parse_dzt
    from science.gpr import process_section
    from science.gis import write_ascii_grid
    from science.grid import Grid

    node_id = "gpr_process"
    out = task_dir(payload)
    src = _params(payload).get("inputPath")
    if not src:
        raise FileNotFoundError("GPR processing needs parameters.inputPath (.dzt)")
    dzt = parse_dzt(src)
    vel = _params(payload).get("velocityMs")
    result = process_section(dzt["traces"], dzt["dt_s"], dzt["dx_m"], float(vel) if vel else None)
    np.savez(
        os.path.join(out, "gpr_processed.npz"),
        dewow=result["dewow"],
        bandpassed=result["bandpassed"],
        migrated=result["migrated"] if result["migrated"] is not None else np.array([]),
        dt=dzt["dt_s"],
        dx=dzt["dx_m"],
    )
    section = result["bandpassed"]
    ntr, ns = np.atleast_2d(section).shape
    step_t = max(1, ntr // 400)
    step_s = max(1, ns // 500)
    preview = np.atleast_2d(section)[::step_t, ::step_s]
    write_ascii_grid(
        Grid(values=preview.T, x0=0.0, y0=0.0, dx=float(dzt["dx_m"]) * step_t, dy=float(dzt["dt_s"]) * step_s, crs_epsg=0, units="amp", name="gpr_section"),
        os.path.join(out, "gpr_section.asc"),
    )
    qc = {"time_zero_sample": result["time_zero_sample"], "n_traces": dzt["n_traces"], "dt_s": dzt["dt_s"], "formula": result["formula"]}
    path = write_json(os.path.join(out, "gpr_qc.json"), qc)
    return {"artifacts": [make_artifact("artifact-gpr", "section", "json", path, node_id, [src])], "events": [{"type": "NODE_PROGRESS", "message": f"GPR {dzt['n_traces']} traces processed."}]}


def las_ingest(payload: dict) -> dict:
    from formats import parse_las

    node_id = "las_ingest"
    out = task_dir(payload)
    src = _params(payload).get("inputPath")
    if not src:
        raise FileNotFoundError("LAS ingest needs parameters.inputPath")
    parsed = parse_las(src)
    path = os.path.join(out, "well_log.csv")
    parsed["data"].to_csv(path, index=False)
    write_json(os.path.join(out, "well_log_meta.json"), {"well": parsed["well"], "curves": parsed["curves"], "null": parsed["null"]})
    return {"artifacts": [make_artifact("artifact-las", "well-log", "csv", path, node_id, [src])], "events": [{"type": "NODE_PROGRESS", "message": f"LAS well '{parsed['well']}' curves={parsed['curves']}."}]}


def crs_reproject(payload: dict) -> dict:
    from science.crs import project_points

    node_id = "crs_reproject"
    out = task_dir(payload)
    src = _params(payload).get("inputPath") or _find(out, "airborne_corrected.csv", "xyz_canonical.csv")
    df = pd.read_csv(src)
    target = int(_params(payload).get("target_crs") or _params(payload).get("targetCrs") or 0)
    east, north, crs = project_points(df["x"], df["y"], source_epsg=4326, target_epsg=target or None)
    df["x_proj"] = east
    df["y_proj"] = north
    df["crs_epsg"] = crs.epsg
    path = os.path.join(out, "reprojected.csv")
    df.to_csv(path, index=False)
    return {"artifacts": [make_artifact("artifact-crs", "processed_dataset", "csv", path, node_id, [src], {"epsg": crs.epsg})], "events": [{"type": "NODE_PROGRESS", "message": f"Reprojected to EPSG:{crs.epsg}."}]}


def xyz_ingest(payload: dict) -> dict:
    from formats import parse_geosoft_xyz

    node_id = "xyz_ingest"
    out = task_dir(payload)
    src = _params(payload).get("inputPath")
    if not src:
        raise FileNotFoundError("XYZ ingest needs parameters.inputPath")
    df = parse_geosoft_xyz(src)
    path = os.path.join(out, "xyz_canonical.csv")
    df.to_csv(path, index=False)
    return {"artifacts": [make_artifact("artifact-xyz", "raw_dataset", "csv", path, node_id, [src])], "events": [{"type": "NODE_PROGRESS", "message": f"XYZ {len(df)} samples."}]}
