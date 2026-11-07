"""
Smart Gym AI – Profile Router
GET/PUT /api/v1/profile
POST    /api/v1/profile/weight
GET     /api/v1/profile/weight-history
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import timezone, datetime
from core.database import get_db
from core.security import get_current_user
from models.db_models import User, UserProfile, WeightHistory
from models.schemas import ProfileOut, ProfileUpdate, WeightLogRequest, WeightLogOut

router = APIRouter(prefix="/profile", tags=["Profile"])


@router.get("", response_model=ProfileOut)
async def get_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserProfile).where(UserProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@router.put("", response_model=ProfileOut)
async def update_profile(
    body: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserProfile).where(UserProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        profile = UserProfile(user_id=current_user.id)
        db.add(profile)

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(profile, field, value)
    profile.updated_at = datetime.now(timezone.utc)
    return profile


@router.post("/weight", response_model=WeightLogOut, status_code=201)
async def log_weight(
    body: WeightLogRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Auto-calculate BMI from profile height
    result = await db.execute(
        select(UserProfile).where(UserProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    bmi = None
    if profile and profile.height_cm:
        h = profile.height_cm / 100
        bmi = round(body.weight_kg / (h * h), 1)
        profile.weight_kg = body.weight_kg  # also update profile

    entry = WeightHistory(
        user_id=current_user.id,
        weight_kg=body.weight_kg,
        bmi=bmi,
    )
    db.add(entry)
    await db.flush()
    return entry


@router.get("/weight-history", response_model=list[WeightLogOut])
async def get_weight_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WeightHistory)
        .where(WeightHistory.user_id == current_user.id)
        .order_by(WeightHistory.recorded_at.desc())
        .limit(90)
    )
    return result.scalars().all()
