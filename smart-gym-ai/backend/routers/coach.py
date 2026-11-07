"""Authenticated gateway to the SmartGym KB/RAG microservice."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_db
from core.security import get_current_user
from models.db_models import User, WorkoutSession
from models.schemas import CoachChatRequest, CoachExplainRepRequest, CoachResponse
from modules.kb_rag.client import request_kb, coach_response

router = APIRouter(prefix='/coach', tags=['AI Coach'])

def normalize_exercise(code: str) -> str:
    aliases={'PUSH_UP':'PUSHUP','JUMPJACK':'JUMPING_JACK','JUMPING_JACKS':'JUMPING_JACK','CRUNCH':'REVERSE_CRUNCH'}
    return aliases.get(code.upper(),code.upper())

async def owned_session(session_id: str, user: User, db: AsyncSession):
    session=await db.scalar(select(WorkoutSession).where(WorkoutSession.id==session_id,WorkoutSession.user_id==user.id))
    if session is None: raise HTTPException(404,'Workout session not found')
    return session

@router.post('/chat',response_model=CoachResponse)
async def coach_chat(body: CoachChatRequest,current_user: User=Depends(get_current_user),db: AsyncSession=Depends(get_db)):
    exercise=body.exercise_code
    if body.session_id:
        session=await owned_session(body.session_id,current_user,db)
        actual=normalize_exercise(session.exercise_code)
        if exercise and normalize_exercise(exercise)!=actual: raise HTTPException(422,'Exercise conflicts with saved session')
        exercise=actual
    elif exercise: exercise=normalize_exercise(exercise)
    observation=body.observation
    if observation is None and body.context and isinstance(body.context.get('observation'),dict): observation=body.context['observation']
    payload={'message':body.message,'exercise_code':exercise,'observation':observation,'generate':True}
    return coach_response(await request_kb('/v1/chat',payload))

@router.post('/explain-rep',response_model=CoachResponse)
async def explain_rep(body: CoachExplainRepRequest,current_user: User=Depends(get_current_user),db: AsyncSession=Depends(get_db)):
    session=await owned_session(body.session_id,current_user,db)
    exercise=normalize_exercise(session.exercise_code)
    observation={'exercise_code':exercise,'labels':[body.fault_code],'unit':'rep','rep_number':body.rep_number,
        'observation_status':'unknown','simulated':False,'model_version':session.model_version}
    result=await request_kb('/v1/chat',{'message':f'Giải thích tiêu chí liên quan đến nhãn {body.fault_code} ở rep {body.rep_number}.',
        'exercise_code':exercise,'observation':observation,'generate':True})
    result['warnings'].append('Nhãn do client chọn; cần đối chiếu ErrorLog và đầu ra DL thật trước khi kết luận về rep này.')
    return coach_response(result,body.fault_code)

@router.get('/kb/fault/{fault_code}')
async def get_fault_info(fault_code: str,current_user: User=Depends(get_current_user)):
    import re
    if not re.fullmatch(r'[A-Za-z0-9_]{1,80}',fault_code): raise HTTPException(422,'Invalid fault code')
    return await request_kb('/v1/kb/fault/'+fault_code.upper())
