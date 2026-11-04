$ErrorActionPreference = 'Stop'
$benchmarkPython = Join-Path $PSScriptRoot '.venv-benchmark\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $benchmarkPython)) {
    throw 'Benchmark Python environment is missing. See README.md.'
}
Push-Location -LiteralPath $PSScriptRoot
try {
    $env:POSE_BENCHMARK_RESULTS = Join-Path $PSScriptRoot 'pose_benchmark\results_full'
    & $benchmarkPython -B 'pose_benchmark/initialize_full_run.py'
    if ($LASTEXITCODE -ne 0) { throw 'Could not initialize full run or validate pilot lineage.' }
    & $benchmarkPython -B -u 'pose_benchmark/run_benchmark.py' --subjects s05 s07 s08 s09 s10 s11 --stride 2 --preserve-manifest --models YOLOv8n-Pose
    if ($LASTEXITCODE -ne 0) { throw 'Benchmark failed. Saved results remain available for resuming.' }
    & $benchmarkPython -B -u 'pose_benchmark/run_accuracy_groups.py'
    if ($LASTEXITCODE -ne 0) { throw 'Grouped accuracy measurement failed.' }
    & $benchmarkPython -B -u 'pose_benchmark/run_speed.py'
    if ($LASTEXITCODE -ne 0) { throw 'Live pipeline speed measurement failed.' }
    & $benchmarkPython -B 'pose_benchmark/record_provenance.py'
    if ($LASTEXITCODE -ne 0) { throw 'Could not record model provenance.' }
    & $benchmarkPython -B -u 'pose_benchmark/generate_report.py'
    if ($LASTEXITCODE -ne 0) { throw 'Report generation failed or benchmark is incomplete.' }
    & $benchmarkPython -B -u 'pose_benchmark/run_occlusion.py'
    if ($LASTEXITCODE -ne 0) { throw 'Synthetic occlusion probe failed.' }
    & $benchmarkPython -B 'pose_benchmark/audit_dataset_scope.py'
    if ($LASTEXITCODE -ne 0) { throw 'Dataset scope audit failed.' }
    & $benchmarkPython -B 'pose_benchmark/write_scope.py'
    if ($LASTEXITCODE -ne 0) { throw 'Could not document dataset scope.' }
    & $benchmarkPython -B 'pose_benchmark/supplement_report.py'
    if ($LASTEXITCODE -ne 0) { throw 'Supplemental report failed.' }
    & $benchmarkPython -B 'pose_benchmark/finalize_full.py'
    if ($LASTEXITCODE -ne 0) { throw 'Output verification failed.' }
} finally {
    Pop-Location
}
