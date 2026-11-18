"""Read-only graph/version consistency check for final test citations."""
import json,argparse
from pathlib import Path
from kb_service.config import Settings
from kb_service.graph import connection
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--out-dir',default='artifacts/manual_suite_20261107');args=parser.parse_args()
OUT=ROOT/args.out_dir
rows=json.loads((OUT/'final_results.json').read_text(encoding='utf-8'))
versions={r['output']['kb_version'] for r in rows}
assert len(versions)==1
version=next(iter(versions));ids=sorted({cid for r in rows for cid in r['output'].get('citations',[])})
query='''MATCH (c:SmartGymKB:Chunk) WHERE c.kb_version=$version AND c.node_id IN $ids
RETURN c.node_id AS chunk_id, c.source_id AS source_id, c.pdf_page AS pdf_page'''
with connection() as driver:
    driver.verify_connectivity()
    with driver.session() as s:
        found=[dict(r) for r in s.run(query,version=version,ids=ids)]
        nodes=s.run('MATCH (n:SmartGymKB) WHERE n.kb_version=$version RETURN count(n) AS n',version=version).single()['n']
        assert {r['chunk_id'] for r in found}==set(ids)
        report={'passed':True,'kb_version':version,'kb_nodes':nodes,'unique_cited_chunks':len(ids),'query':query,'matched':found,
                'read_only':True,'new_conversation_traces_imported':False,
                'limit':'Matching IDs proves graph consistency, not entailment of every answer claim.'}
(OUT/'graph_verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k not in ['matched','query']},ensure_ascii=False,indent=2))
