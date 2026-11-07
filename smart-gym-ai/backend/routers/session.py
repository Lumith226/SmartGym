"""
Smart Gym AI – Session Router (TV1 Integration Point)
POST /api/v1/session/start
POST /api/v1/session/{id}/end
GET  /api/v1/session/{id}
GET  /api/v1/session/{id}/errors
GET  /api/v1/sessions
WS   /ws/stream/{session_id}
"""
import json
import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from core.database import get_db
from core.security import get_current_user, decode_token
from models.db_models import User, WorkoutSession, ErrorLog
from models.schemas import (
    SessionStartRequest, SessionOut, SessionSummary, ErrorLogOut
)
from core.config import settings

router = APIRouter(tags=["Workout Session"])


# ── REST endpoints ────────────────────────────────────────────
@router.post("/session/start", response_model=SessionOut, status_code=201)
async def start_session(
    body: SessionStartRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = WorkoutSession(
        user_id=current_user.id,
        exercise_code=body.exercise_code.upper(),
        started_at=datetime.now(timezone.utc),
        model_version="stgcn_v1.0",
        kb_version=settings.KB_VERSION,
    )
    db.add(session)
    await db.flush()
    return session


@router.post("/session/{session_id}/end", response_model=SessionSummary)
async def end_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WorkoutSession).where(
            WorkoutSession.id == session_id,
            WorkoutSession.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Session not found")
    if session.ended_at:
        raise HTTPException(400, "Session already ended")

    session.ended_at = datetime.now(timezone.utc)

    # Calculate session score from error logs
    errors = await db.execute(
        select(ErrorLog).where(ErrorLog.session_id == session_id)
    )
    error_list = errors.scalars().all()

    error_breakdown: dict[str, int] = {}
    total_dtw = 0.0
    dtw_count = 0
    for e in error_list:
        if e.fault_code != "CORRECT":
            error_breakdown[e.fault_code] = error_breakdown.get(e.fault_code, 0) + 1
        if e.dtw_score is not None:
            total_dtw += e.dtw_score
            dtw_count += 1

    avg_dtw = total_dtw / dtw_count if dtw_count else 0.7
    error_rate = len([e for e in error_list if e.fault_code != "CORRECT"]) / max(session.total_reps, 1)
    session_score = round(avg_dtw * (1 - error_rate), 3)

    session.session_score = session_score
    duration = int((session.ended_at - session.started_at).total_seconds()) if session.started_at else 0

    return SessionSummary(
        session_id=session.id,
        exercise_code=session.exercise_code,
        total_reps=session.total_reps,
        valid_reps=session.valid_reps,
        error_rate=round(error_rate, 3),
        session_score=session_score,
        duration_seconds=duration,
        error_breakdown=error_breakdown,
    )


@router.get("/session/{session_id}", response_model=SessionOut)
async def get_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WorkoutSession).where(
            WorkoutSession.id == session_id,
            WorkoutSession.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Session not found")
    return session


@router.get("/session/{session_id}/errors", response_model=list[ErrorLogOut])
async def get_session_errors(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ErrorLog).where(ErrorLog.session_id == session_id)
        .order_by(ErrorLog.rep_number)
    )
    return result.scalars().all()


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = 20,
):
    result = await db.execute(
        select(WorkoutSession)
        .where(WorkoutSession.user_id == current_user.id)
        .order_by(WorkoutSession.created_at.desc())
        .limit(limit)
    )
    return result.scalars().all()


# ── WebSocket: AI Core stream ─────────────────────────────────
# TV1 (Thắng) sẽ thay thế phần xử lý AI trong handle_ai_frame()
class ConnectionManager:
    def __init__(self):
        self.active: dict[str, WebSocket] = {}

    async def connect(self, session_id: str, ws: WebSocket):
        await ws.accept()
        self.active[session_id] = ws

    def disconnect(self, session_id: str):
        self.active.pop(session_id, None)

    async def send(self, session_id: str, data: dict):
        ws = self.active.get(session_id)
        if ws:
            await ws.send_json(data)


manager = ConnectionManager()


@router.websocket("/ws/stream/{session_id}")
async def websocket_stream(session_id: str, ws: WebSocket):
    """
    WebSocket endpoint for live workout streaming.
    Client sends: {token, frame_b64}  (JPEG frame as base64)
    Server sends: FrameResult JSON    (keypoints, fault, score, ...)

    TV1 Hook: Replace `_placeholder_ai_process()` with actual pipeline.
    """
    # Authenticate via query param token (WS can't send headers easily)
    token = ws.query_params.get("token")
    if not token:
        await ws.close(code=1008)
        return
    try:
        payload = decode_token(token)
    except Exception:
        await ws.close(code=1008)
        return

    await manager.connect(session_id, ws)
    rep_counter = 0

    try:
        while True:
            data = await ws.receive_json()
            frame_b64 = data.get("frame_b64", "")

            # ── TV1: Replace this block with real AI pipeline ──
            result = await _placeholder_ai_process(frame_b64, rep_counter)
            # ──────────────────────────────────────────────────

            await ws.send_json(result)

            if result.get("phase") == "ASCENDING" and result.get("rep_complete"):
                rep_counter += 1

    except WebSocketDisconnect:
        manager.disconnect(session_id)
    except Exception as e:
        await ws.send_json({"type": "error", "message": str(e)})
        manager.disconnect(session_id)


async def _placeholder_ai_process(frame_b64: str, rep_count: int) -> dict:
    """
    ⚠️  PLACEHOLDER – TV1 (Lưu Minh Thắng) sẽ thay thế hàm này
    bằng pipeline thực: YOLOv8 → FSM → Gatekeeper → ST-GCN++ → DTW
    """
    await asyncio.sleep(0.01)  # simulate 10ms processing
    return {
        "type": "frame_result",
        "rep_number": rep_count,
        "phase": "STANDING",
        "keypoints": [[0.5, 0.3, 0.9]] * 17,
        "fault_code": "CORRECT",
        "severity": "OK",
        "dtw_score": 0.85,
        "confidence": 0.92,
        "snapshot_url": None,
        "joint_angles": {"knee_l": 170, "knee_r": 170, "hip": 175},
        "rep_complete": False,
        "placeholder": True,  # remove after TV1 implements real pipeline
    }
