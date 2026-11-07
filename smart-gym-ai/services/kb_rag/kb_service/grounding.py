"""Exact source spans and conservative term-coverage checks, not answers."""
import re
from .text import normalize
from .providers import ProviderError

# Bilingual anatomical terms only. They detect missing evidence, not entailment.
BODY_TERMS = [
    (r'\bgot(?: chan)?\b', r'\bheels?\b', 'heel'),
    (r'\b(?:cot song|xuong song)\b', r'\b(?:spine|spinal)\b', 'spine'),
    (r'\bgoi\b', r'\bknees?\b', 'knee'),
    (r'\b(?:hong|chau)\b', r'\b(?:hips?|pelvi[cs])\b', 'hip/pelvis'),
    (r'\blung\b', r'\b(?:back|spine|spinal)\b', 'back'),
    (r'\bngon chan\b', r'\btoes?\b', 'toe'),
]

def source_windows(text):
    text=re.sub(r'\s+',' ',text).strip()
    sentences=re.split(r'(?<=[.!?])\s+',text)
    spans=[]
    for width in range(1,4):
        for i in range(len(sentences)-width+1):
            span=' '.join(sentences[i:i+width])
            if 12<=len(span)<=1000:spans.append(span)
    return list(dict.fromkeys(spans)) or [text[:900]]

def missing_body_terms(claim,quote):
    text=normalize(claim)
    # 'đầu gối', 'ban đầu', etc. are not claims about the head.
    text=re.sub(r'\b(dau goi|ban dau|bat dau|dau tien|tu dau)\b',lambda m:'goi' if m[0]=='dau goi' else '',text)
    missing=[name for vi,en,name in BODY_TERMS if re.search(vi,text) and not re.search(en,quote.lower())]
    # Keep diacritics for đầu (head), otherwise dấu hiệu becomes a false head.
    head_text=re.sub(r'\b(đầu gối|ban đầu|bắt đầu|đầu tiên|từ đầu)\b','',claim.casefold())
    if re.search(r'\bđầu\b',head_text) and not re.search(r'\bhead\b',quote.lower()):missing.append('head')
    return missing

def expand_support(point,evidence,other_evidence=None):
    """Expand within the SAME retrieved chunk, before semantic review.

    The new span must include the original quote. It cannot invent a source,
    replace the answer, or skip the subsequent meaning/phase review.
    """
    missing=missing_body_terms(point.text,point.quote)
    if not missing:return point,None
    clean=lambda s:re.sub(r'\s+',' ',s).strip().casefold()
    choices=[s for s in source_windows(evidence.text) if clean(point.quote) in clean(s) and not missing_body_terms(point.text,s)]
    if choices:
        span=min(choices,key=len)
        return point.model_copy(update={'quote':span}),{'chunk_id':point.chunk_id,'missing_terms':missing,'before':point.quote,'after':span}
    combined=point.quote;added=[]
    candidates=[(e.chunk_id,span) for e in (other_evidence or []) if e.chunk_id!=point.chunk_id and e.source_id==evidence.source_id for span in source_windows(e.text)]
    while missing_body_terms(point.text,combined) and len(added)<2:
        current=len(missing_body_terms(point.text,combined))
        improvements=[(current-len(missing_body_terms(point.text,combined+' '+span)),cid,span) for cid,span in candidates if cid not in {s['chunk_id'] for s in added}]
        improvements=[x for x in improvements if x[0]>0]
        if not improvements:break
        _,cid,span=min(improvements,key=lambda x:(-x[0],len(x[2]),x[1]))
        added.append({'chunk_id':cid,'quote':span});combined+=' '+span
    if missing_body_terms(point.text,combined):raise ProviderError('Cited quote lacks evidence for body terms: '+', '.join(missing)+'; narrow the claim or cite a complete span')
    updated=point.__class__.model_validate({**point.model_dump(),'additional_support':added})
    return updated,{'chunk_id':point.chunk_id,'missing_terms':missing,'before':point.quote,'added_support':added,'same_document_only':True}
