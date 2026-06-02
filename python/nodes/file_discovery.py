import sys
import os
import hashlib
from datetime import datetime
import pandas as pd
import numpy as np
import io
import math

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core.node_runner import run_node

def parse_gsm19_base(filepath: str) -> pd.DataFrame:
    """Parses GSM-19 format BASE.txt file"""
    with open(filepath, 'r') as f:
        lines = f.readlines()
        
    data_lines = []
    # Find the header line 'time nT sq'
    start_idx = -1
    for i, line in enumerate(lines):
        if 'time nT sq' in line:
            start_idx = i + 1
            break
            
    if start_idx == -1:
        raise ValueError(f"Could not find 'time nT sq' header in {filepath}")
        
    for line in lines[start_idx:]:
        parts = line.strip().split()
        if len(parts) >= 2:
            data_lines.append(parts)
            
    df = pd.DataFrame(data_lines, columns=['time_str', 'nT', 'sq'] if len(data_lines[0]) == 3 else ['time_str', 'nT'])
    df['nT'] = pd.to_numeric(df['nT'], errors='coerce')
    
    # GSM-19 time is usually HHMMSS.s 
    # Example: 093451.0
    # Let's assume the date is 2026/04/25 from the header
    from datetime import timezone
    def parse_time(t_str):
        try:
            h = int(t_str[0:2])
            m = int(t_str[2:4])
            s = float(t_str[4:])
            # Create a unix timestamp in UTC to match Pandas to_datetime
            dt = datetime(2026, 4, 25, h, m, int(s), int((s - int(s)) * 1000000), tzinfo=timezone.utc)
            return dt.timestamp()
        except:
            return np.nan

    df['timestamp'] = df['time_str'].apply(parse_time)
    df = df.dropna(subset=['timestamp', 'nT']).sort_values('timestamp')
    
    # Rename for SurveySample canonical format
    df['magnetic_field'] = df['nT']
    df['source'] = 'base_station'
    df['x'] = 0.0
    df['y'] = 0.0
    
    return df[['timestamp', 'x', 'y', 'magnetic_field', 'source']]

def parse_magarrow_csv(filepath: str) -> pd.DataFrame:
    """Parses MagArrow CSV format"""
    # Due to NMEA strings containing commas, some rows have more columns than the header.
    # We will read with a large number of names, then rename the ones we care about.
    df = pd.read_csv(filepath, names=list(range(100)), skiprows=1, low_memory=False)
    
    # Extract the columns we need based on standard MAGARROW header index:
    # 1: Date, 2: Time, 3: Latitude, 4: Longitude, 5: Mag, 22: Altitude (approx)
    # The header was: Counter,Date,Time,Latitude,Longitude,Mag,...
    
    df_clean = pd.DataFrame()
    df_clean['Date'] = df[1]
    df_clean['Time'] = df[2]
    df_clean['y'] = pd.to_numeric(df[3], errors='coerce')
    df_clean['x'] = pd.to_numeric(df[4], errors='coerce')
    df_clean['magnetic_field'] = pd.to_numeric(df[5], errors='coerce')
    
    df_clean['datetime_str'] = df_clean['Date'].astype(str) + ' ' + df_clean['Time'].astype(str)
    df_clean['timestamp'] = pd.to_datetime(df_clean['datetime_str'], errors='coerce', utc=True).apply(lambda x: x.timestamp())
    
    df_clean['source'] = 'airborne'
    df_clean['line_id'] = os.path.basename(filepath).split('-')[0].strip()
    
    # Drop rows where we couldn't parse coordinate or mag
    df_clean = df_clean.dropna(subset=['x', 'y', 'magnetic_field'])
    
    return df_clean[['timestamp', 'x', 'y', 'magnetic_field', 'source', 'line_id']]

def discover_files(payload: dict) -> dict:
    node_id = payload.get("node_id", "file_discovery")
    params = payload.get("parameters", {})
    
    project_name = params.get("projectName", "")
    target_folder = params.get("targetFolder", "DAY 1")
    task_folder = params.get("taskFolder", "")
    base_dir = params.get("baseDir", "")
    out_dir = params.get("outDir", "")
    
    # We expect files to be in public/{project_name}/{target_folder}
    abs_dir = os.path.abspath(os.path.join(base_dir, target_folder))
    
    if not os.path.exists(abs_dir):
        raise FileNotFoundError(f"Survey directory not found: {abs_dir}")
        
    events = []
    artifacts = []
    
    out_dir = os.path.abspath(os.path.join(out_dir, task_folder))
    os.makedirs(out_dir, exist_ok=True)
    
    base_dfs = []
    airborne_dfs = []
    
    # Recursively find and classify files
    for root_dir, _, files in os.walk(abs_dir):
        for f in files:
            filepath = os.path.join(root_dir, f)
            if not (f.lower().endswith(".csv") or f.lower().endswith(".txt")):
                continue
                
            # Inspect header
            try:
                with open(filepath, 'r', errors='ignore') as file_obj:
                    # Read up to 50 lines to find the headers
                    head = []
                    for _ in range(50):
                        try:
                            head.append(next(file_obj))
                        except StopIteration:
                            break
                    head_str = "".join(head).lower()
                    
                    if "time nt sq" in head_str:
                        events.append({"type": "NODE_PROGRESS", "message": f"Classified {f} as Base Station (GSM-19)."})
                        df = parse_gsm19_base(filepath)
                        base_dfs.append(df)
                    elif "latitude" in head_str and "longitude" in head_str and "mag" in head_str:
                        events.append({"type": "NODE_PROGRESS", "message": f"Classified {f} as Airborne (MagArrow)."})
                        df = parse_magarrow_csv(filepath)
                        airborne_dfs.append(df)
            except Exception as e:
                events.append({"type": "QC_WARNING", "severity": "warning", "message": f"Failed to inspect or parse {f}: {str(e)}"})

    if base_dfs:
        combined_base = pd.concat(base_dfs, ignore_index=True).sort_values("timestamp")
        out_base_path = os.path.join(out_dir, "base_station_canonical.csv")
        combined_base.to_csv(out_base_path, index=False)
        artifacts.append({
            "id": "artifact-base-raw-1",
            "type": "raw_dataset",
            "format": "csv",
            "lineage": [],
            "generated_by_node": node_id,
            "checksum": hashlib.sha256(open(out_base_path, 'rb').read()).hexdigest(),
            "created_at": datetime.utcnow().isoformat() + "Z",
            "path": out_base_path
        })
    else:
        events.append({"type": "QC_WARNING", "severity": "critical", "message": f"No base station data found in {abs_dir}"})
        
    if airborne_dfs:
        combined_airborne = pd.concat(airborne_dfs, ignore_index=True).sort_values("timestamp")
        out_air_path = os.path.join(out_dir, "airborne_canonical.csv")
        combined_airborne.to_csv(out_air_path, index=False)
        artifacts.append({
            "id": "artifact-airborne-raw-1",
            "type": "raw_dataset",
            "format": "csv",
            "lineage": [],
            "generated_by_node": node_id,
            "checksum": hashlib.sha256(open(out_air_path, 'rb').read()).hexdigest(),
            "created_at": datetime.utcnow().isoformat() + "Z",
            "path": out_air_path
        })
    else:
        events.append({"type": "QC_WARNING", "severity": "fatal", "message": "No airborne CSVs found."})

    return {
        "artifacts": artifacts,
        "events": events
    }

if __name__ == "__main__":
    run_node(discover_files)
