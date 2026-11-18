"""Execute every report query read-only, preserving actual returned tables/paths."""
import json
import re
from kb_service.config import ROOT
from kb_service.graph import connection

OUT=ROOT.parents[2]/'CHUONG_4_BAO_CAO'


def main():
    text=(OUT/'NEO4J_TRINH_DIEN.cypher').read_text(encoding='utf-8')
    raw='\n'.join(x for x in text.splitlines() if not x.lstrip().startswith('//'))
    queries=[x.strip() for x in raw.split(';') if x.strip()]
    assert len(queries)==12
    results=[]
    with connection() as driver:
        with driver.session() as db:
            for i,q in enumerate(queries,1):
                assert not re.search(r'\b(DELETE|SET|MERGE|CREATE|DROP|REMOVE)\b',q,re.I)
                rows=db.run(q).data()
                assert rows, (i,q)
                results.append({'query_id':'Q'+str(i),'query':q,'row_count':len(rows),'rows':rows if i not in [3,5,6,9] else None,'path_query':i in [3,5,6,9]})
                print('Q'+str(i),len(rows),'rows')
    assert sum(x['nodes'] for x in results[0]['rows'])==311
    assert sum(x['edges'] for x in results[1]['rows'])==380
    assert results[7]['rows'][0]['file_page']==426
    (OUT/'evidence/query_verification.json').write_text(json.dumps({'passed':True,'queries':results},ensure_ascii=False,indent=2),encoding='utf-8')


if __name__=='__main__':main()
