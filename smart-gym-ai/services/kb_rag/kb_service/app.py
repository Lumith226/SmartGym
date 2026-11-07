from contextlib import asynccontextmanager
import secrets
import hashlib
from pathlib import Path
from fastapi import FastAPI, Depends, Header, HTTPException
from .config import Settings
from .engine import Engine
from .models import QueryRequest, ChatRequest, ChatResponse, ModelChatRequest
from .v4 import adapt_model_request,coverage_report
from .retrieval import LABEL_TERMS
from .chatbot import ChatbotRequest, answer_chatbot
from .presentation import present_chatbot_response
RUNTIME_REVISION=hashlib.sha256(b''.join((Path(__file__).parent/name).read_bytes() for name in ['app.py','knowledge.py','chatbot.py','presentation.py','grounding.py','observation_chat.py'])).hexdigest()[:16]

def create_app(settings: Settings | None=None):
    settings=settings or Settings.from_env()
    @asynccontextmanager
    async def lifespan(app):
        # An empty KB keeps health/docs accessible. Chat explicitly reports not ready.
        app.state.engine=Engine(settings) if (settings.index_dir/'snapshot.json').exists() else None
        yield
    app=FastAPI(title='SmartGym KB + RAG Service',version='0.2.0',lifespan=lifespan,
        description='Independent service. Sources, graph, retrieval trace and grounded answers. /docs is the inspection surface.')
    def authorize(authorization: str | None=Header(default=None)):
        if settings.internal_token and not secrets.compare_digest(authorization or '', 'Bearer '+settings.internal_token):
            raise HTTPException(401,'Invalid internal service token')
    def get_engine():
        engine=getattr(app.state,'engine',None)
        if engine is None: raise HTTPException(503,'KB has not been ingested. Run python -m kb_service.cli ingest and restart service.')
        return engine
    @app.post('/v1/chatbot',dependencies=[Depends(authorize)])
    def chatbot(body: ChatbotRequest,engine=Depends(get_engine)):
        try:return present_chatbot_response(answer_chatbot(engine,body))
        except ValueError as exc:raise HTTPException(422,str(exc))
    @app.get('/health')
    def health():
        e=getattr(app.state,'engine',None)
        return {'service':'smartgym-kb-rag','kb_ready':e is not None,'kb_version':e.retriever.snapshot['version'] if e else None,
            'runtime_revision':RUNTIME_REVISION,
            'dense_index':e.retriever.dense_status if e else 'not_indexed','llm_provider':settings.llm_provider,'llm_model':settings.chat_model,
            'note':'Provider configuration is not a successful connectivity check. Run cli doctor.'}
    @app.get('/v1/kb/sources',dependencies=[Depends(authorize)])
    def source_list(engine=Depends(get_engine)): return engine.retriever.snapshot['sources']
    @app.get('/v1/kb/stats',dependencies=[Depends(authorize)])
    def stats(engine=Depends(get_engine)): return engine.retriever.snapshot['report']
    @app.get('/v1/kb/graph',dependencies=[Depends(authorize)])
    def graph(limit: int=200, engine=Depends(get_engine)):
        limit=max(1,min(limit,1000));g=engine.retriever.snapshot['graph']
        nodes=g['nodes'][:limit];ids={n['id'] for n in nodes}
        return {'nodes':nodes,'edges':[e for e in g['edges'] if e['from'] in ids and e['to'] in ids], 'total_nodes':len(g['nodes']),'truncated':len(nodes)<len(g['nodes'])}
    @app.get('/v1/kb/claims',dependencies=[Depends(authorize)])
    def claims(engine=Depends(get_engine)): return engine.retriever.snapshot['claims']
    @app.get('/v1/kb/labels',dependencies=[Depends(authorize)])
    def labels(engine=Depends(get_engine)):return engine.retriever.snapshot.get('label_catalog') or {}
    @app.get('/v1/kb/coverage',dependencies=[Depends(authorize)])
    def coverage(engine=Depends(get_engine)):return coverage_report(engine.retriever.snapshot)
    @app.post('/v1/chat/from-model',response_model=ChatResponse,dependencies=[Depends(authorize)])
    def chat_from_model(body: ModelChatRequest,engine=Depends(get_engine)):
        try:return engine.answer(adapt_model_request(body,engine.retriever.snapshot))
        except ValueError as exc:raise HTTPException(422,str(exc))
    @app.get('/v1/kb/fault/{code}',dependencies=[Depends(authorize)])
    def fault(code: str, engine=Depends(get_engine)):
        matched=[c for c in engine.retriever.snapshot['claims'] if code.upper() in c.get('labels',[])]
        return {'code':code.upper(),'mapping_status':'provisional','causes':[],'risks':[], 'corrections':[],
            'criteria':matched,'known_retrieval_alias':code.upper() in LABEL_TERMS,
            'note':'A model label does not establish a cause or diagnosis.'}
    @app.post('/v1/retrieve',dependencies=[Depends(authorize)])
    def retrieve(body: QueryRequest, engine=Depends(get_engine)):
        try: evidence,claims,trace=engine.retriever.search(body)
        except ValueError as exc: raise HTTPException(422,str(exc))
        return {'evidence':[e.model_dump() for e in evidence],'graph_claims':claims,'trace':trace,'kb_version':engine.retriever.snapshot['version']}
    @app.post('/v1/chat',response_model=ChatResponse,dependencies=[Depends(authorize)])
    def chat(body: ChatRequest, engine=Depends(get_engine)):
        try:return engine.answer(body)
        except ValueError as exc:raise HTTPException(422,str(exc))
    return app

app=create_app()
