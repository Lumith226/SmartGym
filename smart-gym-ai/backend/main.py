"""
Smart Gym AI – FastAPI Main Application
"""
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from core.config import settings
from core.database import create_all_tables
from routers import auth, profile, session, coach


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ─────────────────────────────────
    print(f"🏋️  Starting {settings.APP_NAME} API...")
    os.makedirs(settings.SNAPSHOT_DIR, exist_ok=True)

    # Create DB tables (dev mode – use Alembic migrations in prod)
    try:
        await create_all_tables()
        print("✅ Database tables ready")
    except Exception as e:
        print(f"⚠️  DB setup warning: {e}")

    # TODO TV1: Load YOLOv8 + ST-GCN++ ONNX models here
    # KB/RAG owns its corpus, indexes and graph; this API calls it over HTTP.
    print("🚀 Server ready!")

    yield

    # ── Shutdown ────────────────────────────────
    print("👋 Shutting down...")


app = FastAPI(
    title="Smart Gym AI API",
    description=(
        "API cho hệ thống đánh giá tư thế tập luyện thông minh.\n\n"
        "- **TV1** – AI Core: YOLOv8-Pose + ST-GCN++ + WebSocket stream\n"
        "- **TV2** – AI Coach: Knowledge Graph + RAG + Qwen2.5\n"
        "- **TV3** – Web/System: Auth + Profile + Session + Analytics\n"
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ── CORS ─────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Static files (snapshots) ──────────────────────────────────
app.mount("/static", StaticFiles(directory="static"), name="static")

# ── Routes ───────────────────────────────────────────────────
PREFIX = "/api/v1"
app.include_router(auth.router,    prefix=PREFIX)
app.include_router(profile.router, prefix=PREFIX)
app.include_router(session.router, prefix=PREFIX)
app.include_router(coach.router,   prefix=PREFIX)


# ── Health check ──────────────────────────────────────────────
@app.get("/api/health", tags=["Health"])
async def health():
    return {
        "status": "ok",
        "service": settings.APP_NAME,
        "version": "1.0.0",
        "debug": settings.DEBUG,
        "ai_core": "placeholder (TV1 pending)",
        "kb_rag": {"integration": "http_microservice", "url": settings.KB_RAG_SERVICE_URL, "connectivity_checked": False},
    }


@app.get("/", tags=["Root"])
async def root():
    return {"message": f"Welcome to {settings.APP_NAME} API", "docs": "/docs"}
