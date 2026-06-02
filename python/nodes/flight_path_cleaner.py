import sys
import os
import hashlib
from datetime import datetime
import pandas as pd
import numpy as np

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core.node_runner import run_node

def haversine(lat1, lon1, lat2, lon2):
    """
    Calculate the great circle distance between two points 
    on the earth (specified in decimal degrees)
    """
    # convert decimal degrees to radians 
    lon1, lat1, lon2, lat2 = map(np.radians, [lon1, lat1, lon2, lat2])

    # haversine formula 
    dlon = lon2 - lon1 
    dlat = lat2 - lat1 
    a = np.sin(dlat/2)**2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon/2)**2
    c = 2 * np.arcsin(np.sqrt(a)) 
    r = 6371000 # Radius of earth in meters
    return c * r

def clean_flight_path(payload: dict) -> dict:
    node_id = payload.get("node_id", "flight_path_cleaner")
    project_name = payload.get("parameters", {}).get("projectName", "")
    task_folder = payload.get("parameters", {}).get("taskFolder", "")
    
    # We expect airborne_canonical.csv to be in the artifacts
    airborne_path = os.path.abspath(os.path.join(out_dir, task_folder, "airborne_canonical.csv"))
    
    if not os.path.exists(airborne_path):
        raise FileNotFoundError(f"Missing input artifact: {airborne_path}")
        
    df = pd.read_csv(airborne_path)
    
    events = []
    
    # Calculate velocity to filter out stationary or slow points (e.g. takeoff/landing/turns)
    df['dist_m'] = haversine(
        df['y'].shift(), df['x'].shift(),
        df['y'], df['x']
    )
    df['dt_s'] = df['timestamp'].diff()
    df['velocity'] = df['dist_m'] / df['dt_s']
    
    # Basic velocity threshold for a drone (e.g., must be > 1 m/s and < 30 m/s)
    # Also handle NaNs for first row
    is_production = (df['velocity'] > 1.0) & (df['velocity'] < 30.0)
    
    # Keep the production data
    clean_df = df[is_production].copy()
    
    dropped_count = len(df) - len(clean_df)
    events.append({
        "type": "NODE_PROGRESS",
        "message": f"Cleaned flight path. Dropped {dropped_count} non-production points based on velocity thresholds."
    })
    
    out_path = os.path.abspath(os.path.join(out_dir, task_folder, "airborne_cleaned.csv"))
    clean_df.to_csv(out_path, index=False)
    
    timestamp = datetime.utcnow().isoformat() + "Z"
    
    cleaned_artifact = {
        "id": "artifact-airborne-cleaned-1",
        "type": "processed_dataset",
        "format": "csv",
        "lineage": ["artifact-airborne-raw-1"],
        "generated_by_node": node_id,
        "checksum": hashlib.sha256(open(out_path, 'rb').read()).hexdigest(),
        "created_at": timestamp,
        "path": out_path
    }

    return {
        "artifacts": [cleaned_artifact],
        "events": events
    }

if __name__ == "__main__":
    run_node(clean_flight_path)
