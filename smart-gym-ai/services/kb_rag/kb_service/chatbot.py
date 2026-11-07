"""Four coaching tasks over explicit session records and versioned KB evidence."""
from collections import Counter
import re
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator
from .models import ModelChatRequest, Evidence
from .v4 import adapt_model_request, explain_labels

class SessionRecord(BaseModel):
    model_config=ConfigDict(extra='forbid')
    observation_id: str = Field(min_length=1,max_length=100)
    # Repeated uploads of the same video must use the same source_id.
    source_id: str = Field(min_length=1,max_length=200)
    model_result: dict
    simulated: bool = True

class PenaltyRule(BaseModel):
    model_config=ConfigDict(extra='forbid')
    exercise_code: Literal['SQUAT','PUSHUP','JUMPING_JACK','REVERSE_CRUNCH']
    label_key: str = Field(min_length=1,max_length=100)
    points: float = Field(gt=0,le=100,allow_inf_nan=False)

class VideoContext(BaseModel):
    model_config=ConfigDict(extra='forbid')
    state: Literal['none','selected','analyzing','analyzed','attached']='none'
    source_id: str | None = Field(default=None,max_length=200)

class ChatbotRequest(BaseModel):
    model_config=ConfigDict(extra='forbid')
    message: str = Field(min_length=2,max_length=3000)
    task: Literal['knowledge','score','summary','practice'] = 'knowledge'
    records: list[SessionRecord] = Field(default_factory=list,max_length=50)
    rules: list[PenaltyRule] = Field(default_factory=list,max_length=83)
    scoring_policy: str | None = Field(default=None,max_length=200)
    history: list[str] = Field(default_factory=list,max_length=8)
    conversation: list[dict] = Field(default_factory=list,max_length=8)
    generate: bool = True
    video_context: VideoContext | None = None
    @model_validator(mode='after')
    def unique(self):
        if len({r.observation_id for r in self.records})!=len(self.records):raise ValueError('Duplicate observation_id')
        if len({(r.exercise_code,r.label_key) for r in self.rules})!=len(self.rules):raise ValueError('Duplicate penalty rule')
        if self.rules and not self.scoring_policy:raise ValueError('Name the supplied scoring policy')
        if any(len(s)>3000 for s in self.history):raise ValueError('History turn too long')
        for turn in self.conversation:
            if set(turn)!={'role','content'} or turn['role'] not in ('user','assistant') or not isinstance(turn['content'],str) or len(turn['content'])>3000:raise ValueError('Invalid conversation turn')
        return self

def answer_chatbot(engine, request):
    snap=engine.retriever.snapshot
    if request.task=='knowledge':
        session=[];seen=set()
        for record in request.records:
            observation=adapt_model_request(ModelChatRequest(model_result=record.model_result,simulated=record.simulated,generate=False),snap).observation
            identity=(record.source_id,observation.exercise_code)
            if identity in seen:continue
            seen.add(identity)
            session.append({'observation_id':record.observation_id,**observation.model_dump(mode='json'),
                            'label_meanings':explain_labels(observation,snap) if observation.observation_status=='sufficient' else []})
        from .knowledge import answer_knowledge
        out=answer_knowledge(engine,request.message,request.generate,request.conversation or request.history,session,
                             request.video_context.model_dump() if request.video_context else None)
        return {**out,'task':request.task,'session':{'observations':session},'support_level':'retrieved_evidence_synthesis'}
    rule_map={}
    for rule in request.rules:
        spec=snap['label_catalog']['exercises'][rule.exercise_code]
        label=next((x for x in spec['labels'] if x['key']==rule.label_key),None)
        if label is None or label['kind']!='error':raise ValueError('Only registered error labels may receive penalties')
        rule_map[(rule.exercise_code,rule.label_key)]=rule.points
    units=[];seen=set();duplicates=0;evidence={};claims={};citations=[];warnings=[];counts=Counter();names={};ledger=[];responses=[];criterion_map={};retrievals=[]
    for record in request.records:
        adapted=adapt_model_request(ModelChatRequest(message=('Giải thích tiêu chí kỹ thuật: '+request.message)[:3000],model_result=record.model_result,
            simulated=record.simulated,generate=request.generate,top_k=10),snap)
        # One independent unit per source + exercise + scope. No overlap-derived habit count.
        obs=adapted.observation
        source=record.model_result.get('source') or {}
        if not isinstance(source,dict):raise ValueError('Invalid observation source metadata')
        if source.get('video_sha256') is not None and (not isinstance(source['video_sha256'],str) or not re.fullmatch('[a-f0-9]{64}',source['video_sha256'])):
            raise ValueError('Invalid observation video hash')
        identity=source.get('video_sha256') or record.source_id
        key=(identity,obs.exercise_code,obs.unit)
        if key in seen:duplicates+=1;continue
        seen.add(key)
        result=engine.answer(adapted).model_dump(mode='json');responses.append(result)
        retrievals.append({'observation_id':record.observation_id,**result['retrieval']})
        rows=explain_labels(obs,snap) if obs.observation_status=='sufficient' else []
        errors=[r for r in rows if r['kind']=='error']
        for r in errors:
            pair=(obs.exercise_code,r['key']);counts[pair]+=1;names[pair]=r['name_vi']
            criterion_map[pair]=r['criterion_ids']
            if pair in rule_map:ledger.append({'observation_id':record.observation_id,'exercise_code':pair[0],
                'label_key':pair[1],'name_vi':r['name_vi'],'points':rule_map[pair],'criterion_ids':r['criterion_ids']})
        units.append({'observation_id':record.observation_id,'source_id':record.source_id,'exercise_code':obs.exercise_code,
            'scope':obs.unit,'usable':obs.observation_status=='sufficient','simulated':obs.simulated,'error_labels':[r['key'] for r in errors]})
        evidence.update({e['chunk_id']:e for e in result['evidence']});claims.update({c['id']:c for c in result['graph_claims']})
        citations.extend(result['citations']);warnings.extend(result['warnings'])
    habits=[{'exercise_code':e,'label_key':k,'name_vi':names[(e,k)],'observed_units':n} for (e,k),n in counts.most_common()]
    lines=[];practice=[]
    if not units:lines=['Bạn có thể hỏi kiến thức ngay. Để nhận xét buổi tập, hãy phân tích hoặc nhập kết quả video trước nhé.']
    elif request.task=='score':
        if not request.rules:
            lines=['Hiện chưa có bảng quy tắc trừ điểm cho buổi tập này nên tôi chưa thể nói bạn bị trừ bao nhiêu điểm. Điểm ở bảng nhãn là điểm dự đoán của model, không phải điểm kỹ thuật bị trừ.']
        else:
            total=sum(r['points'] for r in ledger)
            lines=[f'Theo quy tắc “{request.scoring_policy}” do ứng dụng cung cấp, tổng mức trừ là {total:g} điểm trước khi áp dụng điểm sàn.']
            lines += [f"- {r['observation_id']}: {r['name_vi']} → trừ {r['points']:g} điểm." for r in ledger]
            lines.append('Mỗi nhãn lỗi được tính một lần trên mỗi đơn vị quan sát độc lập. Đây là quy tắc của phần mềm, chưa phải thang điểm được kiểm định chuyên môn.')
            unmatched=[h for h in habits if (h['exercise_code'],h['label_key']) not in rule_map]
            if unmatched:lines.append('Một số lỗi chưa có mức trừ trong bảng quy tắc; chúng không được tự gán điểm.')
    elif request.task=='summary':
        usable=sum(u['usable'] for u in units)
        from .text import normalize
        match=re.search(r'\b(mot|hai|ba|bon|[1-9])\s+(?:diem|y)\b',normalize(request.message))
        summary_limit=({'mot':1,'hai':2,'ba':3,'bon':4}.get(match.group(1)) or int(match.group(1))) if match else None
        selected_habits=habits
        if summary_limit:
            selected_habits=[];seen_exercises=set()
            for h in habits:
                if h['exercise_code'] not in seen_exercises:
                    selected_habits.append(h);seen_exercises.add(h['exercise_code'])
            selected_habits=(selected_habits+[h for h in habits if h not in selected_habits])[:summary_limit]
        lines=[f'Buổi này có {len(units)} đơn vị quan sát độc lập; {usable} đơn vị đủ dữ liệu để giải thích nhãn.']
        summary_names={'SQUAT':'Squat','PUSHUP':'Chống đẩy','JUMPING_JACK':'Jumping jack','REVERSE_CRUNCH':'Gập bụng ngược'}
        if habits:lines.append('Điểm bạn nên xem lại là: '+ '; '.join(f"{summary_names[h['exercise_code']]}: {h['name_vi']} ({h['observed_units']} đơn vị)" for h in selected_habits)+'.')
        else:lines.append('Chưa có nhãn lỗi được hỗ trợ vượt ngưỡng; điều này chưa đủ để khẳng định mọi động tác đều đúng.')
        lines.append('Tôi chưa có dữ liệu đầy đủ để kết luận tổng số lần lặp, thời lượng tập thực hay mức tiến bộ so với buổi trước. Một video không tương đương một lần lặp.')
    elif request.task=='practice':
        repeated=[h for h in habits if h['observed_units']>=2]
        lines=['Tôi ưu tiên các lỗi lặp lại trong những lần quan sát độc lập: '+', '.join(h['name_vi'] for h in repeated)+'.' if repeated else
               'Chưa đủ nhiều lần quan sát độc lập để gọi đây là thói quen. Bạn có thể tập lại kỹ thuật theo các gợi ý có nguồn bên dưới và quay một video mới để đối chiếu.']
        lines.append('Đây là gợi ý luyện lại kỹ thuật của chính bài đang tập. KB chưa có phác đồ bài bổ trợ theo nguyên nhân, số hiệp hoặc số lần cá nhân hóa; tôi chưa tự kê những phần đó.')
        exercise_names={'SQUAT':'Squat','PUSHUP':'Chống đẩy','JUMPING_JACK':'Jumping jack','REVERSE_CRUNCH':'Gập bụng ngược'}
        for h in (repeated or habits)[:4]:
            supported=[claims[cid] for cid in criterion_map[(h['exercise_code'],h['label_key'])] if cid in claims]
            if supported:
                c=supported[0]
                practice.append({'exercise_code':h['exercise_code'],'activity':'Tập lại '+exercise_names[h['exercise_code']],
                    'focus_label':h['label_key'],'observed_units':h['observed_units'],'cue':c['text_vi'],'criterion_id':c['id'],'citations':c['chunk_ids'][:1]})
        for p in practice:lines.append('- '+p['activity']+': '+p['cue']+' '+ ' '.join('['+cid+']' for cid in p['citations']))
    if units:
        shown=list(claims.values());shown_exercises=set()
        if request.task=='score':
            relevant={cid for r in ledger for cid in r['criterion_ids']}
            shown=[c for c in shown if c['id'] in relevant] if request.rules else []
        if request.task=='summary':
            shown=[]
            for c in claims.values():
                if c['exercise_code'] not in shown_exercises:shown.append(c);shown_exercises.add(c['exercise_code'])
            if summary_limit:shown=[]
        if request.task=='practice':shown=[]
        if shown:lines.append('\nBạn có thể đối chiếu các tiêu chí sau khi xem lại video:')
        citations=[]
        for c in shown:
            refs=c['chunk_ids'][:1]
            lines.append('- '+c['text_vi']+' '+ ' '.join('['+r+']' for r in refs))
            citations.extend(refs)
        for p in practice:citations.extend(p['citations'])
        if (not claims and request.task!='score') or (request.task=='practice' and not practice):lines.append('Các nhãn hiện có chưa nối tới tiêu chí sửa lỗi đủ căn cứ trong KB.')
        if any(u['simulated'] for u in units):lines.insert(0,'Có dữ liệu giả lập trong ví dụ này; không xem đó là kết quả buổi tập thật.')
    if duplicates:warnings.append(f'Đã bỏ qua {duplicates} bản ghi trùng nguồn/phạm vi khi tổng hợp.')
    cites=list(dict.fromkeys(citations))
    from .engine import with_attribution
    reply=with_attribution('\n'.join(lines),[Evidence(**e) for e in evidence.values()],cites)
    return {'reply':reply,'status':'grounded_guidance' if any(u['usable'] for u in units) else 'insufficient_observation','task':request.task,
        'generation_used':any(r['generation_used'] for r in responses),'generation_mode':'claim_selection' if any(r['generation_used'] for r in responses) else 'none',
        'citations':cites,'evidence':list(evidence.values()),'graph_claims':list(claims.values()),'warnings':list(dict.fromkeys(warnings)),
        'kb_version':snap['version'],'session':{'units':units,'errors':habits,'penalty_ledger':ledger,
        'penalty_total':sum(r['points'] for r in ledger) if request.rules else None,'scoring_policy':request.scoring_policy,'practice_suggestions':practice},
        'support_level':'technique_rehearsal_only' if request.task=='practice' else 'explicit_records_only',
        'retrieval':{'observations':retrievals,'graph_backends':list(dict.fromkeys(r['graph_backend'] for r in retrievals if 'graph_backend' in r))},
        'model_version':engine.settings.chat_model if any(r['generation_used'] for r in responses) else 'none'}
