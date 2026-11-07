param([switch]$SkipEmbeddings,[switch]$SkipFetch)
$ErrorActionPreference='Stop'
$serviceRoot=Split-Path -Parent $PSScriptRoot
$projectRoot=Split-Path -Parent (Split-Path -Parent $serviceRoot)
$pythonBinary=Join-Path $projectRoot '.tools\python\python.exe'
if(-not (Test-Path -LiteralPath $pythonBinary)){throw 'Run scripts/bootstrap.ps1 first.'}
if(-not $SkipFetch){
    & $pythonBinary -X utf8 -m kb_service.cli fetch
    if($LASTEXITCODE -ne 0){Write-Warning 'Some sources could not be downloaded. See artifacts/download_report_*.json; add the required PDF manually.'}
}
& $pythonBinary -X utf8 -m kb_service.cli ingest
if($LASTEXITCODE -ne 0){throw 'KB ingestion failed; previous index is preserved.'}
if(-not $SkipEmbeddings){
    $diagnostics=& $pythonBinary -X utf8 -m kb_service.cli doctor
    $state=$diagnostics | ConvertFrom-Json
    if($state.ollama_reachable -and $state.embed_model_installed){
        & $pythonBinary -X utf8 -m kb_service.cli embed
        if($LASTEXITCODE -ne 0){throw 'Embedding failed. Check Ollama server and models.'}
    }else{Write-Warning 'Ollama embedding model is not ready. Lexical + graph retrieval is available; dense retrieval is not active.'}
}
& $pythonBinary -X utf8 -m kb_service.cli evaluate
if($LASTEXITCODE -ne 0){throw 'Retrieval evaluation failed.'}
& $pythonBinary -X utf8 -m kb_service.cli export-evidence
if($LASTEXITCODE -ne 0){throw 'Evidence export failed.'}
