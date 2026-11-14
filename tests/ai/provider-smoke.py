"""Read-only provider smoke. Raw observations stay in ignored Web-local storage.

Benchmark videos are used for internal compatibility checks, never published.
This is not a model quality/accuracy benchmark or production auth acceptance.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import secrets
import sys
import time

PROJECT = Path(__file__).resolve().parents[2]


def save(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, allow_nan=False, indent=2), encoding="utf-8")


def pose(args, output):
    assert not any(output.glob("*.json")), "Use a fresh output directory for each Pose run"
    root = Path(args.pose_root).resolve()
    weights = root / "smart_gym_test_rtmpose_v4" / "weights"
    # RTMPoseTracker otherwise may fetch/cache weights automatically. Fail before import.
    for name in ["yolox_m_8xb8-300e_humanart-c2c7a14a.onnx", "rtmpose-m_simcc-body7_pt-body7_420e-256x192-e48f03d0_20230504.onnx"]:
        assert (weights / name).is_file(), "Local detector/pose weights are required"
    sys.path.insert(0, str(root / "smart_gym_web_v4"))
    import cv2
    import torch
    from fastapi.testclient import TestClient
    from server.engine import InferenceEngine, json_safe
    from server.app import create_app
    from server.protocol import decode_packet
    torch.set_num_threads(2)
    started = time.perf_counter()
    engine = InferenceEngine("cpu")
    report = {"python": sys.version.split()[0], "device": "cpu", "accuracy_benchmark": False,
              "transport": "FastAPI TestClient in-process, not deployed TCP/mTLS", "exercises": []}
    mappings = {"squat": "squats", "push_up": "pushups", "jump_jack": "jumping_jacks", "situp": "reverse_crunches"}
    manifest = json.loads((PROJECT / "docs/api/ai-provider-compatibility.yaml").read_text(encoding="utf-8"))
    with TestClient(create_app(engine=engine)) as client:
        assert client.get("/api/health").json()["ready"] is True
        assert {r["id"] for r in client.get("/api/exercises").json()["exercises"]} == set(mappings)
        for exercise, folder in mappings.items():
            if args.exercises and exercise not in args.exercises:
                continue
            videos = sorted((root / "smart_gym_test_rtmpose_v4/test_videos_benchmark" / folder).glob("*.mp4"))
            if args.prefer_reference:
                # Pick a functional baseline; filenames are NOT accuracy ground truth.
                videos.sort(key=lambda p: (not p.name.startswith("CORRECT_"), p.name))
            assert videos, "Missing benchmark video"
            path = videos[0]
            source_hash = hashlib.sha256(path.read_bytes()).hexdigest()
            model = next(row for row in manifest["models"] if row["pose_id"] == exercise)
            observed = set()

            def store(raw):
                if not raw or raw["scope"] in observed:
                    return
                raw = json_safe(raw)
                raw.pop("comparison", None)
                raw["model_provenance"] = {"model_sha256": model["model_sha256"]}
                raw["source"] = {"video_sha256": source_hash}
                assert raw["schema_version"] == model["schema_version"]
                assert len(raw["label_results"]) == model["label_count"]
                save(output / (exercise + "-" + raw["scope"] + ".json"), raw)
                observed.add(raw["scope"])

            with path.open("rb") as video:
                response = client.post("/api/analyze-video", data={"exercise": exercise}, files={"file": ("smoke.mp4", video, "video/mp4")})
            assert response.status_code == 200, response.text[:300]
            whole = response.json()["result"]
            assert whole["scope"] == "video" and "rep_count" not in whole
            store(whole)
            cap = cv2.VideoCapture(str(path))
            fps = cap.get(cv2.CAP_PROP_FPS)
            assert math.isfinite(fps) and fps > 0
            stride = max(1, math.ceil(fps / 10))
            count, frame_id, reps = 0, 0, 0
            try:
                with client.websocket_connect("/ws/live", headers={"origin": "http://127.0.0.1:8080"}) as socket:
                    assert socket.receive_json()["type"] == "connected"
                    socket.send_json({"type": "configure", "exercise": exercise, "source": "video", "generation": 1})
                    assert socket.receive_json()["type"] == "ready"
                    while count < fps * 30 and frame_id < 300:
                        ok, frame = cap.read()
                        if not ok:
                            break
                        if count % stride == 0:
                            h, w = frame.shape[:2]
                            scale = min(640 / w, 480 / h, 1)
                            frame = cv2.resize(frame, (int(w * scale), int(h * scale)))
                            ok, encoded = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                            assert ok
                            metadata = json.dumps({"frame_id": frame_id, "timestamp": count / fps, "generation": 1}).encode()
                            packet = len(metadata).to_bytes(4, "little") + metadata + encoded.tobytes()
                            assert len(packet) <= 256 * 1024
                            decode_packet(packet)
                            socket.send_bytes(packet)
                            result = socket.receive_json()
                            assert result["type"] == "result", result.get("message")
                            reps = result["rep_count"]
                            store(result.get("result"))
                            store(result.get("rep_result"))
                            frame_id += 1
                        count += 1
            finally:
                cap.release()
            row = {"exercise": exercise, "source_sha256": source_hash, "frames": frame_id, "rep_count": reps,
                   "observed_scopes": sorted(observed), "video_quality_usable": whole["quality"]["usable"]}
            report["exercises"].append(row)
            print(json.dumps(row), flush=True)
    report["elapsed_seconds"] = round(time.perf_counter() - started, 2)
    save(output / "pose-smoke.json", report)


def rag(args, output):
    from dataclasses import replace
    root = Path(args.rag_root).resolve()
    sys.path.insert(0, str(root))
    from fastapi.testclient import TestClient
    from kb_service.config import Settings
    from kb_service.app import create_app
    from kb_service.models import ModelChatRequest
    from kb_service.v4 import adapt_model_request
    catalog = json.loads((root / "label_catalog_v4.json").read_text(encoding="utf-8"))
    snapshots = {"label_catalog": catalog}
    accepted = []
    for file in sorted(output.glob("*-*.json")):
        if file.name in ("pose-smoke.json", "rag-smoke.json"):
            continue
        raw = json.loads(file.read_text(encoding="utf-8"))
        if "label_results" not in raw:
            continue
        request = ModelChatRequest(model_result=raw, simulated=False, generate=False)
        observation = adapt_model_request(request, snapshots).observation
        accepted.append({"fixture": file.name, "exercise": observation.exercise_code, "scope": raw["scope"], "status": observation.observation_status})
        invalid = json.loads(json.dumps(raw))
        invalid["model_provenance"]["model_sha256"] = "0" * 64
        try:
            adapt_model_request(ModelChatRequest(model_result=invalid), snapshots)
        except ValueError:
            pass
        else:
            raise AssertionError("RAG accepted mismatched provenance")
    assert accepted, "Pose inference fixtures are required first"
    # Use an explicitly empty Web-local index; never change or fabricate the delivered corpus.
    index = output / "empty-index"
    index.mkdir(exist_ok=True)
    assert not (index / "snapshot.json").exists()
    token = secrets.token_urlsafe(32)
    settings = replace(Settings.from_env(), index_dir=index, llm_provider="disabled", internal_token=token)
    with TestClient(create_app(settings)) as client:
        health = client.get("/health")
        assert health.status_code == 200 and health.json()["kb_ready"] is False
        assert client.post("/v1/chatbot", json={"message": "Hướng dẫn tập squat"}).status_code == 401
        assert client.post("/v1/chatbot", headers={"authorization": "Bearer " + token}, json={"message": "Hướng dẫn tập squat"}).status_code == 503
    report = {"python": sys.version.split()[0], "raw_fixtures_accepted": accepted,
              "wrong_model_rejected": True, "empty_kb_health": "NOT_READY", "missing_token": 401,
              "authorized_empty_kb": 503, "corpus_generation": "NOT_RUN", "production_mtls": "NOT_RUN"}
    save(output / "rag-smoke.json", report)
    print(json.dumps(report, ensure_ascii=False), flush=True)


def regressions(args, output):
    import unittest
    root = Path(args.rag_root).resolve()
    sys.path.insert(0, str(root))
    suite = unittest.defaultTestLoader.discover(str(root / "tests"), pattern="test_v4_integration.py")
    result = unittest.TextTestRunner(verbosity=1).run(suite)
    save(output / "provider-regressions.json", {"tests": result.testsRun, "success": result.wasSuccessful(),
         "data": "Synthetic provider fixtures; not corpus/accuracy acceptance"})
    assert result.wasSuccessful(), "Provider regressions failed"


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("service", choices=["pose", "rag", "rag-regressions"])
    parser.add_argument("--pose-root")
    parser.add_argument("--rag-root")
    parser.add_argument("--output", required=True)
    parser.add_argument("--exercises", nargs="+", choices=["squat", "push_up", "jump_jack", "situp"])
    parser.add_argument("--prefer-reference", action="store_true")
    args = parser.parse_args()
    output = Path(args.output).resolve()
    assert output.is_relative_to(PROJECT / ".local/ai"), "Output must stay in Web-local AI workspace"
    output.mkdir(parents=True, exist_ok=True)
    {"pose": pose, "rag": rag, "rag-regressions": regressions}[args.service](args, output)
