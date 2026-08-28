"""Write raster validation-ui kernel runs used by /workspace/verify-raster."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from kernels.raster import raster_inspect, raster_view, terrain_view

FIXTURE = ROOT / "tests" / "fixtures" / "raster-project"
RUNS = ROOT / "tests" / "fixtures" / "validation-ui" / "G-AID Output" / "runs"


def write_plan(run_id: str, capabilities: list[str]) -> None:
    dest = RUNS / run_id
    dest.mkdir(parents=True, exist_ok=True)
    (dest / "plan.json").write_text(
        json.dumps(
            {
                "runId": run_id,
                "planHash": f"fixture-{run_id}",
                "intent": "raster",
                "status": "complete",
                "capabilities": capabilities,
                "product": "G-AID documented raster layer",
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


def item(rel: str, catalog_id: str, adapter: str) -> dict:
    return {
        "catalogId": catalog_id,
        "path": rel,
        "adapterId": adapter,
        "formatId": adapter,
        "checksum": catalog_id,
        "absPath": str(FIXTURE / rel),
    }


def run_ok(run_id: str, inputs: list[dict], terrain: bool = False) -> None:
    caps = ["gis.raster_inspect", "gis.raster_view"]
    body = payload(run_id, inputs)
    raster_inspect(body)
    raster_view(body)
    if terrain:
        caps.append("gis.terrain_view")
        terrain_view(body)
    write_plan(run_id, caps)


def main() -> None:
    run_ok("r-verify-raster-geotiff", [item("valid-geotiff/grid.tif", "rec-gtiff", "geotiff")])
    run_ok("r-verify-raster-ascii", [item("ascii-valid/grid.asc", "rec-ascii", "esri-ascii-grid")])
    run_ok("r-verify-raster-dem", [item("dem-valid/dem.asc", "rec-dem", "dem-ascii")], terrain=True)
    run_ok("r-verify-raster-compressed", [item("compressed/grid.tif", "rec-lzw", "geotiff")])
    run_ok("r-verify-raster-cog", [item("cog-tiled/grid.tif", "rec-cog", "geotiff")])
    run_ok("r-verify-raster-huge", [item("huge/grid.tif", "rec-huge", "geotiff")])
    run_ok("r-verify-raster-missing-crs", [item("missing-crs/grid.tif", "rec-nocr", "geotiff")])
    run_ok(
        "r-verify-raster-conflict",
        [
            item("crs-conflict/utm.tif", "rec-utm", "geotiff"),
            item("crs-conflict/other.asc", "rec-4326", "esri-ascii-grid"),
        ],
    )
    blocked = RUNS / "r-verify-raster-filename-dem"
    blocked.mkdir(parents=True, exist_ok=True)
    write_plan("r-verify-raster-filename-dem", ["gis.terrain_view"])
    (blocked / "terrain_tracks.meta.json").write_text(
        json.dumps(
            {
                "kind": "gis-terrain",
                "filename_dem_inference": False,
                "skipped": True,
                "reason": "dem-filename-only/dem.asc is esri-ascii-grid, not dem-ascii.",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print("wrote raster validation-ui runs")


if __name__ == "__main__":
    main()
