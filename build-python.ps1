# build-python.ps1
# This script compiles the Python FastAPI/LangGraph environment into a standalone executable.

cd python
echo "Installing PyInstaller..."
python -m pip install pyinstaller

echo "Compiling Python Backend..."
# We use --onedir instead of --onefile because scipy/pandas extract very slowly from a single file
python -m poetry run pyinstaller -y --name g-aid-engine --onedir --hidden-import="pandas" --hidden-import="langchain" --hidden-import="langchain_ollama" --hidden-import="langgraph" --hidden-import="uvicorn.logging" --hidden-import="uvicorn.loops" --hidden-import="uvicorn.loops.auto" --hidden-import="uvicorn.protocols" --hidden-import="uvicorn.protocols.http" --hidden-import="uvicorn.protocols.http.auto" --hidden-import="uvicorn.protocols.websockets" --hidden-import="uvicorn.protocols.websockets.auto" --hidden-import="uvicorn.lifespan" --hidden-import="uvicorn.lifespan.on" --hidden-import="uvicorn.lifespan.off" main.py

echo "Build complete. Output located in python/dist/g-aid-engine/"
