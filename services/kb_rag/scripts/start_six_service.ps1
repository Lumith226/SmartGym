param([int]$Port = 8011, [string]$ChatModel = '', [string]$IndexDirectory = '', [ValidateSet('local','neo4j')][string]$GraphBackend = 'neo4j')
$ErrorActionPreference = 'Stop'
$serviceRoot = Split-Path -Parent $PSScriptRoot
$pythonPath = Join-Path (Split-Path -Parent (Split-Path -Parent $serviceRoot)) '.tools\python\python.exe'
$artifactRoot = Join-Path $serviceRoot 'artifacts\six_exercises_20261117'
if (-not $IndexDirectory) { $IndexDirectory = Join-Path $serviceRoot 'data\releases\six_exercises_20261118_r3' }
$resolvedIndex = (Resolve-Path -LiteralPath $IndexDirectory).Path
if (-not (Test-Path -LiteralPath (Join-Path $resolvedIndex 'snapshot.json'))) { throw 'Chosen KB index has no snapshot.json.' }
$existing = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'python.exe' -and $_.CommandLine -like '*uvicorn kb_service.app:app*' -and $_.CommandLine -match "--port $Port(?:\s|$)"
}
foreach ($process in $existing) { Stop-Process -Id $process.ProcessId -ErrorAction Stop }
$env:KB_INDEX_DIR = $resolvedIndex
$env:KB_GRAPH_BACKEND = $GraphBackend
if ($ChatModel) { $env:OLLAMA_CHAT_MODEL = $ChatModel } else { Remove-Item Env:OLLAMA_CHAT_MODEL -ErrorAction SilentlyContinue }
$env:PYTHONIOENCODING = 'utf-8'
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$started = Start-Process -FilePath $pythonPath -ArgumentList @('-m','uvicorn','kb_service.app:app','--host','127.0.0.1','--port',"$Port") -WorkingDirectory $serviceRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $artifactRoot "api_${Port}_${stamp}.stdout.log") -RedirectStandardError (Join-Path $artifactRoot "api_${Port}_${stamp}.stderr.log")
@{pid=$started.Id;port=$Port;index=$resolvedIndex;started_at=$stamp} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $artifactRoot "api_${Port}.json") -Encoding UTF8
Write-Output "Started KB/RAG port $Port PID $($started.Id)"
