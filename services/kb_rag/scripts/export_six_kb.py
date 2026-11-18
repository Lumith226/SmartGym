"""Export standalone, reconstructible Cypher; optionally import twice and verify."""
from pathlib import Path
import argparse,hashlib,json,sys
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from kb_service.config import Settings
from kb_service.graph import NODE_TYPES,REL_TYPES,connection

def literal(value):
    if isinstance(value,dict):return '{'+','.join('`'+k.replace('`','``')+'`:'+literal(v) for k,v in value.items())+'}'
    if isinstance(value,list):return '['+','.join(literal(x) for x in value)+']'
    return json.dumps(value,ensure_ascii=False)

def properties(snapshot,node):
    props={**node,'node_id':node['id'],'kb_version':snapshot['version']}
    kind=node['type'];identity=node['id']
    if kind=='Chunk':props.update(next(c for c in snapshot['chunks'] if c['chunk_id']==identity))
    if kind=='Source':
        source=next(s for s in snapshot['sources'] if s['id']==identity)
        props.update({k:v for k,v in source.items() if k in ['title','publisher','url','file','sha256','license','attribution','source_role','publication_year','review_scope']})
        # Neo4j properties cannot contain nested maps. Keep the complete
        # extraction/source manifest losslessly as JSON alongside queryable
        # fields, including page ranges, selectors and attribution metadata.
        props['source_metadata_json']=json.dumps(source,ensure_ascii=False,sort_keys=True)
    if kind=='Exercise':
        spec=snapshot.get('label_catalog',{}).get('exercises',{}).get(identity)
        if spec:props['model_contract_metadata_json']=json.dumps({k:v for k,v in spec.items() if k!='labels'},ensure_ascii=False,sort_keys=True)
    if kind=='TechniqueCriterion':props.update(next(c for c in snapshot['claims'] if c['id']==identity))
    if kind=='ModelLabel':
        spec=snapshot['label_catalog']['exercises'][node['exercise_code']]
        props.update(next(l for l in spec['labels'] if l['key']==node['label_key']))
        props['schema_version']=spec['schema_version']
    props['key']=snapshot['version']+':'+identity
    return {k:v for k,v in props.items() if v is not None}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--apply',action='store_true');args=parser.parse_args()
    settings=Settings.from_env();snapshot=json.loads((settings.index_dir/'snapshot.json').read_text(encoding='utf-8'))
    out=ROOT/'artifacts/six_exercises_20261117/releases'/snapshot['version'];out.mkdir(parents=True,exist_ok=True)
    version=snapshot['version'];commands=[];expected={}
    constraint='CREATE CONSTRAINT smartgym_key IF NOT EXISTS FOR (n:SmartGymKB) REQUIRE n.key IS UNIQUE'
    for node in snapshot['graph']['nodes']:
        if node['type'] not in NODE_TYPES:raise ValueError('Unknown node type')
        props=properties(snapshot,node);expected[props['key']]=props
        commands.append(f"MERGE (n:SmartGymKB:{node['type']} {{key:{literal(props['key'])}}}) SET n += {literal(props)}")
    expected_edges=set()
    for edge in snapshot['graph']['edges']:
        rel=edge['type'];a=version+':'+edge['from'];b=version+':'+edge['to']
        if rel not in REL_TYPES:raise ValueError('Unknown edge type')
        expected_edges.add((a,rel,b))
        commands.append(f'MATCH (a:SmartGymKB {{key:{literal(a)}}}),(b:SmartGymKB {{key:{literal(b)}}}) MERGE (a)-[:{rel}]->(b)')
    cypher=out/'smartgym_six_kb.cypher'
    cypher.write_text('// Standalone KB only, no dialogue traces or DELETE. Version '+version+'\n'+constraint+';\n'+';\n'.join(commands)+';\n',encoding='utf-8')
    manifest={'kb_version':version,'nodes':len(expected),'edges':len(expected_edges),'sources':len(snapshot['sources']),
              'chunks':len(snapshot['chunks']),'criteria':len(snapshot['claims']),'model_labels':sum(len(x['labels']) for x in snapshot['label_catalog']['exercises'].values()),
              'cypher_sha256':hashlib.sha256(cypher.read_bytes()).hexdigest(),'snapshot_sha256':hashlib.sha256((settings.index_dir/'snapshot.json').read_bytes()).hexdigest(),
              'contains_dialogue_trace':False,'import_verified':False}
    if args.apply:
        # Read actual exported file back; verification is not a substitute call
        # to a separate exporter or sync implementation.
        lines=[line.rstrip(';') for line in cypher.read_text(encoding='utf-8').splitlines() if line and not line.startswith('//')]
        with connection() as driver:
            driver.verify_connectivity()
            with driver.session() as session:
                before=[dict(r) for r in session.run('MATCH (n:SmartGymKB) WHERE n.kb_version<>$v RETURN n.kb_version AS version,count(n) AS nodes',v=version)]
                session.run(lines[0]).consume()
                for repeat in range(2):
                    def apply(tx):
                        for command in lines[1:]:tx.run(command).consume()
                    session.execute_write(apply)
                actual={r['key']:dict(r['props']) for r in session.run('MATCH (n:SmartGymKB {kb_version:$v}) RETURN n.key AS key, properties(n) AS props',v=version)}
                actual_edges={(r['a'],r['rel'],r['b']) for r in session.run('MATCH (a:SmartGymKB {kb_version:$v})-[r]->(b:SmartGymKB {kb_version:$v}) RETURN a.key AS a,type(r) AS rel,b.key AS b',v=version)}
                after=[dict(r) for r in session.run('MATCH (n:SmartGymKB) WHERE n.kb_version<>$v RETURN n.kb_version AS version,count(n) AS nodes',v=version)]
                result={'kb_version':version,'two_imports_completed':True,'exact_properties_match':actual==expected,
                        'exact_edge_triples_match':actual_edges==expected_edges,'previous_versions_preserved':sorted(before,key=lambda x:x['version'])==sorted(after,key=lambda x:x['version']),
                        'actual_nodes':len(actual),'actual_edges':len(actual_edges),'earlier_versions':before}
                (out/'neo4j_roundtrip.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
                if not all(result[k] for k in ['exact_properties_match','exact_edge_triples_match','previous_versions_preserved']):raise ValueError('Neo4j round-trip mismatch; inspect saved results')
                manifest['import_verified']=True
    (out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(manifest,ensure_ascii=False,indent=2),flush=True)

if __name__=='__main__':main()
