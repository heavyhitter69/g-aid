import sys
import os
import json
import hashlib
from datetime import datetime
from html import escape

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core.node_runner import run_node


def export_report(payload: dict) -> dict:
    node_id = payload.get("node_id", "report_export_adapter")
    project_name = payload.get("parameters", {}).get("projectName", "")
    task_folder = payload.get("parameters", {}).get("taskFolder", "")
    out_dir = payload.get("parameters", {}).get("outDir", "")
    task_dir = os.path.abspath(os.path.join(out_dir, task_folder))
    events = []
    sections = []
    for name in (
        "qc_report.json",
        "igrf_qc.json",
        "heading_lag_qc.json",
        "leveling_qc.json",
        "microlevel_qc.json",
        "grid_qc.json",
        "rtp_qc.json",
        "lineaments_qc.json",
        "euler_qc.json",
        "gravity_qc.json",
        "ert_survey.json",
        "seismic_qc.json",
        "gpr_qc.json",
    ):
        path = os.path.join(task_dir, name)
        if not os.path.isfile(path):
            continue
        with open(path, encoding="utf-8") as handle:
            payload_json = json.load(handle)
        sections.append((name, payload_json))

    for fname in sorted(os.listdir(task_dir) if os.path.isdir(task_dir) else []):
        if fname.startswith("map_") and fname.endswith(".png"):
            sections.append((fname, {"figure": fname}))

    html_path = os.path.join(task_dir, "g-aid_report.html")
    blocks = []
    for name, data in sections:
        if isinstance(data, dict) and data.get("figure"):
            blocks.append(
                f"<h2>{escape(name)}</h2><img src='{escape(str(data['figure']))}' "
                "style='max-width:100%;background:#fff;padding:8px'/>"
            )
        else:
            body = escape(json.dumps(data, indent=2)[:12000])
            blocks.append(f"<h2>{escape(name)}</h2><pre>{body}</pre>")
    html = (
        "<!DOCTYPE html><html><head><meta charset='utf-8'><title>G-AID report</title>"
        "<style>body{font-family:Segoe UI,sans-serif;background:#111;color:#ddd;margin:24px}"
        "h1,h2{color:#fff}pre{background:#1b1b1b;padding:12px;overflow:auto}</style></head><body>"
        f"<h1>{escape(project_name or 'G-AID')} — {escape(task_folder)}</h1>"
        f"<p>Generated {datetime.utcnow().isoformat()}Z</p>"
        + "".join(blocks)
        + "</body></html>"
    )
    os.makedirs(task_dir, exist_ok=True)
    with open(html_path, "w", encoding="utf-8") as handle:
        handle.write(html)
    events.append({"type": "NODE_PROGRESS", "message": f"Wrote g-aid_report.html ({len(sections)} QC sections)."})
    if not sections:
        events.append({"type": "QC_WARNING", "severity": "warning", "message": "No QC JSON files found for the HTML report."})

    digest = hashlib.sha256(open(html_path, "rb").read()).hexdigest()
    return {
        "artifacts": [{
            "id": "artifact-html-report-1",
            "type": "qc_report",
            "format": "html",
            "lineage": ["artifact-qc-report-1"],
            "generated_by_node": node_id,
            "checksum": digest,
            "created_at": datetime.utcnow().isoformat() + "Z",
            "path": html_path,
        }],
        "events": events,
    }


if __name__ == "__main__":
    run_node(export_report)
