from typing import Literal
from typing import Annotated
from pydantic import BaseModel, ConfigDict, Field, model_validator

Exercise = Literal['SQUAT', 'PUSHUP', 'JUMPING_JACK', 'REVERSE_CRUNCH']

class Observation(BaseModel):
    model_config = ConfigDict(extra='forbid')
    exercise_code: Exercise
    labels: list[Annotated[str, Field(min_length=1, max_length=100)]] = Field(default_factory=list, max_length=40)
    unit: Literal['rep', 'window', 'video'] = 'window'
    rep_number: int | None = Field(default=None, ge=1)
    observation_status: Literal['sufficient', 'insufficient', 'unknown'] = 'unknown'
    simulated: bool = True
    model_version: str | None = Field(default=None, max_length=100)
    schema_version: str | None = Field(default=None, max_length=150)
    model_sha256: str | None = Field(default=None, pattern=r'^[a-f0-9]{64}$')
    @model_validator(mode='after')
    def rep_unit(self):
        if self.rep_number is not None and self.unit!='rep':
            raise ValueError('rep_number is only valid when unit=rep')
        return self

class QueryRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    message: str = Field(min_length=2, max_length=3000)
    exercise_code: Exercise | None = None
    observation: Observation | None = None
    top_k: int = Field(default=5, ge=1, le=10)
    @model_validator(mode='after')
    def coherent_exercise(self):
        if self.exercise_code and self.observation and self.exercise_code!=self.observation.exercise_code:
            raise ValueError('exercise_code conflicts with observation')
        return self

class ChatRequest(QueryRequest):
    generate: bool = True

class ModelChatRequest(BaseModel):
    model_config=ConfigDict(extra='forbid')
    message: str = Field(default='Giải thích các nhãn của video và tiêu chí kỹ thuật có nguồn liên quan.',min_length=2,max_length=3000)
    model_result: dict
    generate: bool = True
    simulated: bool = True
    top_k: int = Field(default=8,ge=1,le=10)

class Evidence(BaseModel):
    chunk_id: str
    source_id: str
    title: str
    publisher: str
    url: str
    pdf_page: int | None = None
    section: str | None = None
    text: str
    score: float
    channels: list[str]
    attribution: str | None = None
    license: str | None = None

class ChatResponse(BaseModel):
    reply: str
    status: Literal['generated', 'grounded_guidance', 'evidence_only', 'insufficient_evidence', 'insufficient_observation']
    generation_used: bool
    citations: list[str]
    evidence: list[Evidence]
    graph_claims: list[dict]
    warnings: list[str]
    kb_version: str
    model_version: str
    retrieval: dict
    generation_mode: Literal['free_text','claim_selection','none'] = 'none'
    observation: Observation | None = None
    label_explanations: list[dict] = Field(default_factory=list)
    knowledge_coverage: dict = Field(default_factory=dict)
