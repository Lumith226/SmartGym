$ErrorActionPreference='Stop'
$serviceRoot=Split-Path -Parent $PSScriptRoot
$projectRoot=Split-Path -Parent (Split-Path -Parent $serviceRoot)
$pythonBinary=Join-Path $projectRoot '.tools\python\python.exe'
if(-not (Test-Path -LiteralPath $pythonBinary)){throw 'Run scripts/bootstrap.ps1 first, or use your own Python virtual environment.'}
Set-Location -LiteralPath $serviceRoot
& $pythonBinary -X utf8 -m uvicorn kb_service.app:app --host 127.0.0.1 --port 8010
