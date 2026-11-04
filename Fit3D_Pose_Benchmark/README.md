> **Repository snapshot:** This branch includes benchmark source, reference code, selected summaries and provenance. The Fit3D dataset, Python environment, model weights, raw predictions, videos, figures, interactive viewer and pilot results are not included. Links to omitted artifacts below refer to the original workspace. Full runs require restoring those inputs and dependencies; scripts contain machine-specific paths such as `E:\do an\fit3d` that must be updated. `run_all.ps1` also expects the original pilot outputs for reuse. See `pose_benchmark/results_full/MODEL_PROVENANCE.json` and `pose_benchmark/prepare_models.py` for model sources.
# Fit3D pose benchmark — separate workspace

All benchmark code, environments, downloaded checkpoints and generated outputs live in this folder. The SmartGym source project and Fit3D dataset are read-only inputs.

- Source application: `E:\do an\SmartGym\smart_gym_camera_app`
- Dataset: `E:\do an\fit3d`
- Benchmark code: `pose_benchmark/`
- Environment: `.venv-benchmark/`
- Downloaded checkpoints: `pose_benchmark/weights/`
- Full outputs and GPU profiles: `pose_benchmark/results_full/`
- Preserved pilot: `pose_benchmark/results/`
- Reference code and provenance: `pose_benchmark/sources/`

## Authorized scope

Compare all ten previously selected pose model families using pretrained checkpoints, without fine-tuning, on the same input videos. Pose models and the shared person detector use AMD Radeon RX 5600 XT via ONNX Runtime DirectML. The fixed SmartGym ST-GCN++ classifier keeps its original CPU configuration on this AMD machine: attempting to initialize that existing graph with DirectML terminated the diagnostic process. CPU export and host pre/postprocessing are separate from GPU pose inference.

Exercises: SmartGym exercises present by name in Fit3D. Currently matched: squat and push-up, 64 calibrated training-split videos (8 subjects x 4 cameras x 2 exercises). Evaluation on the training split does not train or fine-tune any model; the official test-split 3D ground truth is not available locally. No claim of a held-out SmartGym test is made.

## Requested criteria

1. Joint location: compare shoulders, elbows, wrists, hips, knees and ankles to calibrated 2D projections of the corresponding Fit3D joints.
2. Stability: missing predictions, left/right confusion and changes in prediction error over time (separate from true motion).
3. Observability: required joints covered throughout the sequence. Ground-truth geometric in-frame status is not an occlusion label.
4. Speed: measured neural latency and whole pose-pipeline latency, including the shared person detector for top-down models. Report timing scope explicitly.
5. Application impact: keep the original rep tracker and ST-GCN++ classifier fixed across pose models. Fit3D does not provide matching four-class SmartGym form labels; do not present classifier confidence or agreement as form-classification accuracy.
6. Camera comparison: report every actual camera separately for each exercise. Do not label camera IDs as front/side without checking the sequence. Low-angle filming is not supplied merely by cropping; synthetic occlusion must be reported separately if used.

## Progress

Completed on all 64 calibrated exact-match videos: 640 model/clip records, 64 comparison videos, subject-level uncertainty and a separate synthetic occlusion probe. Start with [KET_QUA.md](KET_QUA.md) or [the interactive viewer](pose_benchmark/results_full/index.html). The earlier 16-clip pilot is preserved in `pose_benchmark/results/`.

## Commands

Run commands from this folder using `.venv-benchmark\Scripts\python.exe` explicitly. Example:

```powershell
& '.\.venv-benchmark\Scripts\python.exe' '.\pose_benchmark\dataset.py'
```

Environment was moved out of SmartGym at the user's request. Use `python.exe -m pip` rather than a generated `pip.exe` entry point with an old embedded path.

To resume all ten models and generate the final figures, CSV and comparison videos:

```powershell
& 'E:\do an\Fit3D_Pose_Benchmark\run_all.ps1'
```

The default full run covers all **8 subjects and 64 matching calibrated clips**, at 25 fps in annotated windows plus one second of context at both ends. It reuses 160 audited pilot model/clip records without changing their original execution signatures, and adds the remaining 480. Raw predictions, lineage and fingerprints make this reuse reviewable. Results remain resume-safe.

The two supplied criteria screenshots are preserved in `references/`. Model sources, SHA-256 hashes, versions and conversion notes are recorded in `pose_benchmark/results_full/MODEL_PROVENANCE.json`. Some models use publicly distributed ONNX/OpenVINO exports; these are identified rather than presented as the original authors' export files.
