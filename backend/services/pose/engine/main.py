"""Web-owned mTLS entrypoint; provider engine and model files are read-only."""
import argparse
import hashlib
import json
from pathlib import Path
import ssl
import sys

sys.dont_write_bytecode = True
parser = argparse.ArgumentParser()
parser.add_argument("--source", required=True)
parser.add_argument("--port", type=int, required=True)
parser.add_argument("--host", default="127.0.0.1")
parser.add_argument("--device", choices=("cpu", "dml"), default="cpu")
parser.add_argument("--key", required=True)
parser.add_argument("--cert", required=True)
parser.add_argument("--ca", required=True)
args = parser.parse_args()
source = Path(args.source).resolve()
manifest = Path(__file__).resolve().parents[1] / "data/models.json"
data = manifest.read_bytes()
models = json.loads(data)
weights = source / "smart_gym_test_rtmpose_v4/weights"
for model in models:
    file = weights / model["modelFile"]
    assert file.parent == weights and hashlib.sha256(file.read_bytes()).hexdigest() == model["sha256"]
for name in ["yolox_m_8xb8-300e_humanart-c2c7a14a.onnx", "rtmpose-m_simcc-body7_pt-body7_420e-256x192-e48f03d0_20230504.onnx"]:
    assert (weights / name).is_file(), "Local weights required; auto-download is disabled"
sys.path.insert(0, str(source / "smart_gym_web_v4"))
from server.app import create_app
import uvicorn

if args.device == "dml":
    from directml import create_directml_engine

    app = create_app(engine=create_directml_engine(weights))
else:
    app = create_app(device="cpu")

@app.get("/internal/v1/engine/manifest")
def runtime_manifest():
    return {"ready": getattr(app.state, "engine", None) is not None,
            "manifestSha256": hashlib.sha256(data).hexdigest()}

config = uvicorn.Config(app, host=args.host, port=args.port, access_log=False, ws="wsproto",
                        ssl_keyfile=args.key, ssl_certfile=args.cert, ssl_ca_certs=args.ca,
                        ssl_cert_reqs=ssl.CERT_REQUIRED, ssl_version=ssl.PROTOCOL_TLS_SERVER)
config.load()
config.ssl.minimum_version = ssl.TLSVersion.TLSv1_2
uvicorn.Server(config).run()
