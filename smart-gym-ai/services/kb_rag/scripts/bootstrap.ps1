$ErrorActionPreference = 'Stop'
$serviceRoot = Split-Path -Parent $PSScriptRoot
$projectRoot = Split-Path -Parent (Split-Path -Parent $serviceRoot)
$runtimeFolder = Join-Path $projectRoot '.tools\python'
New-Item -ItemType Directory -Force -Path $runtimeFolder | Out-Null
$pythonBinary = Join-Path $runtimeFolder 'python.exe'
if (-not (Test-Path -LiteralPath $pythonBinary)) {
    $archive = Join-Path $runtimeFolder 'python-embed.zip'
    Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip' -OutFile $archive -UseBasicParsing
    Expand-Archive -LiteralPath $archive -DestinationPath $runtimeFolder -Force
}
@('python312.zip', '.', 'Lib\site-packages', '..\..\services\kb_rag', 'import site') | Set-Content -Encoding Ascii -LiteralPath (Join-Path $runtimeFolder 'python312._pth')
& $pythonBinary -c "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('pip') else 1)"
if ($LASTEXITCODE -ne 0) {
    $pipBootstrap = Join-Path $runtimeFolder 'get-pip.py'
    Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile $pipBootstrap -UseBasicParsing
    & $pythonBinary -X utf8 $pipBootstrap --disable-pip-version-check --no-warn-script-location --progress-bar off
    if ($LASTEXITCODE -ne 0) { throw 'pip bootstrap failed' }
}
$requirementsFile = Join-Path $serviceRoot 'requirements.lock.txt'
if(-not (Test-Path -LiteralPath $requirementsFile)) { $requirementsFile = Join-Path $serviceRoot 'requirements.txt' }
& $pythonBinary -X utf8 -m pip install --disable-pip-version-check --no-warn-script-location --progress-bar off -r $requirementsFile
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
Write-Output ('Python for this project: ' + $pythonBinary)
