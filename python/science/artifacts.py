"""Lineage, checksums, and node I/O helpers."""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from typing import Any


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_json(payload: Any) -> str:
    encoded = json.dumps(payload, sort_keys=True, default=str, separators=(",", ":")).encode("utf-8")
    return sha256_bytes(encoded)


def task_dir(payload: dict) -> str:
    params = payload.get("parameters") or {}
    out_dir = params.get("outDir") or ""
    task_folder = params.get("taskFolder") or ""
    if not out_dir:
        raise ValueError("parameters.outDir is required")
    path = os.path.abspath(os.path.join(out_dir, task_folder))
    os.makedirs(path, exist_ok=True)
    return path


def steps_of(payload: dict) -> dict:
    params = payload.get("parameters") or {}
    steps = params.get("steps")
    return steps if isinstance(steps, dict) else {}


def step_enabled(payload: dict, name: str, default: bool = True) -> bool:
    steps = steps_of(payload)
    if name not in steps:
        return default
    return bool(steps[name])


def skipped(node_id: str, reason: str) -> dict:
    return {
        "artifacts": [],
        "events": [{"type": "NODE_PROGRESS", "message": f"{node_id} skipped: {reason}"}],
    }


def make_artifact(
    artifact_id: str,
    artifact_type: str,
    fmt: str,
    path: str,
    node_id: str,
    lineage: list[str] | None = None,
    metadata: dict | None = None,
) -> dict:
    item = {
        "id": artifact_id,
        "type": artifact_type,
        "format": fmt,
        "lineage": lineage or [],
        "generated_by_node": node_id,
        "checksum": sha256_file(path),
        "created_at": utc_now(),
        "path": os.path.abspath(path),
    }
    if metadata:
        item["metadata"] = metadata
    return item


def write_json(path: str, payload: Any) -> str:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, default=str)
        handle.write("\n")
    return path


def write_lineage(directory: str, node_id: str, formula: str, parameters: dict, inputs: list[str], outputs: list[str]) -> str:
    path = os.path.join(directory, f"lineage_{node_id}.json")
    write_json(
        path,
        {
            "node_id": node_id,
            "formula": formula,
            "parameters": parameters,
            "inputs": inputs,
            "outputs": outputs,
            "created_at": utc_now(),
        },
    )
    return path
