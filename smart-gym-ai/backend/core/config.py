"""
Smart Gym AI – Application Configuration
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    APP_NAME: str = "Smart Gym AI"
    DEBUG: bool = True
    ALLOWED_ORIGINS: str = "http://localhost:3000"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://smartgym:smartgym123@localhost:5432/smartgymdb"

    # JWT
    SECRET_KEY: str = "change-this-to-a-real-secret-key-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Storage
    SNAPSHOT_DIR: str = "./static/snapshots"
    MAX_SNAPSHOT_SIZE_KB: int = 60

    # AI Models (TV1)
    YOLO_MODEL_PATH: str = "./models/yolov8n-pose.onnx"
    STGCN_MODEL_PATH: str = "./models/stgcn_squat.onnx"
    STGCN_CONFIDENCE_THRESHOLD: float = 0.5

    # Knowledge Base (TV2)
    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "neo4j123"
    CHROMADB_HOST: str = "localhost"
    CHROMADB_PORT: int = 8001
    KB_VERSION: str = "v1.0"
    KB_RAG_SERVICE_URL: str = "http://127.0.0.1:8010"
    KB_RAG_INTERNAL_TOKEN: str = ""
    KB_RAG_TIMEOUT: float = 150

    # LLM (TV2)
    QWEN_MODEL_NAME: str = "Qwen/Qwen2.5-3B-Instruct"

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
