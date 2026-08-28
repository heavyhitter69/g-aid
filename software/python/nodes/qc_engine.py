import sys
import os
import hashlib
import json
from datetime import datetime
import pandas as pd
import numpy as np

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core.node_runner import run_node

def run_qc(payload: dict) -> dict:
    node_id = payload.get("node_id", "qc_engine")
    project_name = payload.get("parameters", {}).get("projectName", "")
    task_folder = payload.get("parameters", {}).get("taskFolder", "")
    out_dir = payload.get("parameters", {}).get("outDir", "")
    
    corrected_path = os.path.abspath(os.path.join(out_dir, task_folder, "airborne_corrected.csv"))
    
    if not os.path.exists(corrected_path):
        raise FileNotFoundError(f"Missing input artifact: {corrected_path}")
        
    df = pd.read_csv(corrected_path)
    
    events = []
    
    # 1. Check for extreme diurnal gradients
    diurnal_variance = df['base_magnetic_field'].max() - df['base_magnetic_field'].min()
    if diurnal_variance > 50:
        events.append({
            "type": "QC_WARNING",
            "severity": "critical",
            "message": f"Extreme diurnal gradient detected: {diurnal_variance:.2f} nT variance over survey."
        })
    elif diurnal_variance > 10:
        events.append({
            "type": "QC_WARNING",
            "severity": "warning",
            "message": f"Moderate diurnal activity: {diurnal_variance:.2f} nT variance."
        })
    else:
        events.append({
            "type": "NODE_PROGRESS",
            "message": f"Diurnal activity is quiet: {diurnal_variance:.2f} nT variance."
        })
        
    # 2. Check for missing coords
    missing_coords = df[['x', 'y']].isna().sum().sum()
    if missing_coords > 0:
        events.append({
            "type": "QC_WARNING",
            "severity": "warning",
            "message": f"Detected {missing_coords} missing coordinate pairs in airborne data."
        })
        
    # Save the QC report
    qc_report = {
        "survey_duration_seconds": float(df['timestamp'].max() - df['timestamp'].min()),
        "total_samples_processed": len(df),
        "diurnal_variance_nT": float(diurnal_variance),
        "missing_coordinates": int(missing_coords),
        "base_magnetic_field_mean": float(df['base_magnetic_field'].mean()),
        "corrected_magnetic_field_mean": float(df['corrected_magnetic_field'].mean())
    }
    
    out_path = os.path.abspath(os.path.join(out_dir, task_folder, "qc_report.json"))
    with open(out_path, 'w') as f:
        json.dump(qc_report, f, indent=2)
    
    timestamp = datetime.utcnow().isoformat() + "Z"
    
    qc_artifact = {
        "id": "artifact-qc-report-1",
        "type": "qc_report",
        "format": "json",
        "lineage": ["artifact-airborne-corrected-1"],
        "generated_by_node": node_id,
        "checksum": hashlib.sha256(open(out_path, 'rb').read()).hexdigest(),
        "created_at": timestamp,
        "path": out_path
    }

    return {
        "artifacts": [qc_artifact],
        "events": events
    }

if __name__ == "__main__":
    run_node(run_qc)
