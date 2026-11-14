# -*- coding: utf-8 -*-
import sys
import json
import os
from pathlib import Path

# Force UTF-8 on stdio in Windows
if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Set PYTHONPATH to smart-gym-ai/services/kb_rag
kb_rag_dir = r"E:\do an\smart-gym-ai\services\kb_rag"
if kb_rag_dir not in sys.path:
    sys.path.insert(0, kb_rag_dir)

os.environ["PYTHONUTF8"] = "1"
os.environ.setdefault("OLLAMA_CHAT_MODEL", "qwen2.5:3b")
os.environ.setdefault("OLLAMA_EMBED_MODEL", "nomic-embed-text:latest")

from kb_service.config import Settings
from kb_service.engine import Engine
from kb_service.models import ChatRequest

def run():
    try:
        raw_input = sys.stdin.read().lstrip("\ufeff")
        input_data = json.loads(raw_input)
        message = input_data.get("message", "").strip()
        task = input_data.get("task", "knowledge")
        generate = input_data.get("generate", True)

        if not message:
            print(json.dumps({"error": "Empty message"}, ensure_ascii=False))
            return

        settings = Settings.from_env()
        engine = Engine(settings)
        req = ChatRequest(message=message, generate=generate)
        res = engine.answer(req)

        references = []
        for idx, cid in enumerate(res.citations, 1):
            ev = next((e for e in res.evidence if e.chunk_id == cid), None)
            if ev:
                references.append({
                    "number": idx,
                    "title": ev.title,
                    "publisher": ev.publisher,
                    "url": ev.url,
                    "pdf_page": ev.pdf_page,
                    "section": ev.section,
                    "excerpt": ev.text[:400]
                })

        output = {
            "reply": res.reply,
            "task": task,
            "status": res.status,
            "generation_used": res.generation_used,
            "generation_mode": "free_text" if res.generation_used else "none",
            "kb_version": res.kb_version,
            "model_version": res.model_version,
            "references": references,
            "user_notices": res.warnings,
            "session": {
                "observations": [],
                "units": [],
                "errors": [],
                "penalty_total": None,
                "scoring_policy": None,
                "practice_suggestions": []
            }
        }
        print(json.dumps(output, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({
            "reply": f"Lỗi xử lý RAG: {str(e)}",
            "task": "knowledge",
            "status": "unavailable",
            "generation_used": False,
            "generation_mode": "none",
            "kb_version": "none",
            "model_version": "none",
            "references": [],
            "user_notices": [str(e)],
            "session": {
                "observations": [],
                "units": [],
                "errors": [],
                "penalty_total": None,
                "scoring_policy": None,
                "practice_suggestions": []
            }
        }, ensure_ascii=False))

if __name__ == "__main__":
    run()
