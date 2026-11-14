$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envFile = Join-Path $root '.env'
$node = (Get-Command node.exe -ErrorAction Stop).Source
$user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$taskName = 'SmartGym Pose Engine'
$runtime = Join-Path $root '.local/ai/pose-env/Scripts/python.exe'

if (!(Test-Path -LiteralPath $envFile) -or !(Test-Path -LiteralPath $runtime)) {
    throw 'Prepare the local Compose configuration and Pose runtime first. See docs/guides/OPERATIONS.md.'
}

$portLine = Select-String -LiteralPath $envFile -Pattern '^SMARTGYM_POSE_DIRECTML_PORT=(\d+)$' | Select-Object -Last 1
$port = if ($portLine) { [int]$portLine.Matches[0].Groups[1].Value } else { 8002 }
if ($port -lt 1 -or $port -gt 65535) { throw 'Invalid DirectML port' }

$wscript = Join-Path $env:SystemRoot 'System32/wscript.exe'
$action = New-ScheduledTaskAction -Execute $wscript -WorkingDirectory $root -Argument ('//B //Nologo "scripts\run-pose-hidden.vbs" "' + $node + '"')
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$triggers = @(
    (New-ScheduledTaskTrigger -AtLogOn -User $user)
    (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1))
)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Force | Out-Null
$content = [IO.File]::ReadAllText($envFile)
$origin = "SMARTGYM_POSE_ENGINE_ORIGIN=https://host.docker.internal:$port"
if ($content -match '(?m)^SMARTGYM_POSE_ENGINE_ORIGIN=') {
    $content = [regex]::Replace($content, '(?m)^SMARTGYM_POSE_ENGINE_ORIGIN=[^\r\n]*', $origin)
} else {
    $content = $content.TrimEnd("`r", "`n") + "`r`n$origin`r`n"
}
[IO.File]::WriteAllText($envFile, $content)

if (!(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)) {
    Start-ScheduledTask -TaskName $taskName
}
Write-Output "Registered $taskName for $user. Pose endpoint: host.docker.internal:$port"
