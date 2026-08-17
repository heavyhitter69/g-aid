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
        "mag_gridder": mag_gridder,
        "rtp_filter": rtp_filter,
        "fft_derivatives": fft_derivatives,
        "gis_export": gis_export,
        "lineament_extractor": lineament_extractor,
        "gravity_reduce": gravity_reduce,
        "regional_residual": regional_residual,
        "ert_pseudosection": ert_pseudosection,
        "ert_invert": ert_invert,
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
    leveled, info = tie_line_level(work, radius_m=float(_params(payload).get("tieRadiusM") or 15.0))
    leveled["leveled_magnetic_field"] = leveled["magnetic_field"]
    # restore lon/lat for GIS if original was geographic
    leveled["easting"] = east
    leveled["northing"] = north
    leveled["x"] = df["x"].to_numpy()
    leveled["y"] = df["y"].to_numpy()
    path = os.path.join(out, "airborne_leveled.csv")
    leveled.to_csv(path, index=False)
    qc_path = write_json(os.path.join(out, "leveling_qc.json"), info)
    write_lineage(out, node_id, "Mittal 1984 least-squares mis-tie", info, [src], [path])
    events = [{"type": "NODE_PROGRESS", "message": f"Tie-line levelling: {info}"}]
    return {
        "artifacts": [
            make_artifact("artifact-level-1", "processed_dataset", "csv", path, node_id, [src], info),
            make_artifact("artifact-level-qc-1", "qc_report", "json", qc_path, node_id, [src]),
        ],
        "events": events,
    }


def mag_gridder(payload: dict) -> dict:
    if not step_enabled(payload, "grid", default=True):
        return skipped("mag_gridder", "not in plan")
    from science.crs import project_points
    from science.gis import export_grid_bundle
    from science.grid import minimum_curvature, suggest_spacing

    node_id = "mag_gridder"
    out = task_dir(payload)
    src = _find(out, "airborne_leveled.csv", "airborne_heading_lag.csv", "airborne_igrf.csv", "airborne_corrected.csv")
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
    return {"artifacts": artifacts, "events": [{"type": "NODE_PROGRESS", "message": f"Gridded {grid.nx}×{grid.ny} at {grid.dx:.2f} m, EPSG:{crs.epsg}."}]}


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
    grid = _load_grid(out)
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
    from science.fft_filters import derivative_suite, upward_continue
    from science.gis import export_grid_bundle

    node_id = "fft_derivatives"
    out = task_dir(payload)
    basename = "rtp_grid" if os.path.isfile(os.path.join(out, "rtp_grid.npz")) else "tmi_grid"
    grid = _load_grid(out, basename)
    suite = derivative_suite(grid)
    height = float(_params(payload).get("continuationHeightM") or 50.0)
    suite[f"uc_{int(height)}m"] = upward_continue(grid, height)
    artifacts = []
    crs = CRS(grid.crs_epsg, f"EPSG:{grid.crs_epsg}", "projected")
    for name, g in suite.items():
        paths = export_grid_bundle(g, out, name, crs)
        np.savez(os.path.join(out, f"{name}.npz"), values=g.masked(), x0=g.x0, y0=g.y0, dx=g.dx, dy=g.dy, crs=grid.crs_epsg)
        artifacts.append(make_artifact(f"artifact-{name}-tif", "grid", "tif", paths["tif"], node_id))
    write_lineage(out, node_id, "Blakely 1995 FFT derivatives; Roest et al. 1992 analytic signal", {"source": basename}, [basename], [a["path"] for a in artifacts])
    return {"artifacts": artifacts, "events": [{"type": "NODE_PROGRESS", "message": f"Wrote {len(suite)} derivative grids from {basename}."}]}


def gis_export(payload: dict) -> dict:
    if not step_enabled(payload, "gis", default=True):
        return skipped("gis_export", "not in plan")
    from science.gis import write_geojson_points

    node_id = "gis_export"
    out = task_dir(payload)
    artifacts = []
    events = []
    try:
        src = _find(out, "airborne_leveled.csv", "airborne_igrf.csv", "airborne_corrected.csv")
        df = pd.read_csv(src)
        col = _value_column(df)
        path = os.path.join(out, "flight_path.geojson")
        props = [{"value": float(v), "line_id": str(df["line_id"].iloc[i]) if "line_id" in df.columns else ""} for i, v in enumerate(df[col])]
        write_geojson_points(df["x"], df["y"], props, path, crs_epsg=4326)
        artifacts.append(make_artifact("artifact-flight-geojson", "vector", "geojson", path, node_id, [src]))
        events.append({"type": "NODE_PROGRESS", "message": "Wrote flight_path.geojson (EPSG:4326)."})
    except FileNotFoundError as exc:
        events.append({"type": "QC_WARNING", "severity": "warning", "message": str(exc)})
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


def gravity_reduce(payload: dict) -> dict:
    if not step_enabled(payload, "gravity", default=True):
        return skipped("gravity_reduce", "not in plan")
    from science.gravity import latitude_free_air_bouguer

    node_id = "gravity_reduce"
    out = task_dir(payload)
    src = _params(payload).get("inputPath") or _find(out, "gravity_canonical.csv", "xyz_canonical.csv")
    df = pd.read_csv(src)
    lat_col = "y" if "y" in df.columns else None
    if lat_col is None:
        raise ValueError("Gravity reduction needs latitude in column y")
    gcol = "value" if "value" in df.columns else "g_obs"
    hcol = "z" if "z" in df.columns else "height"
    density = float(_params(payload).get("density") or 2.67)
    reduced = latitude_free_air_bouguer(df[gcol], df[lat_col], df[hcol], density_gcc=density)
    for key, val in reduced.items():
        if key != "density_gcc":
            df[key] = val
    path = os.path.join(out, "gravity_reduced.csv")
    df.to_csv(path, index=False)
    write_json(os.path.join(out, "gravity_qc.json"), {"density_gcc": density, "formula": "Somigliana + 0.3086h − 2πGρh + Bullard B (Moritz 2000; LaFehr 1991)"})
    return {
        "artifacts": [make_artifact("artifact-grav-1", "processed_dataset", "csv", path, node_id, [src])],
        "events": [{"type": "NODE_PROGRESS", "message": f"Bouguer reduction at {density} g/cm³."}],
    }


def regional_residual(payload: dict) -> dict:
    if not step_enabled(payload, "residual", default=True):
        return skipped("regional_residual", "not in plan")
    from science.crs import CRS, project_points
    from science.fft_filters import upward_continue
    from science.gis import export_grid_bundle
    from science.gravity import polynomial_regional
    from science.grid import minimum_curvature

    node_id = "regional_residual"
    out = task_dir(payload)
    src = _find(out, "gravity_reduced.csv")
    df = pd.read_csv(src)
    east, north, crs = project_points(df["x"], df["y"])
    grid = minimum_curvature(east, north, df["bouguer_mgal"].to_numpy(), crs_epsg=crs.epsg, units="mGal", name="bouguer")
    method = str(_params(payload).get("method") or "upward_continuation")
    if method == "polynomial":
        regional, residual = polynomial_regional(grid, order=int(_params(payload).get("polyOrder") or 2))
    else:
        height = float(_params(payload).get("continuation_height") or _params(payload).get("continuationHeightM") or 5000)
        regional = upward_continue(grid, height)
        residual = grid.copy_with(grid.masked() - regional.masked(), name="residual", units="mGal")
    artifacts = []
    for g in (grid, regional, residual):
        paths = export_grid_bundle(g, out, g.name, crs)
        artifacts.append(make_artifact(f"artifact-{g.name}", "grid", "tif", paths["tif"], node_id))
    return {"artifacts": artifacts, "events": [{"type": "NODE_PROGRESS", "message": f"Regional-residual via {method}."}]}


def ert_pseudosection(payload: dict) -> dict:
    if not step_enabled(payload, "ert", default=True):
        return skipped("ert_pseudosection", "not in plan")
    from science.ert import parse_res2dinv_dat, pseudosection_xyz

    node_id = "ert_pseudosection"
    out = task_dir(payload)
    src = _params(payload).get("inputPath")
    if not src:
        raise FileNotFoundError("ERT pseudosection needs parameters.inputPath to a Res2DInv .dat")
    parsed = parse_res2dinv_dat(src)
    x, z, rho = pseudosection_xyz(parsed["measurements"])
    df = pd.DataFrame({"x": x, "z": z, "rhoa_ohm_m": rho, "a": [m["a"] for m in parsed["measurements"]], "n": [m["n"] for m in parsed["measurements"]]})
    path = os.path.join(out, "ert_pseudosection.csv")
    df.to_csv(path, index=False)
    write_json(os.path.join(out, "ert_survey.json"), {"title": parsed["title"], "array": parsed["array"], "n": len(df), "formula": "ρa = K ΔV/I (Telford et al. 1990); pseudo-depth n·a/2"})
    return {"artifacts": [make_artifact("artifact-ert-pseudo", "section", "csv", path, node_id, [src])], "events": [{"type": "NODE_PROGRESS", "message": f"Pseudosection {len(df)} points, array={parsed['array']}."}]}


def ert_invert(payload: dict) -> dict:
    if not step_enabled(payload, "ertInvert", default=True):
        return skipped("ert_invert", "not in plan")
    from science.ert import invert_2d_smooth, occam_1d, parse_res2dinv_dat

    node_id = "ert_invert"
    out = task_dir(payload)
    src = _params(payload).get("inputPath")
    if not src:
        raise FileNotFoundError("ERT inversion needs parameters.inputPath")
    parsed = parse_res2dinv_dat(src)
    mode = str(_params(payload).get("ertMode") or "2d")
    if mode == "1d":
        m = parsed["measurements"]
        result = occam_1d(np.array([x["a"] * x["n"] for x in m]), np.array([x["rhoa"] for x in m]))
        path = write_json(os.path.join(out, "ert_1d_model.json"), result)
    else:
        result = invert_2d_smooth(
            parsed["measurements"],
            max_iter=int(_params(payload).get("max_iterations") or 8),
            lam=float(_params(payload).get("damping_factor") or 0.2),
        )
        path = write_json(os.path.join(out, "ert_2d_model.json"), result)
        # also write CSV section
        z = result["z_m"]
        x = result["x_m"]
        rho = np.array(result["resistivity_ohm_m"])
        rows = [{"x": x[j], "z": z[i], "resistivity_ohm_m": float(rho[i, j])} for i in range(len(z)) for j in range(len(x))]
        pd.DataFrame(rows).to_csv(os.path.join(out, "ert_2d_model.csv"), index=False)
    return {
        "artifacts": [make_artifact("artifact-ert-inv", "section", "json", path, node_id, [src], {"misfit_percent": result.get("misfit_percent") or result.get("rms")})],
        "events": [{"type": "NODE_PROGRESS", "message": f"ERT inversion misfit={result.get('misfit_percent') or result.get('rms')}."}],
    }


def seismic_process(payload: dict) -> dict:
    if not step_enabled(payload, "seismic", default=True):
        return skipped("seismic_process", "not in plan")
    from science.seismic import agc, bandpass, nmo_correct, power_spectral_density, read_segy

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
    qc = {
        "n_traces": segy.n_traces,
        "ns": segy.ns,
        "dt_s": segy.dt_s,
        "format_code": segy.format_code,
        "psd": psd,
        "nmo_applied": vel is not None,
        "formula": "Butterworth bandpass + RMS AGC; NMO t^2=t0^2+x^2/v^2 if velocity given",
    }
    path = write_json(os.path.join(out, "seismic_qc.json"), qc)
    return {"artifacts": [make_artifact("artifact-segy", "seismic", "json", path, node_id, [src], qc)], "events": [{"type": "NODE_PROGRESS", "message": f"SEG-Y {segy.n_traces} traces, dominant f={psd['dominant_frequency_hz']:.1f} Hz."}]}


def radiometric_correct(payload: dict) -> dict:
    if not step_enabled(payload, "radiometrics", default=True):
        return skipped("radiometric_correct", "not in plan")
    from science.radiometrics import MU_K, MU_TC, MU_TH, MU_U, height_correct, nasvd, strip_windows

    node_id = "radiometric_correct"
    out = task_dir(payload)
    src = _params(payload).get("inputPath") or _find(out, "radiometric_canonical.csv")
    df = pd.read_csv(src)
    h = df["z"] if "z" in df.columns else df.get("height", 0)
    href = float(_params(payload).get("hRefM") or 0.0)
    events = []
    if "tc" in df.columns:
        df["tc_hc"] = height_correct(df["tc"], h, MU_TC, href)
    for col, mu in (("k", MU_K), ("u", MU_U), ("th", MU_TH)):
        if col in df.columns:
            df[f"{col}_hc"] = height_correct(df[col], h, mu, href)
    if all(c in df.columns for c in ("k", "u", "th")):
        stripped = strip_windows(df.get("k_hc", df["k"]), df.get("u_hc", df["u"]), df.get("th_hc", df["th"]))
        df["k_stripped"] = stripped["k"]
        df["u_stripped"] = stripped["u"]
        df["th_stripped"] = stripped["th"]
    spec_cols = [c for c in df.columns if str(c).startswith("ch")]
    if len(spec_cols) >= 16:
        result = nasvd(df[spec_cols].to_numpy(), int(_params(payload).get("nasvdComponents") or 8))
        write_json(os.path.join(out, "nasvd_qc.json"), {k: v for k, v in result.items() if k != "reconstructed"})
        events.append({"type": "NODE_PROGRESS", "message": "NASVD reconstruction written."})
    path = os.path.join(out, "radiometric_corrected.csv")
    df.to_csv(path, index=False)
    return {"artifacts": [make_artifact("artifact-rad-1", "processed_dataset", "csv", path, node_id, [src])], "events": events + [{"type": "NODE_PROGRESS", "message": "Radiometric height correction (IAEA TECDOC-1363)."}]}


def gpr_process(payload: dict) -> dict:
    if not step_enabled(payload, "gpr", default=True):
        return skipped("gpr_process", "not in plan")
    from formats import parse_dzt
    from science.gpr import process_section

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
