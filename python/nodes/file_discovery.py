import sys
import os
from datetime import datetime, timezone

import pandas as pd

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core.node_runner import run_node
from formats import (
    magarrow_survey_date,
    parse_gsm19,
    parse_header_date,
    parse_magarrow,
)
from science.artifacts import make_artifact, write_json, assert_gaid_output_path


def _survey_date(params: dict, header_text: str, fallback: datetime | None = None):
    raw = params.get("surveyDate") or params.get("survey_date")
    if raw:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00")).replace(tzinfo=None)
    parsed = parse_header_date(header_text)
    if parsed:
        return parsed.replace(tzinfo=None) if parsed.tzinfo else parsed
    if fallback is not None:
        return fallback.replace(tzinfo=None) if fallback.tzinfo else fallback
    return None


def _progress(node_id: str, message: str) -> dict:
    return {"type": "NODE_PROGRESS", "nodeId": node_id, "message": message}


def _qc(severity: str, message: str, node_id: str) -> dict:
    return {"type": "QC_WARNING", "severity": severity, "nodeId": node_id, "message": message}


def _bound_kind(item: dict) -> str | None:
    adapter = str(item.get("adapterId") or item.get("adapter_id") or "").lower()
    kind = str(item.get("kind") or "").lower()
    if adapter == "magarrow" or kind == "magarrow":
        return "magarrow"
    if adapter in {"gsm19", "gsm19-base"} or kind in {"gsm19", "gsm19-base"}:
        return "gsm19-base"
    return None


def _read_head(filepath: str, lines: int = 50) -> str:
    with open(filepath, "r", errors="ignore") as file_obj:
        head_lines = []
        for _ in range(lines):
            try:
                head_lines.append(next(file_obj))
            except StopIteration:
                break
        return "".join(head_lines)


def _candidates_from_catalog(params: dict, base_dir: str, node_id: str) -> tuple[list[dict], list[dict]]:
    catalog_inputs = params.get("catalogInputs")
    if catalog_inputs is None:
        catalog_inputs = params.get("catalog_inputs")
    if catalog_inputs is None:
        raise ValueError(
            "file_discovery requires parameters.catalogInputs from the frozen plan. "
            "I will not search the survey folder by extension."
        )
    if not isinstance(catalog_inputs, list):
        raise ValueError("parameters.catalogInputs must be a list of bound catalog records.")
    if not catalog_inputs:
        raise ValueError(
            "Frozen plan catalogInputs is empty. Bind supported MagArrow and GSM-19 catalog records before Proceed."
        )

    events: list[dict] = []
    candidates: list[dict] = []
    for item in catalog_inputs:
        if not isinstance(item, dict):
            continue
        kind = _bound_kind(item)
        catalog_id = item.get("catalogId") or item.get("catalog_id") or ""
        rel = str(item.get("path") or "")
        filepath = item.get("absPath") or item.get("abs_path") or rel
        if not filepath:
            events.append(_qc("critical", f"Catalog record {catalog_id} has no bound path.", node_id))
            continue
        if not os.path.isabs(str(filepath)):
            filepath = os.path.abspath(os.path.join(base_dir, str(filepath)))
        else:
            filepath = os.path.abspath(str(filepath))
        name = os.path.basename(filepath)
        if not kind:
            events.append(
                _qc(
                    "critical",
                    f"Skipped {name} ({catalog_id}): not a supported MagArrow or GSM-19 catalog binding.",
                    node_id,
                )
            )
            continue
        if not os.path.isfile(filepath):
            events.append(_qc("fatal", f"Bound catalog file is missing: {rel or filepath} ({catalog_id}).", node_id))
            continue
        try:
            head = _read_head(filepath)
        except OSError as exc:
            events.append(_qc("fatal", f"Could not read bound catalog file {name}: {exc}", node_id))
            continue
        candidates.append({
            "path": filepath,
            "name": name,
            "rel": rel or name,
            "head": head,
            "kind": kind,
            "catalogId": catalog_id,
        })
        events.append(_progress(node_id, f"Bound {name} as {kind} ({catalog_id})."))
    return candidates, events


def discover_files(payload: dict) -> dict:
    node_id = payload.get("node_id", "file_discovery")
    params = payload.get("parameters", {}) or {}

    target_folder = params.get("targetFolder") or ""
    task_folder = params.get("taskFolder", "")
    base_dir = params.get("baseDir", "")
    out_dir = payload.get("parameters", {}).get("outDir", "")

    candidates, bind_events = _candidates_from_catalog(params, base_dir, node_id)

    if target_folder:
        abs_dir = os.path.abspath(os.path.join(base_dir, target_folder))
    else:
        abs_dir = os.path.abspath(base_dir)

    events = []
    artifacts = []
    events.extend(bind_events)
    out_dir = os.path.abspath(os.path.join(out_dir, task_folder))
    assert_gaid_output_path(out_dir)
    os.makedirs(out_dir, exist_ok=True)

    base_dfs = []
    airborne_dfs = []
    manifest = []

    for item in candidates:
        if item["kind"] != "magarrow":
            continue
        try:
            df = parse_magarrow(item["path"])
            airborne_dfs.append(df)
            manifest.append({
                "path": item["rel"],
                "kind": "magarrow",
                "catalogId": item.get("catalogId"),
                "n": len(df),
            })
            events.append(_progress(node_id, f"Read {item['name']} ({len(df)} MagArrow samples)."))
        except Exception as exc:
            events.append(_qc("warning", f"Failed to inspect or parse {item['name']}: {exc}", node_id))

    air_date = magarrow_survey_date(airborne_dfs[0]) if airborne_dfs else None

    for item in candidates:
        if item["kind"] != "gsm19-base":
            continue
        try:
            date = _survey_date(params, item["head"], air_date)
            if date is None:
                raise ValueError(
                    f"{item['name']}: GSM-19 header has no date. Pass parameters.surveyDate as YYYY-MM-DD."
                )
            if date.tzinfo:
                date = date.replace(tzinfo=None)
            events.append(_progress(node_id, f"Read {item['name']} as GSM-19 base ({date.date()})."))
            df = parse_gsm19(item["path"], survey_date=date)
            base_dfs.append(df)
            manifest.append({
                "path": item["rel"],
                "kind": "gsm19-base",
                "catalogId": item.get("catalogId"),
                "date": str(date.date()),
                "n": len(df),
            })
        except Exception as exc:
            events.append(_qc("warning", f"Failed to inspect or parse {item['name']}: {exc}", node_id))

    manifest_path = os.path.join(out_dir, "survey_manifest.json")
    write_json(manifest_path, {
        "directory": abs_dir,
        "files": manifest,
        "catalogBound": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    artifacts.append(make_artifact("artifact-manifest-1", "qc_report", "json", manifest_path, node_id))

    if base_dfs:
        combined_base = pd.concat(base_dfs, ignore_index=True).sort_values("timestamp")
        out_base_path = os.path.join(out_dir, "base_station_canonical.csv")
        combined_base.to_csv(out_base_path, index=False)
        artifacts.append(make_artifact("artifact-base-raw-1", "raw_dataset", "csv", out_base_path, node_id))
    else:
        events.append(_qc("critical", "No bound GSM-19 base-station catalog records were read.", node_id))

    if airborne_dfs:
        combined_airborne = pd.concat(airborne_dfs, ignore_index=True).sort_values("timestamp")
        out_air_path = os.path.join(out_dir, "airborne_canonical.csv")
        combined_airborne.to_csv(out_air_path, index=False)
        artifacts.append(make_artifact("artifact-airborne-raw-1", "raw_dataset", "csv", out_air_path, node_id))
    else:
        events.append(_qc("fatal", "No bound MagArrow catalog records were read.", node_id))

    return {"artifacts": artifacts, "events": events}


if __name__ == "__main__":
    run_node(discover_files)
