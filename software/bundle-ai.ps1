# bundle-ai.ps1
# This script bundles the local Ollama executable and DeepSeek model into the project for offline packaging.

$OllamaSource = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
$ModelSource = "$env:USERPROFILE\.ollama\models"
$TargetDir = "resources\ai"

Write-Host "Creating AI bundle directory..."
if (!(Test-Path -Path $TargetDir)) {
    New-Item -ItemType Directory -Force -Path $TargetDir
}

if (Test-Path $OllamaSource) {
    Write-Host "Copying ollama.exe..."
    Copy-Item $OllamaSource -Destination "$TargetDir\ollama.exe" -Force
} else {
    Write-Host "WARNING: ollama.exe not found at $OllamaSource"
}

$TargetModelDir = "$TargetDir\models"
if (!(Test-Path -Path $TargetModelDir)) {
    New-Item -ItemType Directory -Force -Path $TargetModelDir
}

if (Test-Path $ModelSource) {
    Write-Host "Copying Ollama models (this may take a few minutes for 5GB+ files)..."
    # Copying the blobs and manifests
    Copy-Item -Path "$ModelSource\blobs" -Destination $TargetModelDir -Recurse -Force
    Copy-Item -Path "$ModelSource\manifests" -Destination $TargetModelDir -Recurse -Force
    Write-Host "Models copied successfully!"
} else {
    Write-Host "WARNING: Ollama models not found at $ModelSource"
}

Write-Host "AI Bundling complete. The resources/ai folder is ready for electron-builder."
