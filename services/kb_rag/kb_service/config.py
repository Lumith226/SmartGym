from dataclasses import dataclass
from pathlib import Path
import os
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / '.env', override=False)

@dataclass(frozen=True)
class Settings:
    index_dir: Path
    retrieval_mode: str
    llm_provider: str
    ollama_url: str
    chat_model: str
    embed_model: str
    llm_timeout: float
    internal_token: str

    @classmethod
    def from_env(cls):
        index = Path(os.getenv('KB_INDEX_DIR', './data/index'))
        if not index.is_absolute(): index = ROOT / index
        return cls(index.resolve(), os.getenv('KB_RETRIEVAL_MODE', 'hybrid'),
            os.getenv('KB_LLM_PROVIDER', 'ollama'),
            os.getenv('OLLAMA_BASE_URL', 'http://127.0.0.1:11434').rstrip('/'),
            os.getenv('OLLAMA_CHAT_MODEL', 'qwen3:8b'),
            os.getenv('OLLAMA_EMBED_MODEL', 'qwen3-embedding:0.6b'),
            float(os.getenv('KB_LLM_TIMEOUT', '120')),
            os.getenv('KB_INTERNAL_TOKEN', ''))
