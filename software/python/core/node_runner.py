import sys
import json
from dataclasses import asdict
from typing import Callable, Any, Dict

def run_node(handler: Callable[[Dict[str, Any]], Dict[str, Any]]):
    """
    Reads a PipelineNodeExecution payload from stdin, passes it to the handler,
    and writes the NodeResult to stdout.
    """
    try:
        input_data = sys.stdin.read()
        if not input_data.strip():
            raise ValueError("No input payload provided via stdin")
        
        payload = json.loads(input_data)
        
        # Execute the specific node logic
        result = handler(payload)
        
        # Write success result
        sys.stdout.write(json.dumps({
            "success": True,
            "artifacts": result.get("artifacts", []),
            "events": result.get("events", [])
        }))
        sys.exit(0)
    except Exception as e:
        # Write error result
        sys.stdout.write(json.dumps({
            "success": False,
            "error": str(e),
            "artifacts": [],
            "events": [{
                "type": "PIPELINE_FAILED",
                "message": f"Exception in Python node: {str(e)}",
                "severity": "fatal"
            }]
        }))
        sys.exit(1)
