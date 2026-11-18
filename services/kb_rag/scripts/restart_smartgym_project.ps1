param([string]$ChatModel = '')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$env:PYTHONIOENCODING = 'utf-8'
$serviceRoot = Split-Path -Parent $PSScriptRoot
$projectRoot = Split-Path -Parent (Split-Path -Parent $serviceRoot)
$workspaceRoot = Split-Path -Parent $projectRoot
$pythonPath = Join-Path $projectRoot '.tools\python\python.exe'
$modelPython = Join-Path $workspaceRoot 'SmartGym-Model\.runtime\python\python.exe'
Set-Location -LiteralPath $serviceRoot
$configuredIndex = & $pythonPath -X utf8 -c 'from kb_service.config import Settings; print(Settings.from_env().index_dir)'
if ($LASTEXITCODE -ne 0 -or -not $configuredIndex) { throw 'Cannot read the configured KB release pointer.' }
$configuredGraphBackend = & $pythonPath -X utf8 -c "import os; from kb_service.config import Settings; print(os.getenv('KB_GRAPH_BACKEND', 'local'))"
if ($LASTEXITCODE -ne 0 -or $configuredGraphBackend -notin @('local','neo4j')) { throw 'Invalid configured graph backend.' }
& (Join-Path $PSScriptRoot 'start_local_ollama.ps1')
$dockerReady = $false
try { $null = & docker info --format '{{.ServerVersion}}' 2>$null; $dockerReady = $LASTEXITCODE -eq 0 } catch { }
if (-not $dockerReady) {
    $desktop = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
    if (Test-Path -LiteralPath $desktop) {
        $existingDesktop = Get-Process -Name 'Docker Desktop' -ErrorAction SilentlyContinue
        if (-not $existingDesktop) { $null = Start-Process -FilePath $desktop -WindowStyle Hidden -PassThru }
        for ($attempt=0; $attempt -lt 25; $attempt++) {
            Start-Sleep -Seconds 2
            try { $null = & docker info --format '{{.ServerVersion}}' 2>$null; $dockerReady = $LASTEXITCODE -eq 0 } catch { }
            if ($dockerReady) { break }
        }
    }
}
if ($dockerReady) {
    & docker start smart-gym-ai-neo4j-1
    if ($LASTEXITCODE -ne 0) { throw 'Existing Neo4j container did not start; inspect it before creating or replacing database storage.' }
} else { Write-Warning 'Docker is not ready yet; KB retrieval will report its local fallback until Neo4j is reachable.' }
& (Join-Path $PSScriptRoot 'start_six_service.ps1') -Port 8010 -ChatModel $ChatModel -IndexDirectory $configuredIndex -GraphBackend $configuredGraphBackend
$owned = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'python.exe' -and $_.CommandLine -like "*$modelPython*" -and
    (($_.CommandLine -like '*-m server.app*' -and $_.CommandLine -match '--port 8001(?:\s|$)') -or
     ($_.CommandLine -like '*web/serve.py*' -and $_.CommandLine -match '--port 8080(?:\s|$)'))
}
foreach ($entry in $owned) { Stop-Process -Id $entry.ProcessId -ErrorAction Stop }
Set-Location -LiteralPath $serviceRoot
& $pythonPath -X utf8 (Join-Path $PSScriptRoot 'launch_project_web.py')
if ($LASTEXITCODE -ne 0) { throw 'Web/bridge bootstrap failed; inspect artifacts/local_runtime.' }
Write-Output 'Project started. Verify web :8080, bridge :8001, KB/RAG :8010 and Neo4j :7474.'
