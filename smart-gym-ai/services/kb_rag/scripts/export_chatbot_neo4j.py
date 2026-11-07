"""Export actual chatbot IN/OUT + KB as an idempotent Neo4j Browser script.
Usage: python scripts/export_chatbot_neo4j.py [--apply]
No generated Cypher is executed unless --apply is explicitly supplied.
"""
from pathlib import Path
import argparse
import hashlib
import json
from kb_service.config import ROOT,Settings
from kb_service.graph import NODE_TYPES,REL_TYPES,connection

def literal(value):
    if isinstance(value,dict):return '{'+','.join(k+':'+literal(v) for k,v in value.items())+'}'
    return json.dumps(value,ensure_ascii=False,allow_nan=False)

def statements(snapshot, cases):
    version=snapshot['version'];chunks={c['chunk_id']:c for c in snapshot['chunks']};sources={s['id']:s for s in snapshot['sources']}
    yield 'CREATE CONSTRAINT smartgym_key IF NOT EXISTS FOR (n:SmartGymKB) REQUIRE n.key IS UNIQUE',{}
    yield 'CREATE CONSTRAINT smartgym_trace IF NOT EXISTS FOR (n:SmartGymTrace) REQUIRE n.key IS UNIQUE',{}
    for node in snapshot['graph']['nodes']:
        kind=node['type']
        if kind not in NODE_TYPES:raise ValueError(kind)
        props={k:v for k,v in node.items() if v is not None}
        if kind=='Source':props.update({k:v for k,v in sources[node['id']].items() if k in ['title','publisher','url','file','sha256','license','attribution'] and v is not None})
        if kind=='Chunk':props.update({k:v for k,v in chunks[node['id']].items() if v is not None})
        props.update(kb_version=version,node_id=node['id'])
        yield f'MERGE (n:SmartGymKB:{kind} {{key:$key}}) SET n += $props',{'key':version+':'+node['id'],'props':props}
    for edge in snapshot['graph']['edges']:
        if edge['type'] not in REL_TYPES:raise ValueError(edge['type'])
        yield f"MATCH (a:SmartGymKB {{key:$a}}),(b:SmartGymKB {{key:$b}}) MERGE (a)-[:{edge['type']}]->(b)",{'a':version+':'+edge['from'],'b':version+':'+edge['to']}
    for case in cases:
        body=case['input'];out=case['output']
        if out['kb_version']!=version:raise ValueError('Trace KB version differs from snapshot')
        identifier=hashlib.sha256(json.dumps({'input':body,'kb_version':version},sort_keys=True,ensure_ascii=False).encode()).hexdigest()[:20]
        prefix=case.get('suite','smartgym-chatbot-v1')+':' if case.get('suite','smartgym-chatbot-v1')!='smartgym-chatbot-v1' else ''
        qkey='request:'+prefix+identifier;akey='answer:'+prefix+identifier
        props={'case':case['case'],'suite':case.get('suite','smartgym-chatbot-v1'),'message':body['message'],'task':body['task'],'kb_version':version,
               'input_json':json.dumps(body,ensure_ascii=False),'replayed_model_records':bool(body.get('records'))}
        yield 'MERGE (q:SmartGymTrace:ChatInput {key:$key}) SET q += $props',{'key':qkey,'props':props}
        yield 'MERGE (a:SmartGymTrace:ChatOutput {key:$key}) SET a += $props',{'key':akey,'props':{
            'reply':out['reply'],'status':out['status'],'kb_version':version,'generation_mode':out['generation_mode'],
            'generation_used':out['generation_used'],'output_json':json.dumps(out,ensure_ascii=False)}}
        yield 'MATCH (q:SmartGymTrace {key:$q}),(a:SmartGymTrace {key:$a}) MERGE (q)-[:PRODUCED]->(a)',{'q':qkey,'a':akey}
        for cid in out['citations']:
            yield 'MATCH (q:SmartGymTrace {key:$q}),(a:SmartGymTrace {key:$a}),(c:SmartGymKB:Chunk {key:$c}) MERGE (q)-[:RETRIEVED]->(c) MERGE (a)-[:CITES]->(c)',{'q':qkey,'a':akey,'c':version+':'+cid}
        for criterion in out['graph_claims']:
            yield 'MATCH (q:SmartGymTrace {key:$q}),(t:SmartGymKB:TechniqueCriterion {key:$t}) MERGE (q)-[:USED_CRITERION]->(t)',{'q':qkey,'t':version+':'+criterion['id']}
        for i,unit in enumerate(out.get('session',{}).get('units',[])):
            okey=qkey+':observation:'+str(i)
            yield 'MERGE (o:SmartGymTrace:Observation {key:$key}) SET o += $props',{'key':okey,'props':unit}
            yield 'MATCH (q:SmartGymTrace {key:$q}),(o:SmartGymTrace {key:$o}) MERGE (q)-[:HAS_OBSERVATION]->(o)',{'q':qkey,'o':okey}
            for label in unit['error_labels']:
                yield 'MATCH (o:SmartGymTrace {key:$o}),(l:SmartGymKB:ModelLabel {key:$l}) MERGE (o)-[:PREDICTS]->(l)',{'o':okey,'l':version+':'+unit['exercise_code']+'.'+label}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--apply',action='store_true')
    parser.add_argument('--input',type=Path,help='Optional chatbot exported_in_out.json from the web UI')
    parser.add_argument('--suite',default='smartgym-chatbot-v1');args=parser.parse_args()
    snap=json.loads((Settings.from_env().index_dir/'snapshot.json').read_text(encoding='utf-8'))
    data=json.loads((args.input or ROOT/'artifacts/chatbot/live_cases.json').read_text(encoding='utf-8'))
    cases=data.get('cases') or [{'case':'web_turn_'+str(i+1),**turn} for i,turn in enumerate(data.get('turns',[]))]
    if not cases:raise ValueError('No input/output cases in JSON')
    # Keep the default reviewed demo suite separate from optional imported chats.
    if args.input and args.suite=='smartgym-chatbot-v1':args.suite='smartgym-chatbot-user'
    for case in cases:case['suite']=args.suite
    commands=list(statements(snap,cases));lines=['// Actual KB and chatbot HTTP traces. No DELETE. Idempotent MERGE.']
    import re
    for query,params in commands:
        lines.append(re.sub(r'\$([a-z_]+)',lambda m:literal(params[m.group(1)]),query)+';')
    destination=ROOT/('artifacts/chatbot/neo4j_import_user.cypher' if args.input else 'artifacts/chatbot/neo4j_import.cypher');destination.write_text('\n'.join(lines),encoding='utf-8')
    applied=False
    if args.apply:
        with connection() as driver:
            driver.verify_connectivity()
            with driver.session() as session:
                for query,params in commands:session.run(query,params).consume()
        applied=True
    report={'exported':str(destination),'statements':len(commands),'trace_cases':len(cases),'kb_version':snap['version'],'neo4j_applied':applied}
    (ROOT/('artifacts/chatbot/neo4j_export_status_user.json' if args.input else 'artifacts/chatbot/neo4j_export_status.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
