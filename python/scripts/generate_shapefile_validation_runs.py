"""Write shapefile validation-ui kernel runs used by /workspace/verify-shapefile."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from kernels.vector import vector_export, vector_ingest, vector_interpret, vector_overlap, vector_view

FIXTURE = ROOT / "tests" / "fixtures" / "shapefile-project"
RUNS = ROOT / "tests" / "fixtures" / "validation-ui" / "G-AID Output" / "runs"


def write_plan(run_id: str, capabilities: list[str]) -> None:
    dest = RUNS / run_id
    dest.mkdir(parents=True, exist_ok=True)
    (dest / "plan.json").write_text(
        json.dumps(
            {
                "runId": run_id,
                "planHash": f"fixture-{run_id}",
                "intent": "gis",
                "status": "complete",
                "capabilities": capabilities,
                "product": "G-AID documented GIS vector layer",
                "parameters": {},
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def payload(run_id: str, inputs: list[dict]) -> dict:
    (RUNS / run_id).mkdir(parents=True, exist_ok=True)
    return {
        "parameters": {
            "baseDir": str(FIXTURE),
            "outDir": str(RUNS),
            "taskFolder": run_id,
            "catalogInputs": inputs,
        }
    }


def item(rel: str, catalog_id: str, role: str | None = None, reviewed: bool = False) -> dict:
    rec = {
        "catalogId": catalog_id,
        "path": rel,
        "adapterId": "shapefile",
        "formatId": "shapefile",
        "checksum": catalog_id,
        "absPath": str(FIXTURE / rel),
    }
    if role:
        rec["vectorRole"] = {"role": role, "reviewed": reviewed, "source": "user-assigned" if reviewed else "unassigned"}
    return rec


def run_ok(run_id: str, inputs: list[dict], overlap: bool = False, export: bool = False, interpret: bool = False) -> None:
    caps = ["gis.vector_ingest", "gis.vector_view"]
    body = payload(run_id, inputs)
    vector_ingest(body)
    vector_view(body)
    if overlap:
        caps.append("gis.spatial_overlap")
        vector_overlap(body)
    if export:
        caps.append("gis.export_vector")
        vector_export(body)
    if interpret:
        caps.append("gis.interpret")
        vector_interpret(body)
    write_plan(run_id, caps)


def main() -> None:
    RUNS.mkdir(parents=True, exist_ok=True)
    run_ok("r-verify-shp-points", [item("points/samples.shp", "points")])
    run_ok("r-verify-shp-lines", [item("lines/faults.shp", "lines")])
    run_ok(
        "r-verify-shp-polygons",
        [item("polygons/geology.shp", "geology")],
    )
    run_ok(
        "r-verify-shp-overlap",
        [
            item("overlap/tenure.shp", "tenure", "tenure", True),
            item("overlap/samples.shp", "samples", "sample-location", True),
        ],
        overlap=True,
        export=True,
    )
    run_ok(
        "r-verify-shp-conflict",
        [
            item("conflict-crs/utm_samples.shp", "utm"),
            item("conflict-crs/wgs_samples.shp", "wgs"),
        ],
        overlap=True,
    )
    run_ok(
        "r-verify-shp-interpret",
        [
            item("overlap/tenure.shp", "tenure", "tenure", True),
            item("overlap/samples.shp", "samples", "sample-location", True),
        ],
        overlap=True,
        interpret=True,
    )

    blocked = RUNS / "r-verify-shp-blocked"
    blocked.mkdir(parents=True, exist_ok=True)
    write_plan("r-verify-shp-blocked", ["gis.vector_ingest"])
    (blocked / "vector_ingest_qc.json").write_text(
        json.dumps(
            {
                "product_name": "G-AID documented GIS vector layer",
                "n_layers": 0,
                "reprojected": False,
                "rejected": [
                    {
                        "source_path": "missing-dbf/samples.shp",
                        "reason": "Shapefile sidecar set is incomplete (missing .dbf).",
                    },
                    {
                        "source_path": "unknown-crs/geology.shp",
                        "reason": "Shapefile .prj has no EPSG authority.",
                    },
                    {
                        "source_path": "corrupt-dbf/samples.shp",
                        "reason": "DBF is unparseable.",
                    },
                    {
                        "source_path": "invalid-geometry/open-ring.shp",
                        "reason": "Polygon geometry is malformed.",
                    },
                ],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"Wrote shapefile validation runs under {RUNS}")


if __name__ == "__main__":
    main()
