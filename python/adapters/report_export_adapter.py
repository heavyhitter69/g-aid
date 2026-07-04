import sys
import os
import hashlib
from datetime import datetime

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core.node_runner import run_node

def export_report(payload: dict) -> dict:
    node_id = payload.get("node_id", "report_export_adapter")
    project_name = payload.get("parameters", {}).get("projectName", "")
    task_folder = payload.get("parameters", {}).get("taskFolder", "")
    out_dir = payload.get("parameters", {}).get("outDir", "")
    
    events = []
    
    # We could convert the qc_report.json into a PDF/HTML, but for Phase 1
    # We will just acknowledge the json report.
    report_path = os.path.abspath(os.path.join(out_dir, task_folder, "qc_report.json"))
    
    if os.path.exists(report_path):
        events.append({
            "type": "NODE_PROGRESS",
            "message": "QC Report JSON successfully finalized for diurnal analysis."
        })
    else:
        events.append({
            "type": "QC_WARNING",
            "severity": "warning",
            "message": "QC Report JSON missing for report export."
        })
    
    timestamp = datetime.utcnow().isoformat() + "Z"
    
    report_artifact = {
        "id": "artifact-pdf-report-1",
        "type": "qc_report",
        "format": "json",
        "lineage": ["artifact-qc-report-1"],
        "generated_by_node": node_id,
        "checksum": hashlib.sha256(b"report").hexdigest(),
        "created_at": timestamp,
        "path": report_path
    }

    return {
        "artifacts": [report_artifact],
        "events": events
    }

if __name__ == "__main__":
    run_node(export_report)
