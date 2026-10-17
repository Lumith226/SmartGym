"""Explicitly install checksum-pinned OpenMMLab RTMPose inference assets.

The app never downloads weights automatically. An existing local release ZIP
can be installed offline with --archive; no archive paths are extracted.
"""

import argparse
import hashlib
import io
import json
from pathlib import Path
import ssl
import urllib.request
import zipfile


ROOT = Path(__file__).resolve().parent


def install(size, directory, archive=None):
    release = json.loads((ROOT / "rtmpose_models.json").read_text())[size]
    if archive is not None:
        content = archive.read_bytes()
    else:
        context = ssl.create_default_context()
        try:
            import certifi
            context = ssl.create_default_context(cafile=certifi.where())
        except ImportError:
            pass
        with urllib.request.urlopen(release["url"], timeout=90, context=context) as response:
            content = response.read(release["archive_bytes"] + 1)
    if (len(content) != release["archive_bytes"]
            or hashlib.sha256(content).hexdigest() != release["archive_sha256"]):
        raise ValueError("RTMPose release size/checksum does not match the pinned manifest")
    files = {}
    with zipfile.ZipFile(io.BytesIO(content)) as bundle:
        for target in ["end2end.onnx", "pipeline.json"]:
            matches = [name for name in bundle.namelist() if Path(name).name == target]
            if len(matches) != 1:
                raise ValueError(f"Expected exactly one {target} in the release")
            data = bundle.read(matches[0])
            key = "model_sha256" if target.endswith(".onnx") else "pipeline_sha256"
            if hashlib.sha256(data).hexdigest() != release[key]:
                raise ValueError(f"Checksum mismatch for {target}")
            files[target] = data
    destination = directory / size
    destination.mkdir(parents=True, exist_ok=True)
    for target, data in files.items():
        temporary = destination / (target + ".partial")
        temporary.write_bytes(data)
        temporary.replace(destination / target)
    return destination / "end2end.onnx"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--size", choices=["m", "s"], default="m")
    parser.add_argument("--directory", type=Path, default=ROOT / "weights/rtmpose")
    parser.add_argument("--archive", type=Path, help="Install an already downloaded official ZIP offline")
    args = parser.parse_args()
    model = install(args.size, args.directory, args.archive)
    print(f"Verified and installed RTMPose-{args.size}: {model}")


if __name__ == "__main__":
    main()
