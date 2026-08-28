import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core.node_runner import run_node
from kernels import dispatch


def run(payload: dict) -> dict:
    node_id = payload.get("node_id")
    if not node_id:
        raise ValueError("payload.node_id is required")
    return dispatch(node_id, payload)


if __name__ == "__main__":
    run_node(run)
