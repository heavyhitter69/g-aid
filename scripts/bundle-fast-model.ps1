# Bundle Qwen 2.5 3B + g-aid-orchestra-fast into resources/ai/models
# so the installer ships Fast mode. Uses a private Ollama port so a running G-AID is not disturbed.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$ollama = Join-Path $root "resources\ai\ollama.exe"
$models = Join-Path $root "resources\ai\models"
$modelfile = Join-Path $root "ollama\Modelfile.fast"
$hostAddr = "127.0.0.1:11435"

if (-not (Test-Path $ollama)) { throw "Missing $ollama" }
if (-not (Test-Path $modelfile)) { throw "Missing $modelfile" }

$env:OLLAMA_MODELS = $models
$env:OLLAMA_HOST = $hostAddr
$env:OLLAMA_LIBRARY_PATH = Join-Path $root "resources\ai"

$serve = Start-Process -FilePath $ollama -ArgumentList "serve" -PassThru -WindowStyle Hidden
try {
  $ready = $false
  for ($i = 0; $i -lt 40; $i++) {
    try {
      Invoke-WebRequest -Uri "http://$hostAddr/api/tags" -UseBasicParsing -TimeoutSec 2 | Out-Null
      $ready = $true
      break
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  if (-not $ready) { throw "Ollama did not start on $hostAddr" }

  Write-Output "Pulling qwen2.5:3b into $models"
  & $ollama pull qwen2.5:3b
  if ($LASTEXITCODE -ne 0) { throw "ollama pull failed: $LASTEXITCODE" }

  Write-Output "Creating g-aid-orchestra-fast"
  & $ollama create g-aid-orchestra-fast -f $modelfile
  if ($LASTEXITCODE -ne 0) { throw "ollama create failed: $LASTEXITCODE" }

  Write-Output "Models now in library:"
  & $ollama list
} finally {
  if ($serve -and -not $serve.HasExited) {
    Stop-Process -Id $serve.Id -Force -ErrorAction SilentlyContinue
  }
}
