"""Configure structured generation transport for the pinned RAG handoff."""

from pathlib import Path

providers = Path("kb_service/providers.py")
source = providers.read_text(encoding="utf-8")
anchor = '        """Structured inference for semantic planning, synthesis and review."""\n'
if source.count(anchor) != 1:
    raise SystemExit("RAG handoff changed: review the structured generation integration")
source = source.replace(anchor, anchor + '''        if self.settings.llm_provider in ("qwen", "gemini"):
            from .smartgym_cloud import structured
            try:
                return structured(self.settings.llm_provider, system, payload, schema, max_tokens, self.settings.llm_timeout)
            except (httpx.HTTPError, OSError, KeyError, ValueError, TypeError, IndexError) as exc:
                raise ProviderError("Cloud structured generation unavailable") from exc
        if self.settings.llm_provider == "ollama":
            from .smartgym_cloud import compact_draft_schema
            schema = compact_draft_schema(schema)
''')
payload_json = "json.dumps(payload,ensure_ascii=False)"
if source.count(payload_json) != 1:
    raise SystemExit("RAG handoff changed: review the Ollama payload serialization")
source = source.replace(payload_json, "json.dumps(payload, ensure_ascii=False, separators=(',', ':'))")
providers.write_text(source, encoding="utf-8")
