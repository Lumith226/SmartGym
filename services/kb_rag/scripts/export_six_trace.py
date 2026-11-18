"""Reproduce recorded live HTTP input/output in a separate Neo4j trace suite.

This imports saved replies; it does not run an LLM or prove vision accuracy.
KB reconstruction remains a separate Cypher file. No DELETE or KB mutations.
"""
from pathlib import Path
from datetime import datetime,timezone
import argparse,json,hashlib,re,sys

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from kb_service.graph import connection
from kb_service.config import Settings
Settings.from_env()  # Load the local connection settings without exporting them.

p=argparse.ArgumentParser();p.add_argument('--run',type=Path,required=True);p.add_argument('--apply',action='store_true');args=p.parse_args()
run=args.run.resolve();summary=json.loads((run/'summary.json').read_text(encoding='utf-8'))
rows=json.loads((run/'results.json').read_text(encoding='utf-8'))
review_file=json.loads((run/'development_reviews.json').read_text(encoding='utf-8'))
assert not review_file['pending_ids'],'Read the full run before publishing its trace gallery.'
reviews=review_file['reviews']
assert summary['same_runtime'] and len(rows)==119
version=summary['health_before']['kb_version'];revision=summary['health_before']['runtime_revision']
suite='smartgym-six-'+summary['run_id']+'-'+revision
ids=['SQUAT_K04','PUSHUP_K08','JUMPING_JACK_K02','REVERSE_CRUNCH_K02','HIGH_KNEES_K01','BUTT_KICKERS_K04',
     'SQUAT_SCORE_OBS','SQUAT_SUMMARY_OBS','SQUAT_PRACTICE_OBS']
chosen=[next(r for r in rows if r['case']['id']==identity) for identity in ids]
dest=ROOT/'artifacts/six_exercises_20261117/releases'/version/'neo4j_trace'/run.name
dest.mkdir(parents=True,exist_ok=True)
commands=[('CREATE CONSTRAINT smartgym_trace IF NOT EXISTS FOR (n:SmartGymTrace) REQUIRE n.key IS UNIQUE',{})]
expected=[]
for row in chosen:
    assert row['http_status']==200 and row['output']['kb_version']==version
    identity=row['case']['id'];body=row['input'];output=row['output']
    qkey=suite+':request:'+identity;akey=suite+':answer:'+identity
    evidence=sorted({e['chunk_id'] for e in output.get('evidence',[])})
    citations=sorted(set(output.get('citations',[])))
    assert set(citations).issubset(evidence)
    common={'suite':suite,'case':identity,'kb_version':version,'runtime_revision':revision,
            'original_http_run':summary['run_id'],'original_origin':row['origin'],
            'evidence_origin':'replay_import_of_recorded_live_http',
            'synthetic_model_records':bool(body.get('records')),
            'development_verdict':reviews[identity]['verdict'],'development_review_note':reviews[identity]['note'],
            'model':summary['health_before'].get('llm_model','')}
    qprops={**common,'message':body['message'],'task':body['task'],
            'input_json':json.dumps(body,ensure_ascii=False,sort_keys=True)}
    aprops={**common,'reply':output['reply'],'status':output['status'],
            'output_json':json.dumps(output,ensure_ascii=False,sort_keys=True)}
    commands +=[('MERGE (q:SmartGymTrace:ChatInput {key:$key}) SET q += $props',{'key':qkey,'props':qprops}),
                ('MERGE (a:SmartGymTrace:ChatOutput {key:$key}) SET a += $props',{'key':akey,'props':aprops}),
                ('MATCH (q:SmartGymTrace {key:$q}),(a:SmartGymTrace {key:$a}) MERGE (q)-[:PRODUCED]->(a)',{'q':qkey,'a':akey})]
    for cid in evidence:
        commands.append(('MATCH (q:SmartGymTrace {key:$q}),(c:SmartGymKB:Chunk {key:$c}) MERGE (q)-[:RETRIEVED]->(c)',{'q':qkey,'c':version+':'+cid}))
    for cid in citations:
        commands.append(('MATCH (a:SmartGymTrace {key:$a}),(c:SmartGymKB:Chunk {key:$c}) MERGE (a)-[:CITES]->(c)',{'a':akey,'c':version+':'+cid}))
    expected.append({'case':identity,'qkey':qkey,'akey':akey,'evidence':evidence,'citations':citations,
                     'input':body,'output':output,'synthetic_model_records':bool(body.get('records'))})

def literal(value):
    if isinstance(value,dict):return '{'+','.join(k+':'+literal(v) for k,v in value.items())+'}'
    return json.dumps(value,ensure_ascii=False,allow_nan=False)
lines=['// Trace-only replay of recorded live HTTP; original model observations in OBS cases are synthetic.',
       '// No KB reconstruction here. No DELETE. Read metadata before interpreting as running evidence.']
for query,params in commands:
    lines.append(re.sub(r'\$([a-z_]+)',lambda m:literal(params[m.group(1)]),query)+';')
cypher=dest/'recorded_http_traces.cypher';cypher.write_text('\n'.join(lines),encoding='utf-8')
graph_query=f"MATCH (q:SmartGymTrace:ChatInput {{suite:'{suite}',case:'SQUAT_K04'}})-[p:PRODUCED]->(a) OPTIONAL MATCH (q)-[r:RETRIEVED]->(c) OPTIONAL MATCH (a)-[s:CITES]->(d) RETURN q,p,a,r,c,s,d;"
table_query=f"MATCH (q:SmartGymTrace:ChatInput {{suite:'{suite}'}})-[:PRODUCED]->(a) RETURN q.case AS case_id,q.message AS input,a.reply AS output,q.synthetic_model_records AS synthetic_model_records,q.evidence_origin AS origin,a.runtime_revision AS runtime,q.input_json AS input_json,a.output_json AS output_json ORDER BY case_id;"
(dest/'SHOW_GRAPH.cypher').write_text(graph_query+'\n',encoding='utf-8')
(dest/'SHOW_INPUT_OUTPUT_TABLE.cypher').write_text(table_query+'\n',encoding='utf-8')
verified=[]
if args.apply:
    with connection() as driver:
        with driver.session() as session:
            # Preflight every target; MATCH must not silently skip missing chunks.
            keys={version+':'+cid for e in expected for cid in e['evidence']}
            present={r['key'] for r in session.run('MATCH (c:SmartGymKB:Chunk) WHERE c.key IN $keys RETURN c.key AS key',keys=sorted(keys))}
            assert present==keys
            for attempt in [1,2]:
                for query,params in commands:session.run(query,params).consume()
                for e in expected:
                    result=session.run('MATCH (q:SmartGymTrace {key:$q})-[:PRODUCED]->(a:SmartGymTrace {key:$a}) RETURN q.input_json AS input,a.output_json AS output,a.reply AS reply,q.synthetic_model_records AS simulated',q=e['qkey'],a=e['akey']).single(strict=True)
                    assert json.loads(result['input'])==e['input'] and json.loads(result['output'])==e['output']
                    assert result['reply']==e['output']['reply'] and result['simulated']==e['synthetic_model_records']
                    for key,relation,wanted in [('qkey','RETRIEVED',e['evidence']),('akey','CITES',e['citations'])]:
                        actual=[r['id'] for r in session.run(f'MATCH (n:SmartGymTrace {{key:$key}})-[:{relation}]->(c:SmartGymKB:Chunk) RETURN c.chunk_id AS id',key=e[key])]
                        assert sorted(actual)==wanted
                count=session.run('MATCH (n:SmartGymTrace {suite:$suite}) RETURN count(n) AS n',suite=suite).single()['n']
                assert count==18
                verified.append({'attempt':attempt,'trace_nodes':count,'cases':len(expected),'all_input_output_properties_and_edge_targets_match':True})
report={'suite':suite,'kb_version':version,'runtime_revision':revision,'original_http_run':summary['run_id'],
        'exported_at':datetime.now(timezone.utc).isoformat(),'trace_cases':len(expected),'selected_ids':ids,
        'replayed_saved_http_not_new_inference':True,'kb_reconstruction_file_separate':True,
        'synthetic_model_cases':[e['case'] for e in expected if e['synthetic_model_records']],
        'retrieved_from':'output.evidence','cites_from':'output.citations','neo4j_applied':args.apply,
        'roundtrips':verified,'cypher_sha256':hashlib.sha256(cypher.read_bytes()).hexdigest()}
(dest/'trace_verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
