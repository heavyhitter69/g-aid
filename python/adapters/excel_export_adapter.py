import sys
import os
import hashlib
from datetime import datetime
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
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
    
    # out_dir is already set above from payload
    plot_path = os.path.join(out_dir, task_folder, "mag_map.png")
    excel_path = os.path.join(out_dir, task_folder, "diurnal_analysis.xlsx")
    
    # 1. Generate spatial plot using matplotlib
    plt.figure(figsize=(10, 8))
    # Normalize timestamps to display a continuous path
    scatter = plt.scatter(df['x'], df['y'], c=df['corrected_magnetic_field'], cmap='jet', s=1)
    plt.colorbar(scatter, label='Corrected Magnetic Field (nT)')
    plt.title('Airborne Magnetic Survey - Diurnally Corrected')
    plt.xlabel('Longitude')
    plt.ylabel('Latitude')
    plt.grid(True, linestyle='--', alpha=0.5)
    plt.savefig(plot_path, dpi=300, bbox_inches='tight')
    plt.close()
    
    events.append({
        "type": "NODE_PROGRESS",
        "message": "Generated spatial magnetic field plot (mag_map.png)."
    })
    
    # 2. Generate Excel workbook
    # To embed image in excel we use openpyxl via pandas
    with pd.ExcelWriter(excel_path, engine='openpyxl') as writer:
        # Write downsampled data for excel so it doesn't crash (10Hz can be huge)
        df_downsampled = df.iloc[::10, :] # 1Hz
        df_downsampled.to_excel(writer, sheet_name='Corrected Data', index=False)
        
        # Add a sheet with the image
        workbook = writer.book
        worksheet = workbook.create_sheet('Plots')
        from openpyxl.drawing.image import Image
        img = Image(plot_path)
        worksheet.add_image(img, 'A1')
        
    events.append({
        "type": "NODE_PROGRESS",
        "message": "Generated Excel workbook with downsampled data and embedded spatial plot."
    })
        
    timestamp = datetime.utcnow().isoformat() + "Z"
    
    excel_artifact = {
        "id": "artifact-excel-workbook-1",
        "type": "plot",
        "format": "xlsx",
        "lineage": ["artifact-airborne-corrected-1"],
        "generated_by_node": node_id,
        "checksum": hashlib.sha256(open(excel_path, 'rb').read()).hexdigest(),
        "created_at": timestamp,
        "path": excel_path
    }

    return {
        "artifacts": [excel_artifact],
        "events": events
    }

if __name__ == "__main__":
    run_node(export_excel)
