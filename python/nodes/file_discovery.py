import sys
import os
from datetime import datetime

import pandas as pd

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core.node_runner import run_node
from formats import parse_geosoft_xyz, parse_gsm19, parse_header_date, parse_las, parse_magarrow
from science.artifacts import make_artifact, write_json


def _survey_date(params: dict, header_text: str):
    raw = params.get("surveyDate") or params.get("survey_date")
    if raw:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00")).replace(tzinfo=None)
    parsed = parse_header_date(header_text)
    if parsed:
        return parsed.replace(tzinfo=None) if parsed.tzinfo else parsed
    return None


def discover_files(payload: dict) -> dict:
    node_id = payload.get("node_id", "file_discovery")
    params = payload.get("parameters", {}) or {}

    target_folder = params.get("targetFolder") or ""
    task_folder = params.get("taskFolder", "")
    base_dir = params.get("baseDir", "")
    out_dir = params.get("outDir", "")

    if target_folder:
        abs_dir = os.path.abspath(os.path.join(base_dir, target_folder))
    else:
        abs_dir = os.path.abspath(base_dir)

    if not os.path.exists(abs_dir):
        raise FileNotFoundError(f"Survey directory not found: {abs_dir}")

    events = []
    artifacts = []
    out_dir = os.path.abspath(os.path.join(out_dir, task_folder))
    os.makedirs(out_dir, exist_ok=True)

    base_dfs = []
    airborne_dfs = []
    manifest = []

    for root_dir, dirs, files in os.walk(abs_dir):
        dirs[:] = [d for d in dirs if d.lower() not in {"g-aid output", "__pycache__", ".git", ".venv"}]
        for f in files:
            filepath = os.path.join(root_dir, f)
            lower = f.lower()
            rel = os.path.relpath(filepath, abs_dir)
            try:
                if lower.endswith(".las"):
                    parsed = parse_las(filepath)
                    manifest.append({"path": rel, "kind": "las", "well": parsed["well"], "curves": parsed["curves"]})
                    events.append({"type": "NODE_PROGRESS", "message": f"Classified {f} as LAS well log."})
                    continue
                if lower.endswith((".sgy", ".segy")):
                    manifest.append({"path": rel, "kind": "segy"})
                    events.append({"type": "NODE_PROGRESS", "message": f"Classified {f} as SEG-Y."})
                    continue
                if lower.endswith(".dzt"):
                    manifest.append({"path": rel, "kind": "gpr-dzt"})
                    events.append({"type": "NODE_PROGRESS", "message": f"Classified {f} as GSSI DZT."})
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
                    date = _survey_date(params, head)
                    if date is None:
                        raise ValueError(
                            f"{f}: GSM-19 header has no date. Pass parameters.surveyDate as YYYY-MM-DD."
                        )
                    events.append({"type": "NODE_PROGRESS", "message": f"Classified {f} as GSM-19 base ({date.date()})."})
                    df = parse_gsm19(filepath, survey_date=date)
                    base_dfs.append(df)
                    manifest.append({"path": rel, "kind": "gsm19-base", "date": str(date.date()), "n": len(df)})
                elif "latitude" in head_l and "longitude" in head_l and "mag" in head_l:
                    events.append({"type": "NODE_PROGRESS", "message": f"Classified {f} as MagArrow airborne."})
                    df = parse_magarrow(filepath)
                    airborne_dfs.append(df)
                    manifest.append({"path": rel, "kind": "magarrow", "n": len(df)})
                elif lower.endswith(".dat") and any(k in head_l for k in ("wenner", "dipole", "electrode", "res2dinv")) or (
                    lower.endswith(".dat") and head.strip()[:1].isalpha()
                ):
                    manifest.append({"path": rel, "kind": "ert-dat"})
                    events.append({"type": "NODE_PROGRESS", "message": f"Classified {f} as possible ERT .dat."})
                elif lower.endswith(".xyz") or (head_l.startswith("/") and "x" in head_l):
                    try:
                        xyz = parse_geosoft_xyz(filepath)
                        xyz_path = os.path.join(out_dir, "xyz_canonical.csv")
                        xyz.to_csv(xyz_path, index=False)
                        manifest.append({"path": rel, "kind": "geosoft-xyz", "n": len(xyz)})
                        events.append({"type": "NODE_PROGRESS", "message": f"Classified {f} as Geosoft XYZ ({len(xyz)} samples)."})
                    except Exception as exc:
                        events.append({"type": "QC_WARNING", "severity": "warning", "message": f"XYZ parse of {f} failed: {exc}"})
            except Exception as e:
                events.append({"type": "QC_WARNING", "severity": "warning", "message": f"Failed to inspect or parse {f}: {str(e)}"})

    manifest_path = os.path.join(out_dir, "survey_manifest.json")
    write_json(manifest_path, {"directory": abs_dir, "files": manifest, "created_at": datetime.utcnow().isoformat() + "Z"})
    artifacts.append(make_artifact("artifact-manifest-1", "qc_report", "json", manifest_path, node_id))

    if base_dfs:
        combined_base = pd.concat(base_dfs, ignore_index=True).sort_values("timestamp")
        out_base_path = os.path.join(out_dir, "base_station_canonical.csv")
        combined_base.to_csv(out_base_path, index=False)
        artifacts.append(make_artifact("artifact-base-raw-1", "raw_dataset", "csv", out_base_path, node_id))
    else:
        events.append({"type": "QC_WARNING", "severity": "critical", "message": f"No base station data found in {abs_dir}"})

    if airborne_dfs:
        combined_airborne = pd.concat(airborne_dfs, ignore_index=True).sort_values("timestamp")
        out_air_path = os.path.join(out_dir, "airborne_canonical.csv")
        combined_airborne.to_csv(out_air_path, index=False)
        artifacts.append(make_artifact("artifact-airborne-raw-1", "raw_dataset", "csv", out_air_path, node_id))
    else:
        events.append({"type": "QC_WARNING", "severity": "fatal", "message": "No airborne CSVs found."})

    return {"artifacts": artifacts, "events": events}


if __name__ == "__main__":
    run_node(discover_files)
