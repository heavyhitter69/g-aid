import sys
import os
import hashlib
from datetime import datetime
import pandas as pd

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_vendor = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "_vendor")
if os.path.isdir(_vendor) and _vendor not in sys.path:
    sys.path.insert(0, _vendor)
import et_xmlfile  # noqa: F401 — bundled with the frozen engine
import openpyxl  # noqa: F401 — pandas ExcelWriter looks this up lazily
from core.node_runner import run_node

def export_excel(payload: dict) -> dict:
    node_id = payload.get("node_id", "excel_export_adapter")
    project_name = payload.get("parameters", {}).get("projectName", "")
    task_folder = payload.get("parameters", {}).get("taskFolder", "")
    out_dir = payload.get("parameters", {}).get("outDir", "")
    
    corrected_path = os.path.abspath(os.path.join(out_dir, task_folder, "airborne_corrected.csv"))
    
    if not os.path.exists(corrected_path):
        raise FileNotFoundError(f"Missing input artifact: {corrected_path}")
        
    df = pd.read_csv(corrected_path)
    events = []
    excel_path = os.path.join(out_dir, task_folder, "diurnal_analysis.xlsx")
    artifacts = []

    try:
        with pd.ExcelWriter(excel_path, engine='openpyxl') as writer:
            df_downsampled = df.iloc[::10, :]
            df_downsampled.to_excel(writer, sheet_name='Corrected Data', index=False)
        events.append({
            "type": "NODE_PROGRESS",
            "message": "Generated Excel workbook with downsampled diurnal-corrected samples."
        })
        artifacts.append({
            "id": "artifact-excel-workbook-1",
            "type": "plot",
            "format": "xlsx",
            "lineage": ["artifact-airborne-corrected-1"],
            "generated_by_node": node_id,
            "checksum": hashlib.sha256(open(excel_path, 'rb').read()).hexdigest(),
            "created_at": datetime.utcnow().isoformat() + "Z",
            "path": excel_path
        })
    except Exception as exc:
        fallback_csv = os.path.join(out_dir, task_folder, "diurnal_analysis_downsampled.csv")
        df.iloc[::10, :].to_csv(fallback_csv, index=False)
        events.append({
            "type": "QC_WARNING",
            "severity": "warning",
            "message": f"Excel export unavailable ({exc}). Wrote {os.path.basename(fallback_csv)} instead."
        })
        artifacts.append({
            "id": "artifact-excel-fallback-1",
            "type": "processed_dataset",
            "format": "csv",
            "lineage": ["artifact-airborne-corrected-1"],
            "generated_by_node": node_id,
            "checksum": hashlib.sha256(open(fallback_csv, 'rb').read()).hexdigest(),
            "created_at": datetime.utcnow().isoformat() + "Z",
            "path": fallback_csv
        })

    return {
        "artifacts": artifacts,
        "events": events
    }

if __name__ == "__main__":
    run_node(export_excel)
