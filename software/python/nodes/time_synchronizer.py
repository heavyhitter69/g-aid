import sys
import os
import hashlib
from datetime import datetime
import pandas as pd
import numpy as np
from scipy.interpolate import interp1d

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core.node_runner import run_node

def synchronize_time(payload: dict) -> dict:
    node_id = payload.get("node_id", "time_synchronizer")
    project_name = payload.get("parameters", {}).get("projectName", "")
    task_folder = payload.get("parameters", {}).get("taskFolder", "")
    out_dir = payload.get("parameters", {}).get("outDir", "")
    
    # We expect base_station_canonical.csv and airborne_cleaned.csv
    base_path = os.path.abspath(os.path.join(out_dir, task_folder, "base_station_canonical.csv"))
    airborne_path = os.path.abspath(os.path.join(out_dir, task_folder, "airborne_cleaned.csv"))
    
    if not os.path.exists(base_path) or not os.path.exists(airborne_path):
        raise FileNotFoundError("Missing required input artifacts for time synchronization.")
        
    df_base = pd.read_csv(base_path)
    df_air = pd.read_csv(airborne_path)
    
    events = []
    
    # Check max gap in base station
    base_dt = df_base['timestamp'].diff()
    max_gap = base_dt.max()
    
    events.append({
        "type": "NODE_PROGRESS",
        "message": f"Base station max temporal gap is {max_gap:.2f} seconds."
    })
    
    if max_gap > 300:
        events.append({
            "type": "QC_WARNING",
            "severity": "warning",
            "message": f"Large gap in base station data detected: {max_gap:.2f}s."
        })
        
    # Interpolate base station magnetic field to airborne timestamps
    # Linear interpolation by default
    interpolator = interp1d(
        df_base['timestamp'], 
        df_base['magnetic_field'], 
        kind='linear',
        bounds_error=False,
        fill_value=np.nan
    )
    
    df_air['base_magnetic_field'] = interpolator(df_air['timestamp'])
    
    dropped_count = df_air['base_magnetic_field'].isna().sum()
    if dropped_count > 0:
        events.append({
            "type": "QC_WARNING",
            "severity": "warning",
            "message": f"Dropped {dropped_count} airborne points due to missing base station overlap."
        })
        df_air = df_air.dropna(subset=['base_magnetic_field'])
        
    out_path = os.path.abspath(os.path.join(out_dir, task_folder, "base_interpolated.csv"))
    df_air.to_csv(out_path, index=False)
    
    timestamp = datetime.utcnow().isoformat() + "Z"
    
    interpolated_artifact = {
        "id": "artifact-base-interpolated-1",
        "type": "processed_dataset",
        "format": "csv",
        "lineage": ["artifact-base-raw-1", "artifact-airborne-cleaned-1"],
        "generated_by_node": node_id,
        "checksum": hashlib.sha256(open(out_path, 'rb').read()).hexdigest(),
        "created_at": timestamp,
        "path": out_path
    }

    return {
        "artifacts": [interpolated_artifact],
        "events": events
    }

if __name__ == "__main__":
    run_node(synchronize_time)
