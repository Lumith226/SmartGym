# Continue the already-running GPU accuracy pass, then build and audit outputs.
$ErrorActionPreference = 'Stop'
$benchmarkPython = Join-Path $PSScriptRoot '.venv-benchmark\Scripts\python.exe'
$fullResults = Join-Path $PSScriptRoot 'pose_benchmark\results_full'
$env:POSE_BENCHMARK_RESULTS = $fullResults
Push-Location -LiteralPath $PSScriptRoot
function Invoke-BenchmarkStep([string]$Script, [string]$LogName) {
    Write-Output ("STAGE {0} {1:o}" -f $Script, (Get-Date))
    & $benchmarkPython -B -u $Script *> (Join-Path $fullResults $LogName)
    if ($LASTEXITCODE -ne 0) { throw "Failed: $Script; inspect $LogName" }
}
try {
    $accuracyLog = Join-Path $fullResults 'accuracy_run.log'
    while (-not (Select-String -LiteralPath $accuracyLog -Pattern '^BENCHMARK FINISHED$' -Quiet)) {
        Start-Sleep -Seconds 10
    }
    Invoke-BenchmarkStep 'pose_benchmark/check_full_matrix.py' 'matrix_check.log'
    Invoke-BenchmarkStep 'pose_benchmark/run_speed.py' 'speed_run.log'
    Invoke-BenchmarkStep 'pose_benchmark/record_provenance.py' 'provenance.log'
    Invoke-BenchmarkStep 'pose_benchmark/generate_report.py' 'report_generation.log'
    Invoke-BenchmarkStep 'pose_benchmark/run_occlusion.py' 'occlusion_run.log'
    Invoke-BenchmarkStep 'pose_benchmark/write_scope.py' 'scope.log'
    Invoke-BenchmarkStep 'pose_benchmark/supplement_report.py' 'supplement.log'
    Invoke-BenchmarkStep 'pose_benchmark/finalize_full.py' 'final_verification.log'
    Write-Output 'FULL PIPELINE FINISHED'
} catch {
    Write-Output ("FULL PIPELINE FAILED: {0}" -f $_)
    throw
} finally {
    Pop-Location
}
