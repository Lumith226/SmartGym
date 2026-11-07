"""Validated boundary between deployed V4 annotations and source-backed knowledge."""
from collections import Counter
import math
from .models import ChatRequest, ModelChatRequest, Observation

def adapt_model_request(request: ModelChatRequest, snapshot: dict) -> ChatRequest:
    catalog=snapshot.get('label_catalog')
    if not catalog:raise ValueError('No V4 label catalog in this KB snapshot')
    result=request.model_result
    matches=[(code,spec) for code,spec in catalog['exercises'].items() if spec['model_exercise']==result.get('exercise')]
    if len(matches)!=1:raise ValueError('Unknown V4 exercise identifier')
    exercise,spec=matches[0]
    if result.get('schema_version')!=spec['schema_version']:raise ValueError('V4 preprocessing/label schema does not match deployed catalog')
    provenance=result.get('model_provenance',{})
    if not isinstance(provenance,dict):raise ValueError('Invalid model provenance')
    if provenance.get('model_sha256') and provenance['model_sha256']!=spec['model_sha256']:
        raise ValueError('Model weight hash differs from the registered V4 model')
    scope=result.get('scope')
    if scope not in ('video','window','rep'):raise ValueError('Unknown model observation scope')
    rows=result.get('label_results')
    if not isinstance(rows,list) or len(rows)!=len(spec['labels']):raise ValueError('Expected the complete V4 label table')
    by_key={label['key']:label for label in spec['labels']}
    seen=set();active=[]
    quality=result.get('quality')
    if not isinstance(quality,dict) or type(quality.get('usable')) is not bool:raise ValueError('Model observation quality must be explicit')
    insufficient=result.get('status')=='insufficient_data' or quality['usable'] is False
    for row in rows:
        if not isinstance(row,dict):raise ValueError('Invalid V4 label row')
        key=row.get('key')
        if key not in by_key or key in seen:raise ValueError('Unknown or duplicate V4 label')
        seen.add(key);canonical=by_key[key]
        if row.get('kind')!=canonical['kind'] or row.get('raw_label')!=canonical['raw_label']:
            raise ValueError('V4 label meaning does not match its contract')
        probability=row.get('probability')
        supported=canonical['calibrated'] and (scope=='video' or canonical['rep_supported']) and not insufficient
        if probability is None:
            if supported:raise ValueError('A usable model observation is missing a label score')
            detected=False
        else:
            if type(probability) not in (int,float) or not math.isfinite(probability) or not 0<=probability<=1:
                raise ValueError('Invalid V4 label score')
            threshold=row.get('threshold')
            if threshold is not None and (type(threshold) not in (int,float) or abs(threshold-canonical['threshold'])>1e-6):
                raise ValueError('V4 threshold differs from its contract')
            detected=bool(probability>=canonical['threshold'] and supported)
        # Recompute activation from registered thresholds. Client summaries are not authoritative.
        if detected:active.append(key)
    if 'not_visible' in active:insufficient=True
    observation=Observation(exercise_code=exercise,labels=active,unit=scope,
        observation_status='insufficient' if insufficient else 'sufficient',simulated=request.simulated,
        model_version='ST-GCN++ V4',schema_version=spec['schema_version'],model_sha256=spec['model_sha256'])
    return ChatRequest(message=request.message,exercise_code=exercise,observation=observation,
                       generate=request.generate,top_k=request.top_k)

def explain_labels(observation: Observation, snapshot: dict) -> list[dict]:
    catalog=snapshot.get('label_catalog')
    if not catalog or not observation.schema_version:return []
    spec=catalog['exercises'][observation.exercise_code]
    if observation.schema_version!=spec['schema_version'] or observation.model_sha256!=spec['model_sha256']:
        raise ValueError('Observation does not match the registered V4 contract')
    by_key={x['key']:x for x in spec['labels']}
    rows=[]
    for key in observation.labels:
        if key not in by_key:raise ValueError('Unknown label in a V4 observation')
        label=by_key[key]
        if not label['calibrated'] or (observation.unit!='video' and not label['rep_supported']):
            raise ValueError('Label is not supported for this observation scope')
        rows.append({k:label[k] for k in ['key','raw_label','name_vi','kind','coverage','criterion_ids','note_vi']})
    return rows

def coverage_report(snapshot: dict) -> dict:
    catalog=snapshot.get('label_catalog')
    if not catalog:return {'available':False}
    rows=[]
    for exercise,spec in catalog['exercises'].items():
        errors=[x for x in spec['labels'] if x['kind']=='error']
        rows.append({'exercise_code':exercise,'labels':len(spec['labels']),'errors':len(errors),
                     'error_coverage':dict(Counter(x['coverage'] for x in errors)),
                     'kinds':dict(Counter(x['kind'] for x in spec['labels']))})
    return {'available':True,'kb_version':snapshot['version'],'total_labels':sum(x['labels'] for x in rows),
        'error_labels':sum(x['errors'] for x in rows),'exercises':rows,
        'scope':'Developer-assigned links to source-anchored criteria; partial is not full coverage; professional review pending.',
        'rows':[{'exercise_code':e,**l} for e,spec in catalog['exercises'].items() for l in spec['labels']]}
