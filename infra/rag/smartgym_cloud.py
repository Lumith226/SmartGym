"""Cloud generation for the SmartGym knowledge-only endpoint."""

from copy import copy
from dataclasses import replace
import json
import os
from pathlib import Path
import re
import secrets

import httpx
from fastapi import Header, HTTPException


def settings(provider):
    if provider not in ("qwen", "gemini"):
        raise ValueError("Unknown cloud provider")
    prefix = "SMARTGYM_" + provider.upper()
    if os.getenv(prefix + "_ENABLED") != "true":
        raise ValueError("Cloud provider is disabled")
    if provider == "qwen":
        base = os.getenv("SMARTGYM_QWEN_BASE_URL", "").rstrip("/")
        if not re.fullmatch(
            r"https://(?:dashscope-intl\.aliyuncs\.com|[a-z0-9-]+\.ap-southeast-1\.maas\.aliyuncs\.com)/compatible-mode/v1",
            base,
        ):
            raise ValueError("Qwen endpoint must be an Alibaba Cloud Singapore endpoint")
        default_model = "qwen3.8-flash"
    else:
        base = "https://generativelanguage.googleapis.com/v1beta/openai"
        default_model = "gemini-3.5-flash-lite"
    key = Path("/run/secrets", provider + "-api-key").read_text(encoding="utf-8-sig").strip()
    if not key or not key.isascii() or any(char.isspace() for char in key):
        raise ValueError("Invalid API key")
    return base, key, os.getenv(prefix + "_MODEL", default_model)


def structured(provider, system, payload, schema, max_tokens, timeout):
    base, key, model = settings(provider)
    options = {"enable_thinking": False} if provider == "qwen" else {}
    if provider == "gemini":
        schema = gemini_schema(schema)
    with httpx.Client(timeout=timeout) as client:
        response = client.post(
            base + "/chat/completions",
            headers={"Authorization": "Bearer " + key},
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
                ],
                **options,
                "stream": False,
                "temperature": 0,
                "max_tokens": max_tokens,
                "response_format": {
                    "type": "json_schema",
                    "json_schema": {"name": "smartgym_rag", "strict": True, "schema": schema},
                },
            },
        )
        response.raise_for_status()
        return json.loads(response.json()["choices"][0]["message"]["content"])


def compact_draft_schema(schema):
    # Keep the source ID enum. RAG still checks each quote against the original
    # passage and reviews whether that quote supports the proposed answer.
    definitions = schema.get("$defs", {})
    alternatives = definitions.get("Point", {}).get("oneOf")
    if alternatives:
        point = alternatives[0]
        return {**schema, "$defs": {**definitions, "Point": {
            **point, "properties": {
                "text": point["properties"]["text"],
                "chunk_id": {"type": "string", "enum": [
                    item["properties"]["chunk_id"]["const"] for item in alternatives
                ]},
                "quote": {"type": "string", "description": "Copy a verbatim span from the cited evidence"},
            },
        }}}
    return schema


def gemini_schema(schema):
    def remove_unsupported(value):
        if isinstance(value, dict):
            return {key: remove_unsupported(item) for key, item in value.items() if key != "uniqueItems"}
        if isinstance(value, list):
            return [remove_unsupported(item) for item in value]
        return value

    return remove_unsupported(compact_draft_schema(schema))


def require_service_token(authorization):
    token = os.getenv("KB_INTERNAL_TOKEN")
    if not token or not secrets.compare_digest((authorization or "").encode(), ("Bearer " + token).encode()):
        raise HTTPException(401, "Invalid internal service token")


def register(app):
    from typing import Literal
    from .chatbot import ChatbotRequest, answer_chatbot
    from .presentation import present_chatbot_response

    @app.post("/internal/v1/chatbot/{provider}", include_in_schema=False)
    def cloud_chat(provider: Literal["qwen", "gemini"], body: ChatbotRequest,
                   authorization: str | None = Header(default=None)):
        require_service_token(authorization)
        if (body.task != "knowledge" or body.records or body.rules or body.scoring_policy
                or body.history or body.conversation or (body.video_context and body.video_context.state != "none")):
            raise HTTPException(422, "Cloud providers accept standalone knowledge questions only")
        try:
            _, _, model = settings(provider)
        except (OSError, ValueError):
            raise HTTPException(503, "Cloud provider is not configured") from None
        engine = app.state.engine
        if engine is None:
            raise HTTPException(503, "Knowledge base not ready")
        request_engine = copy(engine)
        request_engine.settings = replace(engine.settings, llm_provider=provider, chat_model=model)
        return present_chatbot_response(answer_chatbot(request_engine, body))
