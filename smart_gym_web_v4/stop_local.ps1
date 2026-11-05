# Stops only background processes recorded by the local setup, not manual terminals.
$taskPidFile = Join-Path $PSScriptRoot 'runtime\local_processes.json'
if (-not (Test-Path -LiteralPath $taskPidFile -PathType Leaf)) {
    Write-Output 'No recorded background servers. Use Ctrl+C in the SERVER and WEB windows.'
    exit
}
$taskProcesses = Get-Content -Raw -Encoding UTF8 -LiteralPath $taskPidFile | ConvertFrom-Json
foreach ($taskRole in @('server', 'web')) {
    $taskProcessId = $taskProcesses."${taskRole}_pid"
    $taskStarted = $taskProcesses."${taskRole}_started_utc"
    if (-not $taskProcessId -or -not $taskStarted) { continue }
    $taskProcess = Get-Process -Id $taskProcessId -ErrorAction SilentlyContinue
    if (-not $taskProcess) { continue }
    $taskDelta = [Math]::Abs(($taskProcess.StartTime.ToUniversalTime() - [DateTime]::Parse($taskStarted).ToUniversalTime()).TotalSeconds)
    $taskInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$taskProcessId" -ErrorAction SilentlyContinue
    $taskExpected = if ($taskRole -eq 'server') { '-m\s+server\.app' } else { 'web[\\/]serve\.py' }
    if ($taskDelta -lt 1 -and $taskInfo.CommandLine -match $taskExpected) {
        Stop-Process -Id $taskProcessId -ErrorAction Stop
        Write-Output "Stopped $taskRole (PID $taskProcessId)."
    } else {
        Write-Output "Skipped ${taskRole}: process identity does not match the recorded local server."
    }
}
