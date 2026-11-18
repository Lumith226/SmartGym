$ErrorActionPreference='Stop'
$requestPath=Join-Path (Split-Path -Parent $PSScriptRoot) 'examples\chat_request.json'
$response=Invoke-RestMethod -Uri 'http://127.0.0.1:8010/v1/chat' -Method Post -ContentType 'application/json; charset=utf-8' -Body ([System.IO.File]::ReadAllBytes($requestPath))
$response | ConvertTo-Json -Depth 20
