"""Radiometric kernels on the generic DAG. Corrections are not live capabilities."""

from __future__ import annotations

import json
import os

import numpy as np
import pandas as pd

from science.artifacts import make_artifact, task_dir, write_json, write_lineage


def _cell_str(frame, column: str, default: str = "unknown") -> str:
    if column not in frame.columns or frame.empty:
        return default
    value = str(frame[column].iloc[0]).strip()
    if not value or value.lower() in {"nan", "none", "null", "n/a"}:
        return default
    return value


def _units_known(units: str) -> bool:
    return bool(units) and units.strip().lower() not in {"", "unknown", "nan", "none", "n/a", "null"}


def _channel_units(frame, col: str) -> str:
    return _cell_str(frame, f"units_{col}")


def _concentration_units_ok(units_k: str, units_eu: str, units_eth: str) -> bool:
    if not (_units_known(units_k) and _units_known(units_eu) and _units_known(units_eth)):
        return False
    k = units_k.lower()
    eu = units_eu.lower()
    eth = units_eth.lower()
    k_ok = "%" in k or "percent" in k
    eu_ok = "ppm" in eu
    eth_ok = "ppm" in eth
    return k_ok and eu_ok and eth_ok


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


def _bound_radio(params: dict) -> list[dict]:
    items = params.get("catalogInputs") or params.get("catalog_inputs") or []
    if not isinstance(items, list) or not items:
        raise ValueError("rad_ingest requires parameters.catalogInputs from the frozen plan.")
    out = []
    for item in items:
        if not isinstance(item, dict):
            continue
        adapter = str(item.get("adapterId") or item.get("kind") or "").lower()
        if adapter in {"radiometric-csv", "radiometric-xyz"}:
            out.append(item)
    if not out:
        raise ValueError("No bound radiometric-csv or radiometric-xyz catalog records. I will not search by extension.")
    return out


def rad_ingest(payload: dict) -> dict:
    from formats.radiometrics import parse_radiometric_table
    from science.radiometrics import line_qc

    node_id = "rad_ingest"
    out = _out(payload)
    params = _params(payload)
    mapping = params.get("radioMapping") or params.get("columnMapping")
    frames = []
    qc_files = []
    events = []
    for item in _bound_radio(params):
        rel = str(item.get("path") or "")
        filepath = item.get("absPath") or item.get("abs_path") or rel
        if filepath and not os.path.isabs(str(filepath)):
            filepath = os.path.abspath(os.path.join(str(params.get("baseDir") or ""), str(filepath)))
        item_mapping = item.get("radioMapping") or item.get("radio_mapping") or mapping
        df, qc = parse_radiometric_table(
            str(filepath),
            mapping=item_mapping,
            overrides={
                "crsEpsg": params.get("crsEpsg"),
                "quantity": params.get("radioQuantity") or item.get("radioQuantity") or item.get("radio_quantity"),
                "correctionHistory": params.get("correctionHistory")
                or item.get("correctionHistory")
                or item.get("correction_history"),
            },
        )
        df["catalog_id"] = item.get("catalogId") or item.get("catalog_id")
        frames.append(df)
        qc["catalogId"] = df["catalog_id"].iloc[0]
        qc_files.append(qc)
        events.append(
            {
                "type": "NODE_PROGRESS",
                "message": f"Read {os.path.basename(str(filepath))} ({len(df)} radiometric samples, quantity={qc['quantity']}).",
            }
        )
    combined = pd.concat(frames, ignore_index=True)
    lqc = line_qc(combined["line"].to_numpy(), combined["x"].to_numpy(), combined["y"].to_numpy())
    path = os.path.join(out, "rad_canonical.csv")
    combined.to_csv(path, index=False)
    quantity = _cell_str(combined, "quantity")
    units_k = _channel_units(combined, "k")
    units_eu = _channel_units(combined, "eu")
    units_eth = _channel_units(combined, "eth")
    units_tc = _channel_units(combined, "tc")
    qc_path = write_json(
        os.path.join(out, "rad_ingest_qc.json"),
        {
            "files": qc_files,
            "n": int(len(combined)),
            "line_qc": lqc,
            "quantity": quantity,
            "units_k": units_k,
            "units_eu": units_eu,
            "units_eth": units_eth,
            "units_tc": units_tc,
            "units_unknown": any(
                not _units_known(u)
                for col, u in (("k", units_k), ("eu", units_eu), ("eth", units_eth), ("tc", units_tc))
                if col in combined.columns
            ),
            "channels": [c for c in ("k", "eu", "eth", "tc") if c in combined.columns],
            "corrections_applied_in_g_aid": False,
            "not_raw_spectrum": True,
            "assumptions": "None. Already-corrected values as supplied. G-AID did not height-correct, strip, or convert concentrations. Units came from the catalog contract, not from filenames.",
        },
    )
    write_lineage(out, node_id, "G-AID RAD 1.0 ingest", {"files": qc_files}, [f["path"] for f in qc_files], [path, qc_path])
    return {
        "artifacts": [
            make_artifact("artifact-rad-canonical", "raw_dataset", "csv", path, node_id),
            make_artifact("artifact-rad-ingest-qc", "qc_report", "json", qc_path, node_id),
        ],
        "events": events,
    }


def _grid_channel(df: pd.DataFrame, col: str, units: str, quantity: str, out: str, params: dict, node_id: str, src: str) -> list[dict]:
    from science.crs import CRS
    from science.gis import export_grid_bundle
    from science.grid import minimum_curvature

    epsg = int(df["crs_epsg"].iloc[0])
    dx = params.get("cellSizeM")
    grid = minimum_curvature(
        df["x"].to_numpy(dtype=float),
        df["y"].to_numpy(dtype=float),
        df[col].to_numpy(dtype=float),
        dx=float(dx) if dx else None,
        tension=float(params.get("gridTension") or 0.25),
        crs_epsg=epsg,
        units=units or "unknown",
        name=col,
    )
    grid.metadata["quantity"] = quantity
    grid.metadata["channel"] = col
    crs = CRS(epsg, f"EPSG:{epsg}", "projected" if epsg != 4326 else "geographic")
    stem = f"rad_{col}_grid"
    paths = export_grid_bundle(grid, out, stem, crs)
    np.savez(
        os.path.join(out, f"{stem}.npz"),
        values=grid.masked(),
        x0=grid.x0,
        y0=grid.y0,
        dx=grid.dx,
        dy=grid.dy,
        crs=epsg,
        units=np.array(units or "unknown"),
        quantity=np.array(quantity or "unknown"),
        channel=np.array(col),
    )
    artifacts = [make_artifact(f"artifact-rad-grid-{col}-{ext}", "grid", ext, p, node_id, [src]) for ext, p in paths.items()]
    return artifacts


def rad_grid(payload: dict) -> dict:
    node_id = "rad_grid"
    out = _out(payload)
    params = _params(payload)
    src = _find(out, "rad_canonical.csv")
    df = pd.read_csv(src)
    quantity = _cell_str(df, "quantity")
    units = {col: _channel_units(df, col) for col in ("k", "eu", "eth", "tc") if col in df.columns}
    artifacts = []
    gridded = []
    for col in ("k", "eu", "eth", "tc"):
        if col not in df.columns:
            continue
        artifacts.extend(_grid_channel(df, col, units[col], quantity, out, params, node_id, src))
        gridded.append(col)
    if not gridded:
        raise ValueError("No radiometric channels to grid.")
    qc = {
        "channels": gridded,
        "quantity": quantity,
        "units": {c: units[c] for c in gridded},
        "units_unknown": any(not _units_known(units[c]) for c in gridded),
        "interpolation": "Thin-plate spline = 2-D minimum curvature (Duchon 1977 / Briggs 1974)",
        "not_a_geological_map": True,
        "units_source": "catalog record / versioned artifact metadata, not filename",
    }
    qc_path = write_json(os.path.join(out, "rad_grid_qc.json"), qc)
    write_lineage(out, node_id, qc["interpolation"], qc, [src], [qc_path])
    return {
        "artifacts": artifacts + [make_artifact("artifact-rad-grid-qc", "qc_report", "json", qc_path, node_id, [src])],
        "events": [{"type": "NODE_PROGRESS", "message": f"Gridded radiometric channels {gridded}. Interpolation, not a measurement."}],
    }


def rad_ternary(payload: dict) -> dict:
    from science.radiometrics import ternary_rgb

    node_id = "rad_ternary"
    out = _out(payload)
    src = _find(out, "rad_canonical.csv")
    df = pd.read_csv(src)
    quantity = _cell_str(df, "quantity")
    units_k = _channel_units(df, "k")
    units_eu = _channel_units(df, "eu")
    units_eth = _channel_units(df, "eth")
    missing = [c for c in ("k", "eu", "eth") if c not in df.columns]
    units_ok = _concentration_units_ok(units_k, units_eu, units_eth)
    qc = {
        "justified": quantity == "concentration" and not missing and units_ok,
        "quantity": quantity,
        "units_k": units_k,
        "units_eu": units_eu,
        "units_eth": units_eth,
        "assignment": {"R": "K %", "G": "eTh ppm", "B": "eU ppm"},
        "skipped": False,
        "not_mineralisation": True,
        "not_lithology": True,
    }
    if quantity != "concentration" or missing or not units_ok:
        qc["skipped"] = True
        qc["justified"] = False
        if quantity != "concentration":
            qc["reason"] = f"Ternary needs Quantity=concentration. quantity={quantity}."
        elif missing:
            qc["reason"] = f"Ternary needs concentration K, eU, and eTh. missing={missing}."
        else:
            qc["reason"] = (
                "Ternary needs documented concentration units (%K, ppm eU, ppm eTh). "
                f"units_k={units_k}, units_eu={units_eu}, units_eth={units_eth}."
            )
        qc_path = write_json(os.path.join(out, "rad_ternary_qc.json"), qc)
        return {
            "artifacts": [make_artifact("artifact-rad-ternary-qc", "qc_report", "json", qc_path, node_id, [src])],
            "events": [{"type": "NODE_PROGRESS", "message": qc["reason"]}],
        }
    # Prefer gridded values when present so the ternary matches the map grids.
    rgb_src = "points"
    k = df["k"].to_numpy(dtype=float)
    eth = df["eth"].to_numpy(dtype=float)
    eu = df["eu"].to_numpy(dtype=float)
    nx = ny = None
    grid_meta = {}
    k_npz = os.path.join(out, "rad_k_grid.npz")
    if os.path.isfile(k_npz) and os.path.isfile(os.path.join(out, "rad_eth_grid.npz")) and os.path.isfile(
        os.path.join(out, "rad_eu_grid.npz")
    ):
        kg = np.load(k_npz)
        thg = np.load(os.path.join(out, "rad_eth_grid.npz"))
        ug = np.load(os.path.join(out, "rad_eu_grid.npz"))
        k = np.array(kg["values"], float)
        eth = np.array(thg["values"], float)
        eu = np.array(ug["values"], float)
        ny, nx = k.shape
        grid_meta = {"x0": float(kg["x0"]), "y0": float(kg["y0"]), "dx": float(kg["dx"]), "dy": float(kg["dy"])}
        rgb_src = "grids"
    rgb = ternary_rgb(k, eth, eu)
    arr = np.asarray(rgb["rgb"])
    payload_json = {
        "source": rgb_src,
        "nx": int(nx) if nx else None,
        "ny": int(ny) if ny else None,
        **grid_meta,
        "rgb": arr.tolist(),
        "p_lo": rgb["p_lo"],
        "p_hi": rgb["p_hi"],
        "assignment": rgb["assignment"],
        "formula": rgb["formula"],
        "quantity": quantity,
        "channel_units": {"k": units_k, "eu": units_eu, "eth": units_eth},
        "units": "dimensionless 0–1 stretch",
        "not_mineralisation": True,
    }
    json_path = write_json(os.path.join(out, "rad_ternary.json"), payload_json)
    qc.update({"source": rgb_src, "formula": rgb["formula"], "p_lo": rgb["p_lo"], "p_hi": rgb["p_hi"]})
    qc_path = write_json(os.path.join(out, "rad_ternary_qc.json"), qc)
    write_lineage(out, node_id, rgb["formula"], qc, [src], [json_path, qc_path])
    return {
        "artifacts": [
            make_artifact("artifact-rad-ternary", "section", "json", json_path, node_id, [src], qc),
            make_artifact("artifact-rad-ternary-qc", "qc_report", "json", qc_path, node_id, [src]),
        ],
        "events": [{"type": "NODE_PROGRESS", "message": f"Ternary RGB from {rgb_src}. Not mineralisation or lithology."}],
    }


def rad_ratios(payload: dict) -> dict:
    from science.radiometrics import concentration_ratios

    node_id = "rad_ratios"
    out = _out(payload)
    src = _find(out, "rad_canonical.csv")
    df = pd.read_csv(src)
    quantity = _cell_str(df, "quantity")
    units_k = _channel_units(df, "k")
    units_eu = _channel_units(df, "eu")
    units_eth = _channel_units(df, "eth")
    if quantity != "concentration" or not _concentration_units_ok(units_k, units_eu, units_eth):
        reason = (
            "Concentration ratios need Quantity=concentration."
            if quantity != "concentration"
            else "Concentration ratios need documented %K / ppm eU / ppm eTh units. Unknown units block ratios."
        )
        qc = {
            "skipped": True,
            "reason": reason,
            "quantity": quantity,
            "units_k": units_k,
            "units_eu": units_eu,
            "units_eth": units_eth,
        }
        qc_path = write_json(os.path.join(out, "rad_ratio_qc.json"), qc)
        return {
            "artifacts": [make_artifact("artifact-rad-ratio-qc", "qc_report", "json", qc_path, node_id, [src])],
            "events": [{"type": "NODE_PROGRESS", "message": qc["reason"]}],
        }
    ratios = concentration_ratios(
        df["k"].to_numpy(dtype=float) if "k" in df.columns else None,
        df["eu"].to_numpy(dtype=float) if "eu" in df.columns else None,
        df["eth"].to_numpy(dtype=float) if "eth" in df.columns else None,
    )
    work = df[["x", "y", "line"]].copy()
    for key in ("eu_eth", "eu_k", "eth_k"):
        if key in ratios:
            work[key] = ratios[key]
    csv_path = os.path.join(out, "rad_ratios.csv")
    work.to_csv(csv_path, index=False)
    qc = {
        "formula": ratios["formula"],
        "skipped": False,
        "n": int(len(work)),
        "quantity": quantity,
        "units_k": units_k,
        "units_eu": units_eu,
        "units_eth": units_eth,
        "units_eu_eth": f"{units_eu} / {units_eth}",
        "units_eu_k": f"{units_eu} / {units_k}",
        "units_eth_k": f"{units_eth} / {units_k}",
        "not_lithology": True,
        "not_alteration": True,
        "n_eth_clipped": ratios.get("n_eth_clipped", 0),
        "n_k_clipped_eu": ratios.get("n_k_clipped_eu", 0),
        "n_k_clipped_eth": ratios.get("n_k_clipped_eth", 0),
    }
    qc_path = write_json(os.path.join(out, "rad_ratio_qc.json"), qc)
    write_lineage(out, node_id, ratios["formula"], qc, [src], [csv_path, qc_path])
    return {
        "artifacts": [
            make_artifact("artifact-rad-ratios", "table", "csv", csv_path, node_id, [src], qc),
            make_artifact("artifact-rad-ratio-qc", "qc_report", "json", qc_path, node_id, [src]),
        ],
        "events": [{"type": "NODE_PROGRESS", "message": "Wrote eU/eTh, eU/K, eTh/K. Ratios are not lithology or alteration."}],
    }


def rad_gis_export(payload: dict) -> dict:
    from science.gis import write_geojson_points

    node_id = "rad_gis_export"
    out = _out(payload)
    src = _find(out, "rad_canonical.csv")
    df = pd.read_csv(src)
    epsg = int(df["crs_epsg"].iloc[0]) if "crs_epsg" in df.columns else 0
    if not epsg:
        raise ValueError("Radiometric GIS export needs a documented CRS. I will not write GeoJSON as 4326 by default.")
    col = next((c for c in ("tc", "k", "eu", "eth") if c in df.columns), None)
    if col is None:
        raise ValueError("No radiometric channel for GIS export.")
    path = os.path.join(out, "rad_stations.geojson")
    quantity = _cell_str(df, "quantity")
    channel_units = _channel_units(df, col)
    all_units = {
        "k": _channel_units(df, "k"),
        "eu": _channel_units(df, "eu"),
        "eth": _channel_units(df, "eth"),
        "tc": _channel_units(df, "tc"),
    }
    props = [
        {"value": float(v), "channel": col, "quantity": quantity, "units": channel_units}
        for v in df[col]
    ]
    write_geojson_points(
        df["x"],
        df["y"],
        props,
        path,
        crs_epsg=epsg,
        collection={"quantity": quantity, "units": all_units, "value_channel": col, "value_units": channel_units},
    )
    meta_path = write_json(
        os.path.join(out, "rad_stations.meta.json"),
        {"quantity": quantity, "units": all_units, "value_channel": col, "value_units": channel_units, "crs_epsg": epsg},
    )
    return {
        "artifacts": [
            make_artifact("artifact-rad-stations", "vector", "geojson", path, node_id, [src]),
            make_artifact("artifact-rad-stations-meta", "qc_report", "json", meta_path, node_id, [src]),
        ],
        "events": [{"type": "NODE_PROGRESS", "message": f"Wrote rad_stations.geojson (EPSG:{epsg})."}],
    }


def rad_interpret(payload: dict) -> dict:
    node_id = "rad_interpret"
    out = _out(payload)
    qcs = {}
    for name in ("rad_ingest_qc.json", "rad_grid_qc.json", "rad_ternary_qc.json", "rad_ratio_qc.json"):
        path = os.path.join(out, name)
        if os.path.isfile(path):
            with open(path, encoding="utf-8") as handle:
                qcs[name] = json.load(handle)
    ingest = qcs.get("rad_ingest_qc.json") or {}
    ternary = qcs.get("rad_ternary_qc.json") or {}
    quantity = ingest.get("quantity") or "unknown"
    units_unknown = bool(ingest.get("units_unknown")) or str(quantity).lower() in {"", "unknown", "none"}
    not_established = [
        "Mineralisation is not established.",
        "Lithology is not established.",
        "Alteration is not established.",
        "Drill targets are not established.",
        "Raw spectrometer corrections were not performed.",
    ]
    if units_unknown:
        not_established.append(
            "Channel quantity/units are unknown; unit-specific legend, ternary, ratio, and interpretation claims are blocked."
        )
    report = {
        "observations": [
            "Radiometric measurements were ingested under the G-AID RAD 1.0 already-corrected contract.",
            f"Quantity: {quantity}. G-AID did not apply height, stripping, dead-time, or concentration conversion.",
            f"Ternary computed: {bool(ternary) and not ternary.get('skipped')}. A ternary is a colour composite, not a lithology map.",
            f"Units K={ingest.get('units_k', 'unknown')}, eU={ingest.get('units_eu', 'unknown')}, eTh={ingest.get('units_eth', 'unknown')}, TC={ingest.get('units_tc', 'unknown')}.",
        ],
        "assumptions": [
            "Channel values are as supplied in the declared units from the catalog record or versioned artifact metadata.",
            "Correction history is the contractor/survey declaration; it was not re-applied.",
            "Filenames are not a source of quantity or units.",
        ],
        "uncertainty": [
            "Equivalent concentrations are non-unique with respect to source geometry, attenuation, and residual stripping.",
            "Gridding interpolates. It is not a measurement.",
        ],
        "recommendations": [
            "Do not treat K, eU, eTh, ratios, or a ternary as mineralisation, lithology, alteration, or a drill target.",
        ],
        "not_established": not_established,
        "qc": qcs,
        "quantity": quantity,
        "units_k": ingest.get("units_k", "unknown"),
        "units_eu": ingest.get("units_eu", "unknown"),
        "units_eth": ingest.get("units_eth", "unknown"),
        "units_tc": ingest.get("units_tc", "unknown"),
        "interpretation_limit": "Already-corrected radiometric maps and ratios are not geology.",
        "affirmative_language_allowed": False,
        "interpretation_blocked": units_unknown,
        "corrections_applied_in_g_aid": False,
    }
    path = write_json(os.path.join(out, "rad_interpretation.json"), report)
    return {
        "artifacts": [make_artifact("artifact-rad-interpret", "report", "json", path, node_id)],
        "events": [{"type": "NODE_PROGRESS", "message": "Wrote evidence-bound radiometric interpretation limits."}],
    }
