"""
Smart Gym AI – SQLAlchemy ORM Models
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    String, Float, Integer, Boolean, DateTime,
    ForeignKey, Text, BigInteger, Enum as SAEnum
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base


def now_utc():
    return datetime.now(timezone.utc)


def new_uuid():
    return str(uuid.uuid4())


# ── Users ─────────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), default="user")  # user | admin
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    profile: Mapped["UserProfile"] = relationship("UserProfile", back_populates="user", uselist=False)
    sessions: Mapped[list["WorkoutSession"]] = relationship("WorkoutSession", back_populates="user")
    plans: Mapped[list["WorkoutPlan"]] = relationship("WorkoutPlan", back_populates="user")
    weights: Mapped[list["WeightHistory"]] = relationship("WeightHistory", back_populates="user")


# ── User Profiles ─────────────────────────────────────────────
class UserProfile(Base):
    __tablename__ = "user_profiles"

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), primary_key=True)
    full_name: Mapped[str | None] = mapped_column(String(100))
    height_cm: Mapped[float | None] = mapped_column(Float)
    weight_kg: Mapped[float | None] = mapped_column(Float)
    age: Mapped[int | None] = mapped_column(Integer)
    gender: Mapped[str | None] = mapped_column(String(10))  # male | female | other
    goal: Mapped[str | None] = mapped_column(String(50))    # muscle_gain | fat_loss | maintain
    fitness_level: Mapped[str | None] = mapped_column(String(20))  # beginner | intermediate | advanced
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    user: Mapped["User"] = relationship("User", back_populates="profile")

    @property
    def bmi(self) -> float | None:
        if self.height_cm and self.weight_kg:
            h = self.height_cm / 100
            return round(self.weight_kg / (h * h), 1)
        return None


# ── Workout Sessions ──────────────────────────────────────────
class WorkoutSession(Base):
    __tablename__ = "workout_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    exercise_code: Mapped[str] = mapped_column(String(50), nullable=False)  # SQUAT | PUSHUP | ...
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    total_reps: Mapped[int] = mapped_column(Integer, default=0)
    valid_reps: Mapped[int] = mapped_column(Integer, default=0)
    session_score: Mapped[float | None] = mapped_column(Float)
    model_version: Mapped[str | None] = mapped_column(String(30))
    kb_version: Mapped[str | None] = mapped_column(String(30))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    user: Mapped["User"] = relationship("User", back_populates="sessions")
    errors: Mapped[list["ErrorLog"]] = relationship("ErrorLog", back_populates="session")


# ── Error Logs ────────────────────────────────────────────────
class ErrorLog(Base):
    __tablename__ = "error_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("workout_sessions.id"), nullable=False)
    rep_number: Mapped[int] = mapped_column(Integer, nullable=False)
    fault_code: Mapped[str] = mapped_column(String(30), nullable=False)
    # CORRECT | BACK_ROUNDING | KNEE_VALGUS | SHALLOW_DEPTH | UNKNOWN
    severity: Mapped[str] = mapped_column(String(20), default="WARNING")  # WARNING | CRITICAL
    dtw_score: Mapped[float | None] = mapped_column(Float)
    joint_angles: Mapped[dict | None] = mapped_column(JSONB)
    timestamp_ms: Mapped[int | None] = mapped_column(BigInteger)
    snapshot_url: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    session: Mapped["WorkoutSession"] = relationship("WorkoutSession", back_populates="errors")
    snapshot: Mapped["Snapshot | None"] = relationship("Snapshot", back_populates="error_log", uselist=False)


# ── Snapshots ─────────────────────────────────────────────────
class Snapshot(Base):
    __tablename__ = "snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    error_log_id: Mapped[str] = mapped_column(String(36), ForeignKey("error_logs.id"), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_size_kb: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    error_log: Mapped["ErrorLog"] = relationship("ErrorLog", back_populates="snapshot")


# ── Workout Plans ─────────────────────────────────────────────
class WorkoutPlan(Base):
    __tablename__ = "workout_plans"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    week_start: Mapped[str | None] = mapped_column(String(10))   # ISO date YYYY-MM-DD
    plan_json: Mapped[dict | None] = mapped_column(JSONB)
    # {"mon": [{"exercise":"Squat","sets":3,"reps":10}], "tue": [...]}
    created_by: Mapped[str] = mapped_column(String(20), default="user")  # ai | user
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    user: Mapped["User"] = relationship("User", back_populates="plans")


# ── Weight History ────────────────────────────────────────────
class WeightHistory(Base):
    __tablename__ = "weight_history"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    weight_kg: Mapped[float] = mapped_column(Float, nullable=False)
    bmi: Mapped[float | None] = mapped_column(Float)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    user: Mapped["User"] = relationship("User", back_populates="weights")
