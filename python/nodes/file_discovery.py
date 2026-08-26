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
    parse_las,
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


def discover_files(payload: dict) -> dict:
    node_id = payload.get("node_id", "file_discovery")
    params = payload.get("parameters", {}) or {}

    target_folder = params.get("targetFolder") or ""
    task_folder = params.get("taskFolder", "")
    base_dir = params.get("baseDir", "")
    out_dir = payload.get("parameters", {}).get("outDir", "")

    if target_folder:
        abs_dir = os.path.abspath(os.path.join(base_dir, target_folder))
    else:
        abs_dir = os.path.abspath(base_dir)

    if not os.path.exists(abs_dir):
        raise FileNotFoundError(f"Survey directory not found: {abs_dir}")

    events = []
    artifacts = []
    out_dir = os.path.abspath(os.path.join(out_dir, task_folder))
    assert_gaid_output_path(out_dir)
    os.makedirs(out_dir, exist_ok=True)

    candidates = []
    for root_dir, dirs, files in os.walk(abs_dir):
        dirs[:] = [d for d in dirs if d.lower() not in {"g-aid output", "__pycache__", ".git", ".venv"}]
        for f in files:
            filepath = os.path.join(root_dir, f)
            lower = f.lower()
            rel = os.path.relpath(filepath, abs_dir)
            if lower.endswith(".las"):
                try:
                    parsed = parse_las(filepath)
                    events.append(_progress(node_id, f"Classified {f} as LAS well log."))
                except Exception as exc:
                    events.append(_qc("warning", f"Failed to inspect or parse {f}: {exc}", node_id))
                continue
            if lower.endswith((".sgy", ".segy")):
                events.append(_progress(node_id, f"Classified {f} as SEG-Y."))
                continue
            if lower.endswith(".dzt"):
                events.append(_progress(node_id, f"Classified {f} as GSSI DZT."))
                continue
            if not (lower.endswith(".csv") or lower.endswith(".txt") or lower.endswith(".xyz") or lower.endswith(".dat")):
                continue
            with open(filepath, "r", errors="ignore") as file_obj:
                head_lines = []
                for _ in range(50):
                    try:
                        head_lines.append(next(file_obj))
                    except StopIteration:
                        break
                head = "".join(head_lines)
            head_l = head.lower()
            if "time nt sq" in head_l or "time nT sq" in head:
                kind = "gsm19-base"
            elif "latitude" in head_l and "longitude" in head_l and "mag" in head_l:
                kind = "magarrow"
            elif lower.endswith(".dat") and (
                any(k in head_l for k in ("wenner", "dipole", "electrode", "res2dinv"))
                or (head.strip()[:1].isalpha())
            ):
                events.append(_progress(node_id, f"Skipped {f}: not MagArrow or GSM-19."))
                continue
            elif lower.endswith(".xyz") or (head_l.startswith("/") and "x" in head_l):
                events.append(_progress(node_id, f"Skipped {f}: not MagArrow or GSM-19."))
                continue
            else:
                kind = "other"
            if kind == "other":
                continue
            candidates.append({"path": filepath, "name": f, "rel": rel, "head": head, "kind": kind})

    base_dfs = []
    airborne_dfs = []
    manifest = []

    for item in candidates:
        if item["kind"] != "magarrow":
            continue
        try:
            df = parse_magarrow(item["path"])
            airborne_dfs.append(df)
            manifest.append({"path": item["rel"], "kind": "magarrow", "n": len(df)})
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
            manifest.append({"path": item["rel"], "kind": "gsm19-base", "date": str(date.date()), "n": len(df)})
        except Exception as exc:
            events.append(_qc("warning", f"Failed to inspect or parse {item['name']}: {exc}", node_id))

    manifest_path = os.path.join(out_dir, "survey_manifest.json")
    write_json(manifest_path, {"directory": abs_dir, "files": manifest, "created_at": datetime.now(timezone.utc).isoformat()})
    artifacts.append(make_artifact("artifact-manifest-1", "qc_report", "json", manifest_path, node_id))

    if base_dfs:
        combined_base = pd.concat(base_dfs, ignore_index=True).sort_values("timestamp")
        out_base_path = os.path.join(out_dir, "base_station_canonical.csv")
        combined_base.to_csv(out_base_path, index=False)
        artifacts.append(make_artifact("artifact-base-raw-1", "raw_dataset", "csv", out_base_path, node_id))
    else:
        events.append(_qc("critical", f"No base station data found in {abs_dir}", node_id))

    if airborne_dfs:
        combined_airborne = pd.concat(airborne_dfs, ignore_index=True).sort_values("timestamp")
        out_air_path = os.path.join(out_dir, "airborne_canonical.csv")
        combined_airborne.to_csv(out_air_path, index=False)
        artifacts.append(make_artifact("artifact-airborne-raw-1", "raw_dataset", "csv", out_air_path, node_id))
    else:
        events.append(_qc("fatal", "No airborne CSVs found.", node_id))

    return {"artifacts": artifacts, "events": events}


if __name__ == "__main__":
    run_node(discover_files)
