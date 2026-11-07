"""HTTP boundary to the independently deployable KB/RAG service."""
import httpx
from fastapi import HTTPException
from core.config import settings

async def request_kb(path: str, payload: dict | None = None):
    headers = {'Authorization': 'Bearer ' + settings.KB_RAG_INTERNAL_TOKEN} if settings.KB_RAG_INTERNAL_TOKEN else {}
    try:
        async with httpx.AsyncClient(timeout=settings.KB_RAG_TIMEOUT) as client:
            url = settings.KB_RAG_SERVICE_URL.rstrip('/') + path
            result = await client.get(url, headers=headers) if payload is None else await client.post(url, json=payload, headers=headers)
            result.raise_for_status()
            return result.json()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 422:
            raise HTTPException(422, 'KB/RAG rejected the observation or query format') from exc
        raise HTTPException(503, 'KB/RAG service is not ready; check its /health endpoint') from exc
    except (httpx.RequestError, ValueError) as exc:
        raise HTTPException(503, 'Cannot reach KB/RAG service') from exc

def coach_response(result: dict, fault_code: str | None = None):
    from models.schemas import CoachResponse
    return CoachResponse(reply=result['reply'], fault_code=fault_code, causes=[], corrections=[], risk_warning=None,
        sources=result['evidence'], kb_version=result['kb_version'], model_version=result['model_version'],
        status=result['status'], generation_used=result['generation_used'], citations=result['citations'],
        warnings=result['warnings'], graph_claims=result['graph_claims'], retrieval=result['retrieval'],
        generation_mode=result.get('generation_mode','none'),observation=result.get('observation'),
        label_explanations=result.get('label_explanations',[]),knowledge_coverage=result.get('knowledge_coverage',{}))
