"""Gravity kernels on the generic DAG. Density, datum, and units are never assumed."""

from __future__ import annotations

import json
import os

import numpy as np
import pandas as pd

from science.artifacts import make_artifact, task_dir, write_json, write_lineage


def _attach_validation_copy(out: str, filename: str) -> str | None:
    src = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "docs", "validation", "results", filename))
    if not os.path.isfile(src):
        return None
    dest = os.path.join(out, filename)
    with open(src, encoding="utf-8") as handle:
        payload = json.load(handle)
    return write_json(dest, payload)


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


def _bound_gravity(params: dict) -> list[dict]:
    items = params.get("catalogInputs") or params.get("catalog_inputs") or []
    if not isinstance(items, list) or not items:
        raise ValueError("gravity_ingest requires parameters.catalogInputs from the frozen plan.")
    out = []
    for item in items:
        if not isinstance(item, dict):
            continue
        adapter = str(item.get("adapterId") or item.get("kind") or "").lower()
        if adapter not in {"gravity-xyz", "gravity-csv"}:
            continue
        out.append(item)
    if not out:
        raise ValueError("No bound gravity-xyz or gravity-csv catalog records. I will not search by extension.")
    return out


def gravity_ingest(payload: dict) -> dict:
    from formats.gravity import parse_gravity_table

    node_id = "gravity_ingest"
    out = _out(payload)
    params = _params(payload)
    mapping = params.get("gravityMapping") or params.get("columnMapping")
    frames = []
    qc_files = []
    events = []
    for item in _bound_gravity(params):
        rel = str(item.get("path") or "")
        filepath = item.get("absPath") or item.get("abs_path") or rel
        if filepath and not os.path.isabs(str(filepath)):
            filepath = os.path.abspath(os.path.join(str(params.get("baseDir") or ""), str(filepath)))
        item_mapping = item.get("columnMapping") or item.get("column_mapping") or mapping
        df, qc = parse_gravity_table(
            str(filepath),
            mapping=item_mapping,
            overrides={
                "crsEpsg": params.get("crsEpsg"),
                "gravityUnits": params.get("gravityUnits") or item.get("units"),
                "elevationDatum": params.get("elevationDatum") or item.get("elevationDatum") or item.get("elevation_datum"),
            },
        )
        df["catalog_id"] = item.get("catalogId") or item.get("catalog_id")
        frames.append(df)
        qc["catalogId"] = df["catalog_id"].iloc[0]
        qc_files.append(qc)
        events.append({"type": "NODE_PROGRESS", "message": f"Read {os.path.basename(str(filepath))} ({len(df)} gravity stations)."})
    combined = pd.concat(frames, ignore_index=True)
    path = os.path.join(out, "gravity_canonical.csv")
    combined.to_csv(path, index=False)
    qc_path = write_json(
        os.path.join(out, "gravity_ingest_qc.json"),
        {
            "files": qc_files,
            "n": int(len(combined)),
            "mapping": mapping,
            "assumptions": "None. CRS, units, and mapping came from the file contract or a reviewed plan mapping.",
        },
    )
    write_lineage(out, node_id, "G-AID gravity ingest contract 1.0", {"mapping": mapping}, [f["path"] for f in qc_files], [path, qc_path])
    return {
        "artifacts": [
            make_artifact("artifact-grav-canonical", "raw_dataset", "csv", path, node_id),
            make_artifact("artifact-grav-ingest-qc", "qc_report", "json", qc_path, node_id),
        ],
        "events": events,
    }


def _latitudes(df: pd.DataFrame, params: dict) -> np.ndarray:
    if "latitude_deg" in df.columns and np.isfinite(pd.to_numeric(df["latitude_deg"], errors="coerce")).any():
        return pd.to_numeric(df["latitude_deg"], errors="coerce").to_numpy()
    epsg = int(df["crs_epsg"].iloc[0]) if "crs_epsg" in df.columns and len(df) else 0
    if epsg == 4326:
        return df["y"].to_numpy(dtype=float)
    lat = params.get("surveyLatitude")
    if lat is None:
        raise ValueError(
            "Somigliana needs geodetic latitude. Projected X/Y is not latitude. Pass parameters.surveyLatitude."
        )
    return np.full(len(df), float(lat))


def gravity_freeair(payload: dict) -> dict:
    from science.gravity import free_air_correction, somigliana_normal_gravity

    node_id = "gravity_freeair"
    out = _out(payload)
    params = _params(payload)
    src = _find(out, "gravity_canonical.csv")
    df = pd.read_csv(src)
    if "elevation_m" not in df.columns or not np.isfinite(df["elevation_m"]).any():
        raise ValueError("Free-air correction needs elevation/height. I will not invent a height.")
    datum = params.get("elevationDatum") or (df["elevation_datum"].iloc[0] if "elevation_datum" in df.columns else "")
    if str(datum).strip() not in {"orthometric", "ellipsoidal"}:
        raise ValueError("Free-air correction needs a documented elevation datum (orthometric or ellipsoidal).")
    lat = _latitudes(df, params)
    gamma = somigliana_normal_gravity(lat)
    fa = df["g_obs_mgal"].to_numpy(dtype=float) - gamma + free_air_correction(df["elevation_m"])
    work = df.copy()
    work["latitude_deg"] = lat
    work["normal_gravity_mgal"] = gamma
    work["free_air_mgal"] = fa
    path = os.path.join(out, "gravity_freeair.csv")
    work.to_csv(path, index=False)
    qc = {
        "n": int(len(work)),
        "mean_free_air_mgal": float(np.nanmean(fa)),
        "elevation_datum": datum,
        "latitude_source": "column" if "latitude_deg" in df.columns else ("EPSG:4326 Y" if int(df["crs_epsg"].iloc[0]) == 4326 else "parameters.surveyLatitude"),
        "formula": "Δg_FA = g_obs − γ_Somigliana + 0.3086 h  (Moritz 2000; h metres, g mGal)",
        "units": "mGal",
        "terrain": "not applied",
    }
    qc_path = write_json(os.path.join(out, "gravity_freeair_qc.json"), qc)
    write_lineage(out, node_id, qc["formula"], {"elevationDatum": datum, "surveyLatitude": params.get("surveyLatitude")}, [src], [path, qc_path])
    return {
        "artifacts": [
            make_artifact("artifact-grav-fa", "processed_dataset", "csv", path, node_id, [src], qc),
            make_artifact("artifact-grav-fa-qc", "qc_report", "json", qc_path, node_id, [src]),
        ],
        "events": [{"type": "NODE_PROGRESS", "message": f"Free-air mean {qc['mean_free_air_mgal']:.3f} mGal. Datum={datum}."}],
    }


def gravity_bouguer(payload: dict) -> dict:
    from science.gravity import bouguer_slab_correction, bullard_b

    node_id = "gravity_bouguer"
    out = _out(payload)
    params = _params(payload)
    density = params.get("density")
    if density is None:
        raise ValueError("Bouguer correction needs parameters.density in g/cm³. I will not assume 2.67.")
    density = float(density)
    if density < 1.2 or density > 3.5:
        raise ValueError(f"Density {density} g/cm³ is outside 1.2–3.5.")
    src = _find(out, "gravity_freeair.csv")
    df = pd.read_csv(src)
    apply_bb = bool(params.get("applyBullardB") or False)
    slab = bouguer_slab_correction(df["elevation_m"], density)
    bb = bullard_b(df["elevation_m"], density) if apply_bb else np.zeros(len(df))
    work = df.copy()
    work["bouguer_slab_mgal"] = slab
    work["bullard_b_mgal"] = bb
    work["bouguer_mgal"] = work["free_air_mgal"].to_numpy(dtype=float) - slab + bb
    work["density_gcc"] = density
    path = os.path.join(out, "gravity_bouguer.csv")
    work.to_csv(path, index=False)
    formula = "Δg_B = Δg_FA − 2πGρh"
    if apply_bb:
        formula += " + Bullard B (LaFehr 1991)"
    qc = {
        "density_gcc": density,
        "apply_bullard_b": apply_bb,
        "mean_bouguer_mgal": float(np.nanmean(work["bouguer_mgal"])),
        "formula": formula,
        "terrain": "not applied — simple Bouguer only. Near-zone terrain correction requires grav.terrain_near_zone with a documented DEM.",
        "assumed_density": False,
        "convention": "simple Bouguer (infinite slab). This is not a terrain-corrected Bouguer anomaly and not a Complete Bouguer Anomaly.",
    }
    qc_path = write_json(os.path.join(out, "gravity_bouguer_qc.json"), qc)
    write_lineage(out, node_id, formula, {"density": density, "applyBullardB": apply_bb}, [src], [path, qc_path])
    return {
        "artifacts": [
            make_artifact("artifact-grav-bouguer", "processed_dataset", "csv", path, node_id, [src], qc),
            make_artifact("artifact-grav-bouguer-qc", "qc_report", "json", qc_path, node_id, [src]),
        ],
        "events": [{"type": "NODE_PROGRESS", "message": f"Simple Bouguer at {density} g/cm³. Terrain not applied — this is not a Complete Bouguer Anomaly."}],
    }


def _bound_dem(params: dict) -> list[dict]:
    items = params.get("catalogInputs") or params.get("catalog_inputs") or []
    out = []
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        adapter = str(item.get("adapterId") or item.get("kind") or "").lower()
        if adapter == "dem-ascii":
            out.append(item)
    return out


def gravity_terrain(payload: dict) -> dict:
    """Near-zone terrain-corrected Bouguer: simple Bouguer + Nagy prism TC.

    Far-zone and intermediate-zone terrain are not applied. This is not a
    Complete Bouguer Anomaly.
    """
    from formats.dem import parse_dem_ascii
    from science.gravity import terrain_correction_prisms

    node_id = "gravity_terrain"
    out = _out(payload)
    params = _params(payload)
    density = params.get("density")
    if density is None:
        raise ValueError("Near-zone terrain-corrected Bouguer needs parameters.density in g/cm³. I will not assume 2.67.")
    density = float(density)
    if density < 1.2 or density > 3.5:
        raise ValueError(f"Density {density} g/cm³ is outside 1.2–3.5.")
    dems = _bound_dem(params)
    if not dems:
        raise ValueError(
            "Near-zone terrain-corrected Bouguer needs a bound dem-ascii catalog record. I will not download or invent a DEM."
        )
    if len(dems) > 1:
        # Prefer DEM whose CRS matches stations when several are bound.
        dems = dems[:1]
    dem_item = dems[0]
    dem_rel = str(dem_item.get("path") or "")
    dem_path = dem_item.get("absPath") or dem_item.get("abs_path") or dem_rel
    if dem_path and not os.path.isabs(str(dem_path)):
        dem_path = os.path.abspath(os.path.join(str(params.get("baseDir") or ""), str(dem_path)))
    dem = parse_dem_ascii(str(dem_path))
    src = _find(out, "gravity_bouguer.csv")
    df = pd.read_csv(src)
    station_epsg = int(df["crs_epsg"].iloc[0]) if "crs_epsg" in df.columns else 0
    if int(dem["epsg"]) != station_epsg:
        raise ValueError(
            f"DEM EPSG:{dem['epsg']} does not match station EPSG:{station_epsg}. I will not reproject silently."
        )
    station_datum = params.get("elevationDatum") or (df["elevation_datum"].iloc[0] if "elevation_datum" in df.columns else "")
    if str(station_datum).strip() and str(station_datum).strip() != dem["elevation_datum"]:
        raise ValueError(
            f"DEM vertical datum {dem['elevation_datum']} does not match station datum {station_datum}."
        )
    use_extent = bool(params.get("useDemExtent") or params.get("use_dem_extent") or False)
    radius = params.get("terrainRadiusM") or params.get("terrain_radius_m")
    if use_extent:
        span = max(dem["xmax"] - dem["xmin"], dem["ymax"] - dem["ymin"])
        radius = float(span)
    elif radius is None:
        raise ValueError(
            "Near-zone terrain-corrected Bouguer needs parameters.terrainRadiusM in metres, or useDemExtent=true."
        )
    radius = float(radius)
    if radius <= 0:
        raise ValueError("terrainRadiusM must be positive.")
    result = terrain_correction_prisms(
        df["x"].to_numpy(dtype=float),
        df["y"].to_numpy(dtype=float),
        df["elevation_m"].to_numpy(dtype=float),
        dem["grid"],
        density_gcc=density,
        max_radius_m=radius,
    )
    tc = result["terrain_correction_mgal"]
    coverage = result["coverage_fraction"]
    mean_cov = float(np.nanmean(coverage)) if np.isfinite(coverage).any() else 0.0
    if mean_cov < 0.95 or np.isnan(tc).any():
        raise ValueError(
            f"DEM coverage is insufficient for near-zone terrain correction "
            f"(mean coverage {mean_cov:.3f}, required ≥ 0.95 inside radius {radius} m)."
        )
    work = df.copy()
    work["terrain_correction_mgal"] = tc
    work["terrain_coverage"] = coverage
    work["near_zone_terrain_corrected_bouguer_mgal"] = work["bouguer_mgal"].to_numpy(dtype=float) + tc
    path = os.path.join(out, "near_zone_terrain_corrected_bouguer.csv")
    work.to_csv(path, index=False)
    apply_bb = bool(params.get("applyBullardB") or False)
    if "bullard_b_mgal" in work.columns:
        apply_bb = apply_bb or bool(np.nanmax(np.abs(work["bullard_b_mgal"].to_numpy(dtype=float))) > 0)
    formula = (
        "Δg_NZTC = Δg_FA − 2πGρh [+ Bullard B if requested] + TC_Nagy(R or DEM extent). "
        "TC is |gz| of DEM−slab prisms (Nagy 1966) inside the near-zone window. "
        "Far-zone and intermediate-zone / Hayford–Bowie are not applied."
    )
    qc = {
        "product_name": "near-zone terrain-corrected Bouguer anomaly",
        "not_complete_bouguer": True,
        "equivalent_to_commercial_complete_bouguer": False,
        "density_gcc": density,
        "assumed_density": False,
        "apply_bullard_b": apply_bb,
        "bullard_b_status": "applied (LaFehr 1991)" if apply_bb else "off",
        "terrain_radius_m": radius,
        "use_dem_extent": use_extent,
        "near_zone_window": "bound DEM extent" if use_extent else f"{radius} m radius",
        "mean_terrain_correction_mgal": float(np.nanmean(tc)),
        "mean_near_zone_terrain_corrected_bouguer_mgal": float(
            np.nanmean(work["near_zone_terrain_corrected_bouguer_mgal"])
        ),
        "mean_coverage_fraction": mean_cov,
        "min_coverage_fraction": float(np.nanmin(coverage)),
        "dem_catalog_id": dem_item.get("catalogId") or dem_item.get("catalog_id"),
        "dem_checksum": dem_item.get("checksum"),
        "dem_path": dem_rel or str(dem_path),
        "dem_epsg": dem["epsg"],
        "dem_elevation_datum": dem["elevation_datum"],
        "dem_units": "m",
        "dem_cellsize_m": dem["cellsize"],
        "dem_extent": {
            "xmin": dem["xmin"],
            "xmax": dem["xmax"],
            "ymin": dem["ymin"],
            "ymax": dem["ymax"],
        },
        "method": result["method"],
        "numerical_approximation": "Vectorized Nagy 1966 eight-term prism kernel per DEM cell inside the near-zone window.",
        "near_zone": True,
        "far_zone": False,
        "intermediate_zone": False,
        "hayford_bowie": False,
        "convention": (
            "G-AID near-zone terrain-corrected Bouguer anomaly. "
            "Not a Complete Bouguer Anomaly. Not equivalent to a fully regional or commercial complete Bouguer product."
        ),
        "formula": formula,
        "limitations": [
            "Terrain correction is limited to the configured DEM extent or radius.",
            "Far-zone and intermediate-zone terrain effects are not included.",
            "DEM cells outside the near-zone window are ignored.",
            "No isostatic correction.",
            "No Earth curvature on the prism kernel itself (Bullard B is a separate optional term on the slab).",
            "Not equivalent to Oasis montaj or any commercial Complete Bouguer product.",
        ],
    }
    qc_path = write_json(os.path.join(out, "near_zone_terrain_corrected_bouguer_qc.json"), qc)
    validation_path = _attach_validation_copy(out, "gravity_terrain_benchmarks.json")
    write_lineage(
        out,
        node_id,
        formula,
        {
            "density": density,
            "terrainRadiusM": radius,
            "useDemExtent": use_extent,
            "demCatalogId": qc["dem_catalog_id"],
            "demChecksum": qc["dem_checksum"],
        },
        [src, str(dem_path)],
        [path, qc_path] + ([validation_path] if validation_path else []),
    )
    artifacts = [
        make_artifact("artifact-grav-nztc", "processed_dataset", "csv", path, node_id, [src], qc),
        make_artifact("artifact-grav-terrain-qc", "qc_report", "json", qc_path, node_id, [src]),
    ]
    if validation_path:
        artifacts.append(make_artifact("artifact-grav-terrain-bench", "qc_report", "json", validation_path, node_id, [src]))
    return {
        "artifacts": artifacts,
        "events": [
            {
                "type": "NODE_PROGRESS",
                "message": (
                    f"Near-zone terrain-corrected Bouguer at {density} g/cm³, window={qc['near_zone_window']}, "
                    f"mean TC {qc['mean_terrain_correction_mgal']:.3f} mGal. "
                    f"Bullard B {qc['bullard_b_status']}. Far-zone not applied. Not Complete Bouguer."
                ),
            }
        ],
    }


def grav_gridder(payload: dict) -> dict:
    from science.gis import export_grid_bundle
    from science.crs import CRS
    from science.grid import minimum_curvature

    node_id = "grav_gridder"
    out = _out(payload)
    params = _params(payload)
    src = _find(
        out,
        "near_zone_terrain_corrected_bouguer.csv",
        "gravity_bouguer.csv",
        "gravity_freeair.csv",
    )
    df = pd.read_csv(src)
    col = (
        "near_zone_terrain_corrected_bouguer_mgal"
        if "near_zone_terrain_corrected_bouguer_mgal" in df.columns
        else "bouguer_mgal"
        if "bouguer_mgal" in df.columns
        else "free_air_mgal"
    )
    epsg = int(df["crs_epsg"].iloc[0])
    dx = params.get("cellSizeM")
    grid = minimum_curvature(
        df["x"].to_numpy(dtype=float),
        df["y"].to_numpy(dtype=float),
        df[col].to_numpy(dtype=float),
        dx=float(dx) if dx else None,
        tension=float(params.get("gridTension") or 0.25),
        crs_epsg=epsg,
        units="mGal",
        name=col.replace("_mgal", ""),
    )
    crs = CRS(epsg, f"EPSG:{epsg}", "projected" if epsg != 4326 else "geographic")
    stem = (
        "near_zone_terrain_corrected_bouguer_grid"
        if col == "near_zone_terrain_corrected_bouguer_mgal"
        else "bouguer_grid"
        if col == "bouguer_mgal"
        else "free_air_grid"
    )
    paths = export_grid_bundle(grid, out, stem, crs)
    np.savez(os.path.join(out, f"{stem}.npz"), values=grid.masked(), x0=grid.x0, y0=grid.y0, dx=grid.dx, dy=grid.dy, crs=epsg)
    qc = {"crs_epsg": epsg, "dx": grid.dx, "nx": grid.nx, "ny": grid.ny, "source_column": col, "units": "mGal"}
    qc_path = write_json(os.path.join(out, "gravity_grid_qc.json"), qc)
    write_lineage(out, node_id, "Thin-plate spline = 2-D minimum curvature (Duchon 1977 / Briggs 1974)", qc, [src], list(paths.values()))
    artifacts = [make_artifact(f"artifact-grav-grid-{ext}", "grid", ext, p, node_id, [src], qc) for ext, p in paths.items()]
    artifacts.append(make_artifact("artifact-grav-grid-qc", "qc_report", "json", qc_path, node_id, [src]))
    return {
        "artifacts": artifacts,
        "events": [{"type": "NODE_PROGRESS", "message": f"Gridded {col} {grid.nx}×{grid.ny} at {grid.dx:.2f}, EPSG:{epsg}."}],
    }


def regional_residual(payload: dict) -> dict:
    from science.crs import CRS
    from science.gis import export_grid_bundle
    from science.gravity import polynomial_regional
    from science.grid import Grid

    node_id = "regional_residual"
    out = _out(payload)
    params = _params(payload)
    stem = (
        "near_zone_terrain_corrected_bouguer_grid"
        if os.path.isfile(os.path.join(out, "near_zone_terrain_corrected_bouguer_grid.npz"))
        else "bouguer_grid"
        if os.path.isfile(os.path.join(out, "bouguer_grid.npz"))
        else "free_air_grid"
    )
    npz = os.path.join(out, f"{stem}.npz")
    if not os.path.isfile(npz):
        raise FileNotFoundError("Regional-residual needs grav_gridder output.")
    data = np.load(npz)
    grid = Grid(
        values=np.array(data["values"], float),
        x0=float(data["x0"]),
        y0=float(data["y0"]),
        dx=float(data["dx"]),
        dy=float(data["dy"]),
        crs_epsg=int(data["crs"]),
        units="mGal",
        name=stem,
    )
    order = int(params.get("polyOrder") or 2)
    regional, residual = polynomial_regional(grid, order=order)
    crs = CRS(grid.crs_epsg, f"EPSG:{grid.crs_epsg}", "projected")
    artifacts = []
    for g, name in ((regional, "bouguer_regional"), (residual, "bouguer_residual")):
        paths = export_grid_bundle(g, out, name, crs)
        np.savez(os.path.join(out, f"{name}.npz"), values=g.masked(), x0=g.x0, y0=g.y0, dx=g.dx, dy=g.dy, crs=grid.crs_epsg)
        artifacts.append(make_artifact(f"artifact-{name}", "grid", "tif", paths.get("tif") or paths.get("asc"), node_id))
    qc = {"method": "polynomial", "order": order, "source_grid": stem, "upward_continuation": False}
    qc_path = write_json(os.path.join(out, "gravity_residual_qc.json"), qc)
    write_lineage(out, node_id, f"Least-squares polynomial regional order {order}", qc, [stem], [qc_path])
    return {
        "artifacts": artifacts + [make_artifact("artifact-grav-resid-qc", "qc_report", "json", qc_path, node_id)],
        "events": [{"type": "NODE_PROGRESS", "message": f"Polynomial regional-residual order {order}."}],
    }


def grav_gis_export(payload: dict) -> dict:
    from science.gis import write_geojson_points

    node_id = "grav_gis_export"
    out = _out(payload)
    src = _find(
        out,
        "near_zone_terrain_corrected_bouguer.csv",
        "gravity_bouguer.csv",
        "gravity_freeair.csv",
        "gravity_canonical.csv",
    )
    df = pd.read_csv(src)
    col = (
        "near_zone_terrain_corrected_bouguer_mgal"
        if "near_zone_terrain_corrected_bouguer_mgal" in df.columns
        else "bouguer_mgal"
        if "bouguer_mgal" in df.columns
        else "free_air_mgal"
        if "free_air_mgal" in df.columns
        else "g_obs_mgal"
    )
    epsg = int(df["crs_epsg"].iloc[0]) if "crs_epsg" in df.columns else 0
    if not epsg:
        raise ValueError("GIS export needs a documented CRS. I will not write GeoJSON as 4326 by default.")
    path = os.path.join(out, "gravity_stations.geojson")
    props = [{"value": float(v), "units": "mGal"} for v in df[col]]
    write_geojson_points(df["x"], df["y"], props, path, crs_epsg=epsg)
    return {
        "artifacts": [make_artifact("artifact-grav-stations", "vector", "geojson", path, node_id, [src])],
        "events": [{"type": "NODE_PROGRESS", "message": f"Wrote gravity_stations.geojson (EPSG:{epsg})."}],
    }


def grav_interpret(payload: dict) -> dict:
    node_id = "grav_interpret"
    out = _out(payload)
    qc_names = [
        "gravity_ingest_qc.json",
        "gravity_freeair_qc.json",
        "gravity_bouguer_qc.json",
        "near_zone_terrain_corrected_bouguer_qc.json",
        "gravity_grid_qc.json",
        "gravity_residual_qc.json",
        "gravity_terrain_validation.json",
    ]
    qcs = {}
    for name in qc_names:
        path = os.path.join(out, name)
        if os.path.isfile(path):
            with open(path, encoding="utf-8") as handle:
                qcs[name] = json.load(handle)
    terrain_qc = qcs.get("near_zone_terrain_corrected_bouguer_qc.json") or {}
    terrain = bool(terrain_qc)
    bouguer_kind = (
        "near-zone terrain-corrected Bouguer anomaly"
        if terrain
        else "simple Bouguer (infinite slab, no terrain)"
    )
    bullard = terrain_qc.get("bullard_b_status") or (
        "applied" if qcs.get("gravity_bouguer_qc.json", {}).get("apply_bullard_b") else "off"
    )
    report = {
        "product_name": bouguer_kind,
        "not_complete_bouguer": True,
        "observations": [
            "Gravity stations were ingested under the G-AID named-column contract.",
            f"Free-air QC present: {'gravity_freeair_qc.json' in qcs}",
            f"Simple Bouguer QC present: {'gravity_bouguer_qc.json' in qcs}",
            f"Near-zone terrain QC present: {terrain}",
            f"Anomaly reported in this run: {bouguer_kind}.",
        ],
        "assumptions": [
            qcs.get("gravity_bouguer_qc.json", {}).get("density_gcc")
            and f"User density {qcs['gravity_bouguer_qc.json']['density_gcc']} g/cm³ was applied to the simple slab."
            or "No Bouguer density was applied in this run.",
            qcs.get("gravity_freeair_qc.json", {}).get("elevation_datum")
            and f"Elevation datum {qcs['gravity_freeair_qc.json']['elevation_datum']} was used as documented."
            or "Elevation datum was required and recorded when free-air ran.",
            f"Bullard B / spherical-cap curvature: {bullard}.",
            terrain
            and (
                f"Near-zone Nagy terrain correction used DEM {terrain_qc.get('dem_catalog_id')} "
                f"(checksum {terrain_qc.get('dem_checksum')}, cell size {terrain_qc.get('dem_cellsize_m')} m, "
                f"coverage {terrain_qc.get('mean_coverage_fraction')}) inside "
                f"{terrain_qc.get('near_zone_window')}."
            )
            or "Terrain correction was not applied. Simple Bouguer is not a terrain-corrected Bouguer anomaly.",
        ],
        "uncertainty": [
            "Simple Bouguer omits terrain. Incomplete terrain correction can exceed many geological signals.",
            "Terrain correction is limited to the configured DEM extent or radius.",
            "Far-zone and intermediate-zone terrain effects are not included.",
            "This product is not equivalent to a fully regional or commercial Complete Bouguer Anomaly.",
            "Polynomial residual order is a modelling choice.",
            "Gridding interpolates between stations.",
        ],
        "recommendations": [
            "Confirm density with rock samples or a well-justified local value before modelling.",
            "Do not treat residual highs/lows as drill targets.",
            "Do not present this run as a Complete Bouguer Anomaly.",
        ],
        "not_established": [
            "Lithology is not established.",
            "Mineralisation is not established.",
            "Density bodies are not established.",
            "Drill targets are not established.",
            "A Complete Bouguer Anomaly is not established without far-zone and intermediate-zone terrain.",
        ],
        "qc": qcs,
        "interpretation_limit": "A gravity anomaly is an observation. Overlay and colour scale do not prove geological causation.",
    }
    path = write_json(os.path.join(out, "gravity_interpretation.json"), report)
    return {
        "artifacts": [make_artifact("artifact-grav-interpret", "report", "json", path, node_id)],
        "events": [{"type": "NODE_PROGRESS", "message": "Wrote evidence-bound gravity interpretation limits."}],
    }
