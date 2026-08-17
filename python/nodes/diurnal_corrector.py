import sys
import os
import hashlib
from datetime import datetime
import pandas as pd

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core.node_runner import run_node

def compute_correction(payload: dict) -> dict:
    node_id = payload.get("node_id", "diurnal_corrector")
    project_name = payload.get("parameters", {}).get("projectName", "")
    task_folder = payload.get("parameters", {}).get("taskFolder", "")
    out_dir = payload.get("parameters", {}).get("outDir", "")
    
    interpolated_path = os.path.abspath(os.path.join(out_dir, task_folder, "base_interpolated.csv"))
    
    if not os.path.exists(interpolated_path):
        raise FileNotFoundError(f"Missing input artifact: {interpolated_path}")
        
    df = pd.read_csv(interpolated_path)
    
    events = []
    
    base_reference_method = payload.get("parameters", {}).get("baseReference", "mean_base")
    if base_reference_method == "median_base":
        base_reference_value = df['base_magnetic_field'].median()
    elif base_reference_method == "first_sample":
        base_reference_value = df['base_magnetic_field'].iloc[0]
    else:
        base_reference_value = df['base_magnetic_field'].mean()
        base_reference_method = "mean_base"
    
    df['corrected_magnetic_field'] = df['magnetic_field'] - df['base_magnetic_field'] + base_reference_value
    
    events.append({
        "type": "NODE_PROGRESS",
        "message": f"Applied diurnal correction using DiurnalReference method: {base_reference_method} ({base_reference_value:.2f} nT)."
    })
    
    out_path = os.path.abspath(os.path.join(out_dir, task_folder, "airborne_corrected.csv"))
    df.to_csv(out_path, index=False)
    
    timestamp = datetime.utcnow().isoformat() + "Z"
    
    corrected_artifact = {
        "id": "artifact-airborne-corrected-1",
        "type": "processed_dataset",
        "format": "csv",
        "lineage": ["artifact-base-interpolated-1"],
        "generated_by_node": node_id,
        "checksum": hashlib.sha256(open(out_path, 'rb').read()).hexdigest(),
        "created_at": timestamp,
        "path": out_path
    }

    return {
        "artifacts": [corrected_artifact],
        "events": events
    }

if __name__ == "__main__":
    run_node(compute_correction)
