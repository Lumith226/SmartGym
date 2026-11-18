"""Read-only verification against the real Neo4j DB, not mocked graph objects."""
import json
from kb_service.config import ROOT,Settings
from kb_service.graph import connection,claim_support
out=ROOT/'artifacts/chatbot'
cases=json.loads((out/'live_cases.json').read_text(encoding='utf-8'))['cases']
version=cases[0]['output']['kb_version']
with connection() as driver:
    driver.verify_connectivity()
    with driver.session() as s:
        rows=s.run("MATCH (q:SmartGymTrace:ChatInput)-[:PRODUCED]->(a:ChatOutput) WHERE q.suite='smartgym-chatbot-v1' RETURN q.case AS example,q.message AS input,a.reply AS output,a.generation_mode AS generation_mode").data()
        assert len(rows)==len(cases),(len(rows),len(cases))
        by_name={r['example']:r for r in rows}
        for case in cases:assert by_name[case['case']]['output']==case['output']['reply']
        nodes=s.run('MATCH (n:SmartGymKB) WHERE n.kb_version=$v RETURN count(n) AS n',v=version).single()['n']
        paths=s.run("MATCH (q:SmartGymTrace:ChatInput)-[:HAS_OBSERVATION]->(o:Observation)-[:PREDICTS]->(l:SmartGymKB:ModelLabel)-[:RETRIEVES_CRITERION]->(t:TechniqueCriterion)-[:SUPPORTED_BY]->(c:Chunk)<-[:HAS_CHUNK]-(source:Source) WHERE q.suite='smartgym-chatbot-v1' RETURN q.case AS example,l.name_vi AS label,t.text_vi AS criterion,c.node_id AS chunk,source.url AS source LIMIT 20").data()
        book=s.run("MATCH (q:SmartGymTrace:ChatInput)-[:PRODUCED]->(a:ChatOutput)-[:CITES]->(c:SmartGymKB:Chunk)<-[:HAS_CHUNK]-(source:Source) WHERE q.suite='smartgym-chatbot-v1' AND c.pdf_page IS NOT NULL RETURN source.title AS book,c.pdf_page AS file_page,c.node_id AS chunk,source.file AS file,source.sha256 AS sha256").data()
        assert nodes==311;assert paths;assert book
support={e:len(claim_support(version,e)) for e in ['SQUAT','PUSHUP','JUMPING_JACK','REVERSE_CRUNCH']}
assert all(support.values())
report={'passed':True,'real_neo4j':True,'kb_version':version,'kb_nodes':nodes,'trace_cases':len(rows),
        'criterion_counts':support,'input_output_table':rows,'label_criterion_source_paths':paths,'book_citations':book}
(out/'neo4j_verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k not in ['input_output_table','label_criterion_source_paths','book_citations']},ensure_ascii=False,indent=2))
