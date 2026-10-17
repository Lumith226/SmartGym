"""Explicit, checksum-pinned installation for YOLO-Detect + RTMPose.

Run from smart_gym_camera_app: python -m tools.fetch_pose_models
The application and benchmarks never download missing weights implicitly.
"""

import argparse
import hashlib
import json
from pathlib import Path
import ssl
import urllib.request

import fetch_rtmpose
from pose_backends.factory import ROOT


MANIFEST = ROOT / "pose_backends/detector_models.json"


def matches(path, digest):
    return path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() == digest


def install_detector(directory, local_file=None):
    release = json.loads(MANIFEST.read_text())["yolov8n"]
    target = directory / "yolov8n.pt"
    if local_file is None and matches(target, release["sha256"]):
        return target
    if local_file is not None:
        data = local_file.read_bytes()
    else:
        context = ssl.create_default_context()
        try:
            import certifi
            context = ssl.create_default_context(cafile=certifi.where())
        except ImportError:
            pass
        with urllib.request.urlopen(release["url"], timeout=60, context=context) as response:
            data = response.read(release["bytes"] + 1)
    if len(data) != release["bytes"] or hashlib.sha256(data).hexdigest() != release["sha256"]:
        raise ValueError("YOLO detection model size/checksum does not match the manifest")
    directory.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(".pt.partial")
    temporary.write_bytes(data)
    temporary.replace(target)
    return target


def install_rtmpose(size, directory, archive=None):
    release = json.loads((ROOT / "rtmpose_models.json").read_text())[size]
    target = directory / size / "end2end.onnx"
    if archive is None and (matches(target, release["model_sha256"])
            and matches(target.with_name("pipeline.json"), release["pipeline_sha256"])):
        return target
    return fetch_rtmpose.install(size, directory, archive)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rtmpose-size", choices=["m", "s"], default="m")
    parser.add_argument("--weights-directory", type=Path, default=ROOT / "weights")
    parser.add_argument("--detector-file", type=Path, help="Official local yolov8n.pt for offline installation")
    parser.add_argument("--rtmpose-archive", type=Path, help="Official local release ZIP for offline installation")
    args = parser.parse_args()
    detector = install_detector(args.weights_directory / "detectors", args.detector_file)
    pose = install_rtmpose(args.rtmpose_size, args.weights_directory / "rtmpose", args.rtmpose_archive)
    print(f"Verified YOLO-Detect: {detector}")
    print(f"Verified RTMPose-{args.rtmpose_size}: {pose}")


if __name__ == "__main__":
    main()
