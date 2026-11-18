$ErrorActionPreference = 'Stop'
try {
    $null = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 3
    Write-Output 'Ollama is already reachable on 127.0.0.1:11434.'
    return
} catch { }
$serviceRoot = Split-Path -Parent $PSScriptRoot
$projectRoot = Split-Path -Parent (Split-Path -Parent $serviceRoot)
$ollamaExecutable = Join-Path $projectRoot '.tools\ollama\ollama.exe'
if (-not (Test-Path -LiteralPath $ollamaExecutable)) { throw 'Portable Ollama is missing. Install official Ollama or restore .tools/ollama first.' }
$env:OLLAMA_HOST = '127.0.0.1:11434'
$env:OLLAMA_MODELS = Join-Path $env:USERPROFILE '.ollama\models'
$env:OLLAMA_MAX_LOADED_MODELS = '2'
$env:OLLAMA_NUM_PARALLEL = '1'
$logDirectory = Join-Path $serviceRoot 'artifacts\local_runtime'
$null = New-Item -ItemType Directory -Path $logDirectory -Force
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$process = Start-Process -FilePath $ollamaExecutable -ArgumentList @('serve') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDirectory "ollama_${stamp}.stdout.log") -RedirectStandardError (Join-Path $logDirectory "ollama_${stamp}.stderr.log")
Write-Output "Started local Ollama PID $($process.Id); model files remain in the existing user model directory."
