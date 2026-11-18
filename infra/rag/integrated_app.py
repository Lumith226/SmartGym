"""Deployment wrapper; keep the evaluated kb_service module bytes unchanged."""
import hmac
import httpx
from fastapi import Header, HTTPException
from kb_service.config import Settings
from kb_service.app import app

settings = Settings.from_env()

def runtime_state(authorization):
    if not settings.internal_token or not hmac.compare_digest(authorization or '', 'Bearer ' + settings.internal_token):
        raise HTTPException(401)
    try:
        with httpx.Client(timeout=4) as client:
            response = client.get(settings.ollama_url + '/api/ps')
            response.raise_for_status()
            for row in response.json()['models']:
                if settings.chat_model in (row.get('name'), row.get('model')):
                    vram, size = row['size_vram'], row['size']
                    if type(vram) is not int or type(size) is not int or size <= 0 or not 0 <= vram <= size:
                        raise ValueError('Invalid placement')
                    return {'state': 'cpu' if not vram else 'gpu' if vram == size else 'mixed'}
        return {'state': 'idle'}
    except (httpx.HTTPError, KeyError, ValueError, TypeError):
        return {'state': 'unavailable'}

@app.get('/internal/v1/ollama/runtime', include_in_schema=False)
def placement(authorization: str | None = Header(default=None)):
    return runtime_state(authorization)

@app.post('/internal/v1/ollama/runtime', include_in_schema=False)
def check_placement(authorization: str | None = Header(default=None)):
    # A UI status poll must not load a model or start generation.
    return runtime_state(authorization)
