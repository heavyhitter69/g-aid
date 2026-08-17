from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
from typing import Any
import uvicorn
import os
import sys
from graph import stream_langgraph_agent

ROOT = os.path.dirname(os.path.abspath(__file__))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

app = FastAPI(title="G-AID Core Intelligence Engine", version="1.0.0")

# Enable secure local loopback IPC communication with Electron app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class OrchestrationRequest(BaseModel):
    prompt: str
    session_id: str

class RunNodeRequest(BaseModel):
    node_id: str
    parameters: dict[str, Any] = {}
    input_artifacts: list[Any] = []

def get_node_handler(node_id: str):
    from kernels import get_handler
    return get_handler(node_id)

@app.post("/api/v1/orchestrate")
async def orchestrate_pipeline(request: OrchestrationRequest):
    try:
        return StreamingResponse(
            stream_langgraph_agent(request.prompt, request.session_id),
            media_type="application/octet-stream"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/run-node")
def run_pipeline_node(request: RunNodeRequest):
    try:
        handler = get_node_handler(request.node_id)
        if handler is None:
            raise HTTPException(status_code=404, detail=f"Unknown node: {request.node_id}")
        result = handler({
            "node_id": request.node_id,
            "parameters": request.parameters,
            "input_artifacts": request.input_artifacts,
        })
        return {
            "success": True,
            "artifacts": result.get("artifacts", []),
            "events": result.get("events", []),
        }
    except HTTPException:
        raise
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "artifacts": [],
            "events": [{
                "type": "PIPELINE_FAILED",
                "message": f"Exception in Python node: {str(e)}",
                "severity": "fatal",
            }],
        }

if __name__ == "__main__":
    import multiprocessing

    multiprocessing.freeze_support()
    frozen = getattr(sys, "frozen", False)
    if frozen:
        # Pass the app object so PyInstaller cannot spawn a uvicorn --reload supervisor.
        uvicorn.run(app, host="127.0.0.1", port=8000, reload=False, workers=1)
    else:
        uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
