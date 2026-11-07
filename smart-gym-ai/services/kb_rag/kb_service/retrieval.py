from collections import Counter, defaultdict
import math
import os
from pathlib import Path
from .config import Settings
from .ingest import read_json
from .models import QueryRequest, Evidence
from .providers import OllamaEmbedder, ProviderError
from .text import tokens, expand_query, detect_exercises, EXERCISES, normalize, fitness_intent
from .v4 import explain_labels

LABEL_TERMS = {
    'BACK_ROUNDING':'back spine torso lung', 'KNEE_VALGUS':'knees alignment goi',
    'KNEE_ALIGNMENT':'knees alignment goi', 'SHALLOW_DEPTH':'depth lower thighs parallel nong',
    'HIP_ALIGNMENT':'hips sag hike torso hong', 'HIP_TOO_HIGH':'hips hike upwards hong cao',
    'HIP_SAG':'back sag rigid torso vong lung', 'HAND_PLACEMENT':'hands shoulder width tay',
    'NOT_RAISING_HIPS':'raise hips pelvis rib cage nang hong', 'SHALLOW_RANGE':'knees hips range',
    'ARMS_INCOMPLETE':'arms overhead tay', 'LEGS_TOO_NARROW':'legs apart chan',
    'NOT_JUMPING':'jump legs apart',
}

class Retriever:
    def __init__(self, settings: Settings):
        self.settings=settings
        self.snapshot=read_json(settings.index_dir/'snapshot.json')
        self.chunks=self.snapshot['chunks']
        self.by_id={c['chunk_id']:c for c in self.chunks}
        self.documents={c['chunk_id']:Counter(tokens(c['title']+' '+(c.get('section') or '')+' '+c['text'])) for c in self.chunks}
        self.df=Counter(t for counts in self.documents.values() for t in counts)
        self.avg_length=sum(sum(x.values()) for x in self.documents.values())/max(1,len(self.documents))
        self.embeddings=None
        self.dense_status='not_indexed'
        path=settings.index_dir/'embeddings.json'
        if path.exists():
            v=read_json(path)
            if v.get('kb_version')==self.snapshot['version'] and v.get('model')==settings.embed_model and set(v.get('vectors',{}))==set(self.by_id):
                self.embeddings=v['vectors'];self.dense_status='ready'
            else: self.dense_status='stale_or_different_model'

    def search(self, request: QueryRequest, mode: str | None=None, semantic_scope: bool=False):
        mode=mode or self.settings.retrieval_mode
        if mode not in ['lexical','graph','hybrid']: raise ValueError('Unknown retrieval mode')
        obs=request.observation
        if request.exercise_code and obs and request.exercise_code!=obs.exercise_code:
            raise ValueError('exercise_code conflicts with observation')
        detected=detect_exercises(request.message)
        exercise=request.exercise_code or (obs.exercise_code if obs else None)
        if not exercise and len(detected)==1: exercise=detected[0]
        labels=obs.labels if obs else []
        v4_rows=explain_labels(obs,self.snapshot) if obs and obs.schema_version else []
        v4_criteria={cid for row in v4_rows for cid in row['criterion_ids']}
        if not semantic_scope and not fitness_intent(request.message,labels):
            return [], [], {'mode':mode,'dense_status':self.dense_status,'exercise_code':exercise,'reason':'out_of_scope','channels_used':[]}
        query=expand_query(request.message)+' '+' '.join(LABEL_TERMS.get(label.upper(),'') for label in labels)
        if v4_rows:query+=' '+' '.join(row['name_vi']+' '+row['raw_label'] for row in v4_rows)
        qt=set(tokens(query))
        if exercise: query += ' '+ ' '.join(EXERCISES[exercise][:2])
        # Prevent an exercise-only context from turning an unrelated question into a supported answer.
        topic_tokens=set(tokens(expand_query(request.message)))
        lexical_overlap=any(topic_tokens.intersection(counts) for counts in self.documents.values())
        if not semantic_scope and not lexical_overlap and not v4_rows and not any(label.upper() in LABEL_TERMS for label in labels):
            return [], [], {'mode':mode,'dense_status':self.dense_status,'exercise_code':exercise,'reason':'no_query_vocabulary_overlap','channels_used':[]}
        eligible=[c for c in self.chunks if not exercise or exercise in c['exercise_codes'] or not c['exercise_codes']]
        n=len(self.documents)
        lexical=[]
        for c in eligible:
            counts=self.documents[c['chunk_id']];length=sum(counts.values());score=0
            for t in qt:
                freq=counts.get(t,0)
                if freq:
                    idf=math.log(1+(n-self.df[t]+0.5)/(self.df[t]+0.5))
                    score += idf*freq*2.5/(freq+1.5*(0.25+0.75*length/self.avg_length))
            if score>0: lexical.append((c['chunk_id'],score))
        lexical.sort(key=lambda x:(-x[1],x[0]))
        graph_claims=[];graph_scores=defaultdict(float)
        graph_backend='local_snapshot'
        supports=None
        if mode!='lexical' and exercise and os.getenv('KB_GRAPH_BACKEND','local')=='neo4j':
            try:
                from .graph import claim_support
                supports=claim_support(self.snapshot['version'],exercise)
                graph_backend='neo4j'
            except ProviderError:
                graph_backend='neo4j_unavailable_local_snapshot_fallback'
        # This graph currently models exercise-specific form criteria, not
        # generic anatomical concepts. Broad anatomy questions use text/vector
        # evidence instead of forcing unrelated exercise criteria into context.
        for claim in (self.snapshot['claims'] if exercise else []):
            if obs and obs.schema_version and claim['id'] not in v4_criteria:continue
            if supports is not None:
                if claim['id'] not in supports: continue
                claim={**claim,'chunk_ids':[cid for cid in claim['chunk_ids'] if cid in supports[claim['id']]]}
            if exercise and claim['exercise_code']!=exercise: continue
            shared=len(qt.intersection(tokens(claim['text_vi']+' '+claim['anchor'])))
            label_shared=set(x.upper() for x in labels).intersection(claim.get('labels',[]))
            if shared or label_shared or claim['id'] in v4_criteria or (semantic_scope and exercise):
                score=shared+4*len(label_shared)+(8 if claim['id'] in v4_criteria else 0)+0.1
                graph_claims.append({**claim,'retrieval_score':score})
                for cid in claim['chunk_ids']: graph_scores[cid]+=score
        graph_claims.sort(key=lambda x:(-x['retrieval_score'],x['id']))
        graph=sorted(graph_scores.items(), key=lambda x:(-x[1],x[0]))
        dense=[];dense_status=self.dense_status
        if mode=='hybrid' and self.embeddings:
            try:
                vector=OllamaEmbedder(self.settings).embed([query],query=True)[0]
                if any(len(v)!=len(vector) for v in self.embeddings.values()): raise ProviderError('Embedding dimension mismatch')
                dense=[(c['chunk_id'],sum(a*b for a,b in zip(vector,self.embeddings[c['chunk_id']]))) for c in eligible]
                dense=sorted((x for x in dense if x[1]>0),key=lambda x:(-x[1],x[0]))
            except ProviderError: dense_status='unavailable_fallback_to_lexical_and_graph'
        lists={'lexical':lexical} if mode=='lexical' else {'graph':graph} if mode=='graph' else {'lexical':lexical,'graph':graph,'dense':dense}
        scores=defaultdict(float);channels=defaultdict(list)
        for channel,ranked in lists.items():
            for rank,(cid,_) in enumerate(ranked[:30],1):
                scores[cid]+=1/(60+rank)
                channels[cid].append(channel)
        selected=sorted(scores,key=lambda cid:(-scores[cid],cid))[:request.top_k]
        evidence=[Evidence(**{k:v for k,v in self.by_id[cid].items() if k!='exercise_codes'},score=round(scores[cid],6),channels=channels[cid]) for cid in selected]
        selected_set=set(selected)
        # Only pass claims supported by evidence actually supplied to the generator.
        graph_claims=[{**c,'chunk_ids':[cid for cid in c['chunk_ids'] if cid in selected_set]} for c in graph_claims if selected_set.intersection(c['chunk_ids'])]
        trace={'mode':mode,'dense_status':dense_status,'exercise_code':exercise,'expanded_query':query,
            'graph_backend':graph_backend,
            'channels_used':[name for name,lst in lists.items() if lst], 'fusion':'reciprocal_rank_fusion_k60',
            'label_mapping':'verified_v4_contract' if obs and obs.schema_version else 'provisional; confirm exact DL label identifiers before integration'}
        return evidence,graph_claims,trace
