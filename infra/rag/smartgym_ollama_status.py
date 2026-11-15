"""Report placement of the configured Ollama chat model."""

from threading import Lock
from time import monotonic

from fastapi import Header
import httpx

from .smartgym_cloud import require_service_token
from .config import Settings


def register(app):
    settings = Settings.from_env()
    origin = settings.ollama_url
    model = settings.chat_model
    name = model if ":" in model.rsplit("/", 1)[-1] else model + ":latest"
    lock = Lock()
    last_check = float("-inf")

    def placement(client):
        response = client.get(origin + "/api/ps", timeout=4)
        response.raise_for_status()
        for row in response.json()["models"]:
            if name not in (row.get("name"), row.get("model")):
                continue
            vram, size = row["size_vram"], row["size"]
            if type(vram) is not int or type(size) is not int or size <= 0 or not 0 <= vram <= size:
                raise ValueError("Invalid Ollama placement")
            return "cpu" if not vram else "gpu" if vram == size else "mixed"
        return "idle"

    @app.get("/internal/v1/ollama/runtime", include_in_schema=False)
    def runtime(authorization: str | None = Header(default=None)):
        require_service_token(authorization)
        try:
            with httpx.Client() as client:
                return {"state": placement(client)}
        except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError):
            return {"state": "unavailable"}

    @app.post("/internal/v1/ollama/runtime", include_in_schema=False)
    def check_runtime(authorization: str | None = Header(default=None)):
        nonlocal last_check
        require_service_token(authorization)
        if not lock.acquire(blocking=False):
            return {"state": "checking"}
        try:
            with httpx.Client() as client:
                state = placement(client)
                if state != "idle" or monotonic() - last_check < 45:
                    return {"state": state}
                last_check = monotonic()
                response = client.post(origin + "/api/generate", json={
                    "model": model, "prompt": "", "stream": False,
                    "options": {"num_ctx": 8192},
                }, timeout=60)
                response.raise_for_status()
                return {"state": placement(client)}
        except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError):
            return {"state": "unavailable"}
        finally:
            lock.release()
