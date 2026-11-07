"""
Smart Gym AI – Pydantic Schemas (Request / Response)
"""
from __future__ import annotations
from datetime import datetime
from typing import Any
from pydantic import BaseModel, EmailStr, Field, model_validator


# ── Auth ──────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=2)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


# ── User Profile ──────────────────────────────────────────────
class UserOut(BaseModel):
    id: str
    email: str
    role: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ProfileOut(BaseModel):
    user_id: str
    full_name: str | None
    height_cm: float | None
    weight_kg: float | None
    age: int | None
    gender: str | None
    goal: str | None
    fitness_level: str | None
    bmi: float | None
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProfileUpdate(BaseModel):
    full_name: str | None = None
    height_cm: float | None = Field(None, ge=100, le=250)
    weight_kg: float | None = Field(None, ge=20, le=300)
    age: int | None = Field(None, ge=10, le=120)
    gender: str | None = None
    goal: str | None = None
    fitness_level: str | None = None


class WeightLogRequest(BaseModel):
    weight_kg: float = Field(ge=20, le=300)


class WeightLogOut(BaseModel):
    id: str
    weight_kg: float
    bmi: float | None
    recorded_at: datetime

    model_config = {"from_attributes": True}


# ── Workout Sessions ──────────────────────────────────────────
class SessionStartRequest(BaseModel):
    exercise_code: str = Field(default="SQUAT")


class SessionOut(BaseModel):
    id: str
    user_id: str
    exercise_code: str
    started_at: datetime | None
    ended_at: datetime | None
    total_reps: int
    valid_reps: int
    session_score: float | None
    model_version: str | None
    kb_version: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class SessionSummary(BaseModel):
    session_id: str
    exercise_code: str
    total_reps: int
    valid_reps: int
    error_rate: float
    session_score: float
    duration_seconds: int
    error_breakdown: dict[str, int]  # {"KNEE_VALGUS": 3, "SHALLOW_DEPTH": 2}


# ── Error Logs ────────────────────────────────────────────────
class ErrorLogOut(BaseModel):
    id: str
    rep_number: int
    fault_code: str
    severity: str
    dtw_score: float | None
    joint_angles: dict | None
    timestamp_ms: int | None
    snapshot_url: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── WebSocket Frame Result (AI Core → Frontend) ───────────────
class FrameResult(BaseModel):
    type: str = "frame_result"
    rep_number: int
    phase: str            # STANDING | DESCENDING | BOTTOM | ASCENDING
    keypoints: list[list[float]]   # [[x, y, conf], ...]  17 points
    fault_code: str       # CORRECT | BACK_ROUNDING | KNEE_VALGUS | SHALLOW_DEPTH | UNKNOWN
    severity: str         # OK | WARNING | CRITICAL
    dtw_score: float
    confidence: float
    snapshot_url: str | None
    joint_angles: dict[str, float]


# ── Workout Plans ─────────────────────────────────────────────
class PlanDayEntry(BaseModel):
    exercise: str
    sets: int
    reps: int
    rest_sec: int = 90
    notes: str | None = None


class WorkoutPlanRequest(BaseModel):
    week_start: str  # YYYY-MM-DD
    plan: dict[str, list[PlanDayEntry]]
    # {"mon": [...], "tue": [...], ...}


class WorkoutPlanOut(BaseModel):
    id: str
    week_start: str | None
    plan_json: dict | None
    created_by: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── AI Coach ──────────────────────────────────────────────────
class CoachChatRequest(BaseModel):
    session_id: str | None = None
    message: str
    context: dict | None = None
    exercise_code: str | None = None
    observation: dict | None = None


class CoachExplainRepRequest(BaseModel):
    rep_number: int
    fault_code: str
    session_id: str
    joint_angles: dict | None = None


class CoachResponse(BaseModel):
    reply: str
    fault_code: str | None
    causes: list[str] = []
    corrections: list[dict] = []
    risk_warning: str | None = None
    sources: list[dict] = []
    kb_version: str
    model_version: str
    status: str = "unknown"
    generation_used: bool = False
    citations: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    graph_claims: list[dict] = Field(default_factory=list)
    retrieval: dict = Field(default_factory=dict)
    generation_mode: str = 'none'
    observation: dict | None = None
    label_explanations: list[dict] = Field(default_factory=list)
    knowledge_coverage: dict = Field(default_factory=dict)


# ── Health check ──────────────────────────────────────────────
class HealthResponse(BaseModel):
    status: str = "ok"
    service: str
    version: str
    db: str
    ai_core: str
    kb_rag: str
