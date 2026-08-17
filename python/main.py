from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
import uvicorn
from graph import stream_langgraph_agent

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

@app.post("/api/v1/orchestrate")
async def orchestrate_pipeline(request: OrchestrationRequest):
    try:
        return StreamingResponse(
            stream_langgraph_agent(request.prompt, request.session_id),
            media_type="application/octet-stream"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import sys
    import multiprocessing

    multiprocessing.freeze_support()
    frozen = getattr(sys, "frozen", False)
    if frozen:
        # Pass the app object so PyInstaller cannot spawn a uvicorn --reload supervisor.
        uvicorn.run(app, host="127.0.0.1", port=8000, reload=False, workers=1)
    else:
        uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
