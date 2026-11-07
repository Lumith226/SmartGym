"""Build an auditable Chapter 4 evidence package from local artifacts and Neo4j.

Imports a separate trace suite with MERGE only. Saved HTTP responses are explicitly
identified as recorded traces, never as fresh LLM generations or KB facts.
"""
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json
import httpx
from kb_service.config import ROOT
from kb_service.graph import connection

WORKSPACE = ROOT.parents[2]
OUT = WORKSPACE / 'CHUONG_4_BAO_CAO'
SUITE = 'smartgym-chapter4-20261107'


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def main():
    OUT.mkdir(exist_ok=True)
    snap = json.loads((ROOT/'data/index/snapshot.json').read_text(encoding='utf-8'))
    rows = json.loads((ROOT/'artifacts/manual_suite_final_20261107/final_results.json').read_text(encoding='utf-8'))
    chosen = ['KT01', 'KT02', 'VD03', 'VD04_push_up', 'VD04_jump_jack', 'VD04_situp', 'DI02', 'BT02', 'BT04', 'TC02']
    cases = [dict(x, evidence_origin='recorded_actual_http_2026-11-07; imported_for_graph_display_now') for x in rows if x['case_id'] in chosen]
    health = httpx.get('http://127.0.0.1:8010/health', timeout=10).json()
    assert health['kb_version'] == snap['version']
    # Fresh live calls are separate from the original 44-case experiment.
    for name, question in [
        ('LIVE_KNOWLEDGE', 'Khi chống đẩy, tôi cần giữ thân mình thế nào?'),
        ('LIVE_PDF', 'Cơ chủ vận và cơ đối kháng khác nhau thế nào?'),
    ]:
        body = {'message':question, 'task':'knowledge', 'records':[], 'conversation':[], 'generate':True}
        start = datetime.now(timezone.utc)
        response = httpx.post('http://127.0.0.1:8010/v1/chatbot', json=body, timeout=240)
        response.raise_for_status()
        output = response.json()
        cases.append({'case_id':name,'input':body,'output':output,
                      'timestamp_utc':start.isoformat(), 'runtime_revision':health.get('runtime_revision'),
                      'seconds':(datetime.now(timezone.utc)-start).total_seconds(),
                      'evidence_origin':'fresh_actual_http_to_kb_service; no_video'})
        print(name, output['status'], output['generation_mode'], flush=True)
    save(OUT/'evidence/input_output.json', {'suite':SUITE,'cases':cases})
    source_manifest = []
    for s in snap['sources']:
        p = ROOT/'data/raw'/s['file']
        sha = digest(p)
        assert sha == s['sha256'], s['id']
        source_manifest.append(dict(s, actual_bytes=p.stat().st_size, actual_sha256=sha,
                                    local_path=str(p.relative_to(WORKSPACE))))
    chapter3 = WORKSPACE/'Chuong_3_Thuc_nghiem_va_Danh_gia_AI_SmartGym.docx'
    save(OUT/'evidence/source_manifest.json', source_manifest)
    save(OUT/'evidence/kb_snapshot_report.json', snap['report'])
    with connection() as driver:
        driver.verify_connectivity()
        with driver.session() as db:
            version = snap['version']
            node_rows = db.run('MATCH (n:SmartGymKB) WHERE n.kb_version=$v RETURN properties(n) AS properties, labels(n) AS labels ORDER BY n.node_id',v=version).data()
            edge_rows = db.run('MATCH (a:SmartGymKB)-[r]->(b:SmartGymKB) WHERE a.kb_version=$v AND b.kb_version=$v RETURN a.node_id AS source,type(r) AS relation,b.node_id AS target ORDER BY source,relation,target',v=version).data()
            assert {x['properties']['node_id'] for x in node_rows} == {x['id'] for x in snap['graph']['nodes']}
            assert {(x['source'],x['relation'],x['target']) for x in edge_rows} == {(x['from'],x['type'],x['to']) for x in snap['graph']['edges']}
            save(OUT/'evidence/neo4j_kb_export.json', {'kb_version':version, 'nodes':node_rows,'edges':edge_rows})
            db.run('CREATE CONSTRAINT smartgym_trace IF NOT EXISTS FOR (n:SmartGymTrace) REQUIRE n.key IS UNIQUE').consume()
            for case in cases:
                out, body = case['output'], case['input']
                assert out['kb_version'] == version
                key = SUITE + ':' + case['case_id']
                qprops = {'suite':SUITE,'case':case['case_id'],'message':body['message'],'task':body['task'],
                          'input_json':json.dumps(body,ensure_ascii=False),'kb_version':version,
                          'recorded_at_utc':case['timestamp_utc'],'evidence_origin':case['evidence_origin'],
                          'runtime_revision':case.get('runtime_revision',''), 'imported_at_utc':datetime.now(timezone.utc).isoformat()}
                aprops = {'suite':SUITE,'case':case['case_id'],'reply':out['reply'],'status':out['status'],
                          'output_json':json.dumps(out,ensure_ascii=False),'kb_version':version,
                          'generation_mode':out['generation_mode'],'model_version':out.get('model_version',''),
                          'graph_backend':out.get('retrieval',{}).get('graph_backend','not_used'),
                          'evidence_origin':case['evidence_origin']}
                db.run('MERGE (q:SmartGymTrace:ChatInput {key:$q}) SET q += $qp MERGE (a:SmartGymTrace:ChatOutput {key:$a}) SET a += $ap MERGE (q)-[:PRODUCED]->(a)',q=key+':in',a=key+':out',qp=qprops,ap=aprops).consume()
                for e in out.get('evidence',[]):
                    db.run('MATCH (q:SmartGymTrace {key:$q}),(c:SmartGymKB:Chunk {key:$c}) MERGE (q)-[:RETRIEVED]->(c)',q=key+':in',c=version+':'+e['chunk_id']).consume()
                for cid in out.get('citations',[]):
                    db.run('MATCH (a:SmartGymTrace {key:$a}),(c:SmartGymKB:Chunk {key:$c}) MERGE (a)-[:CITES]->(c)',a=key+':out',c=version+':'+cid).consume()
                for claim in out.get('graph_claims',[]):
                    db.run('MATCH (q:SmartGymTrace {key:$q}),(t:SmartGymKB:TechniqueCriterion {key:$t}) MERGE (q)-[:USED_CRITERION]->(t)',q=key+':in',t=version+':'+claim['id']).consume()
                for i, unit in enumerate(out.get('session',{}).get('observations',out.get('session',{}).get('units',[]))):
                    props = {k:v for k,v in unit.items() if v is not None and (isinstance(v,(str,int,float,bool)) or (isinstance(v,list) and all(isinstance(x,str) for x in v)))}
                    props['suite'] = SUITE
                    props['observation_json'] = json.dumps(unit,ensure_ascii=False)
                    okey = key+':observation:'+str(i)
                    db.run('MATCH (q:SmartGymTrace {key:$q}) MERGE (o:SmartGymTrace:Observation {key:$o}) SET o += $p MERGE (q)-[:HAS_OBSERVATION]->(o)',q=key+':in',o=okey,p=props).consume()
                    labels = unit.get('labels',unit.get('error_labels',[]))
                    for label in labels:
                        db.run('MATCH (o:SmartGymTrace {key:$o}),(l:SmartGymKB:ModelLabel {key:$l}) MERGE (o)-[:PREDICTS]->(l)',o=okey,l=version+':'+unit['exercise_code']+'.'+label).consume()
            trace_rows = db.run('MATCH (q:SmartGymTrace:ChatInput)-[:PRODUCED]->(a:ChatOutput) WHERE q.suite=$suite RETURN q.case AS case_id,q.message AS input,a.reply AS output,q.evidence_origin AS origin ORDER BY case_id',suite=SUITE).data()
            assert len(trace_rows)==len(cases)
            for c in cases:
                assert next(x for x in trace_rows if x['case_id']==c['case_id'])['output']==c['output']['reply']
            save(OUT/'evidence/neo4j_input_output_table.json',trace_rows)
    coverage = {}
    for code, spec in snap['label_catalog']['exercises'].items():
        errors = [x for x in spec['labels'] if x['kind']=='error']
        coverage[code] = {'total_labels':len(spec['labels']),'errors':len(errors), 'error_coverage':dict(Counter(x['coverage'] for x in errors))}
    verification = {'prepared_at_utc':datetime.now(timezone.utc).isoformat(),'kb_version':version,'health':health,
                    'neo4j_verified':True,'nodes':len(node_rows),'edges':len(edge_rows),
                    'node_types':dict(Counter(n['type'] for n in snap['graph']['nodes'])),
                    'edge_types':dict(Counter(e['type'] for e in snap['graph']['edges'])),
                    'trace_suite':SUITE,'trace_cases':len(cases),'trace_input_output_exact_match':True,
                    'source_files_sha256_match':True,'label_coverage':coverage,
                    'chapter3_file':chapter3.name,'chapter3_sha256':digest(chapter3),
                    'warning':'Saved runs imported as traces, not regenerated answers or scientific KB. Fresh calls separate from final 44-case test.'}
    save(OUT/'evidence/verification.json',verification)
    print(json.dumps(verification,ensure_ascii=False,indent=2))


if __name__ == '__main__':
    main()
