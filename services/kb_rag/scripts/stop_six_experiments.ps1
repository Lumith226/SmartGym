$ErrorActionPreference = 'Stop'
$serviceRoot = Split-Path -Parent $PSScriptRoot
$projectRoot = Split-Path -Parent (Split-Path -Parent $serviceRoot)
$pythonPath = Join-Path $projectRoot '.tools\python\python.exe'
$artifacts = Join-Path $serviceRoot 'artifacts\six_exercises_20261117'
$records = @()
foreach ($candidatePort in 8011..8015) {
    $pidFile = Join-Path $artifacts "api_$candidatePort.json"
    if (-not (Test-Path -LiteralPath $pidFile)) { continue }
    $registered = Get-Content -LiteralPath $pidFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $entry = Get-CimInstance Win32_Process -Filter "ProcessId = $($registered.pid)"
    $owned = $entry -and $entry.Name -eq 'python.exe' -and
        $entry.CommandLine -like "*$pythonPath*" -and
        $entry.CommandLine -like '*uvicorn kb_service.app:app*' -and
        $entry.CommandLine -match "--port $candidatePort(?:\s|$)"
    if ($owned) { Stop-Process -Id $entry.ProcessId; $status = 'stopped_owned_experiment' }
    else { $status = 'absent_or_different_process_not_stopped' }
    $records += @{port=$candidatePort;registered_pid=$registered.pid;status=$status}
}
$records | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $serviceRoot 'artifacts\local_runtime\experiment_cleanup.json') -Encoding UTF8
$records | Format-Table -AutoSize
