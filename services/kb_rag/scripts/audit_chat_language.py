"""Flag review candidates; never convert a linguistic heuristic into accuracy."""
from pathlib import Path
import argparse,json,re
from difflib import SequenceMatcher

p=argparse.ArgumentParser();p.add_argument('run',type=Path);a=p.parse_args()
rows=json.loads((a.run/'results.json').read_text(encoding='utf-8'))
flags=[]
for row in rows:
    output=row.get('output',{});proofs=output.get('retrieval',{}).get('support_quotes',[])
    unique=list(dict.fromkeys(p['text'] for p in proofs));issues=[]
    for point in unique:
        supports=[p['quote'] for p in proofs if p['text']==point]
        norm=lambda s:re.sub(r'\s+',' ',s).strip().casefold()
        if any(len(point.split())>=8 and norm(point)==norm(quote) and re.search(r'\b(the|your|while|with|and)\b',point,re.I) for quote in supports):
            issues.append({'kind':'possible_english_quote_as_reply','text':point})
        if re.search(r'\bchỉ (?:cho phép|được|có thể)\b',point,re.I) and any(re.search(r'\b(?:can|may)\b',q,re.I) for q in supports):
            issues.append({'kind':'possible_exclusive_modality_added','text':point})
    for i,left in enumerate(unique):
        for right in unique[i+1:]:
            ratio=SequenceMatcher(None,left.casefold(),right.casefold()).ratio()
            if ratio>=.66:issues.append({'kind':'possible_repeated_idea','left':left,'right':right,'character_similarity':round(ratio,3)})
    if issues:flags.append({'case_id':row['case']['id'],'flags':issues})
record={'scope':'Heuristic review candidates only; false positives are possible. Read the question and each exact quote before deciding.',
        'cases':len(rows),'cases_flagged':len(flags),'flags':flags}
(a.run/'language_audit.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'cases':len(rows),'cases_flagged':len(flags),'ids':[r['case_id'] for r in flags]}))
