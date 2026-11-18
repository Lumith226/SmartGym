"""Reuse prior human-readable judgments only for identical published evidence."""
from pathlib import Path
import argparse,json

p=argparse.ArgumentParser();p.add_argument('--previous',required=True,type=Path);p.add_argument('--current',required=True,type=Path);a=p.parse_args()
previous=json.loads((a.previous/'results.json').read_text(encoding='utf-8'))
current=json.loads((a.current/'results.json').read_text(encoding='utf-8'))
old_health=json.loads((a.previous/'health_before.json').read_text(encoding='utf-8'))
new_health=json.loads((a.current/'health_before.json').read_text(encoding='utf-8'))
assert old_health['kb_version']==new_health['kb_version'],'Do not reuse source judgments across KB versions'
old_reviews=json.loads((a.previous/'development_reviews.json').read_text(encoding='utf-8'))['reviews']
old_by_id={r['case']['id']:r for r in previous}
def key(row):
 o=row.get('output',{})
 return json.dumps({'input':row['input'],'status':o.get('status'),'reply':o.get('reply'),
                    'citations':o.get('citations'), 'support_quotes':o.get('retrieval',{}).get('support_quotes',[])},
                   ensure_ascii=False,sort_keys=True)
reviews={};pending=[]
for row in current:
 identity=row['case']['id'];old=old_by_id.get(identity)
 if old and identity in old_reviews and key(old)==key(row):
  reviews[identity]={**old_reviews[identity],'review_origin':'reused_for_identical_input_status_reply_citations_support_quotes',
                     'previous_review_run':a.previous.name}
 else:pending.append(identity)
out={'reviewer':'Codex development review; identical-output reuse is explicit, not a fresh or independent expert review.',
     'reviews':reviews,'pending_ids':pending}
path=a.current/'development_reviews.json'
if path.exists():raise FileExistsError('Do not overwrite an existing review; inspect it first')
path.write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'reused':len(reviews),'pending':len(pending),'pending_ids':pending},ensure_ascii=False))
