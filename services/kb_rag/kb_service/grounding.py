"""Exact source spans and conservative term-coverage checks, not answers."""
import re
from .text import normalize,EXERCISES,detect_exercises,tokens
from .providers import ProviderError
from decimal import Decimal

def recover_source_span(quote,text):
    """Restore an ellipsis only when its anchors occur in order in ONE source.

    The result is copied from the original contiguous span, preserving every
    intervening negation/condition. This never joins separate documents.
    """
    source=re.sub(r'\s+',' ',text).strip();value=re.sub(r'\s+',' ',quote).strip()
    if value.casefold() in source.casefold():return value,None
    # A PDF line wrap inside a hyphenated word is typographical whitespace.
    # Return the original contiguous span, not an edited or approximate quote.
    positions=[];canonical=[]
    for index,char in enumerate(source):
        if char==' ' and index and source[index-1]=='-' and index+1<len(source) and source[index+1].isalpha():continue
        canonical.append(char);positions.append(index)
    needle=re.sub(r'(?<=-)\s+(?=[A-Za-z])','',value)
    start=''.join(canonical).casefold().find(needle.casefold())
    if start>=0:
        restored=source[positions[start]:positions[start+len(needle)-1]+1]
        return restored,{'before':quote,'after':restored,'method':'PDF hyphen whitespace only; original contiguous span restored'}
    if not re.search(r'\.{3,}|…',value):return None,None
    parts=[p.strip() for p in re.split(r'\.{3,}|…',value) if p.strip()]
    if not parts or any(len(p)<8 for p in parts):return None,None
    start=None;end=0
    for part in parts:
        position=source.casefold().find(part.casefold(),end)
        if position<0:return None,None
        if start is None:start=position
        end=position+len(part)
    restored=source[start:end]
    if not 12<=len(restored)<=1000:return None,None
    return restored,{'before':quote,'after':restored,'method':'contiguous_source_span; no omitted conditions removed'}

# Bilingual anatomical terms only. They detect missing evidence, not entailment.
BODY_TERMS = [
    (r'\bgót(?: chân)?\b', r'\bheels?\b', 'heel'),
    (r'\b(?:cột sống|xương sống)\b', r'\b(?:spine|spinal)\b', 'spine'),
    (r'\bgối\b', r'\bknees?\b', 'knee'),
    (r'\b(?:hông|chậu)\b', r'\b(?:hips?|pelvi[cs])\b', 'hip/pelvis'),
    (r'\blưng\b', r'\b(?:back|spine|spinal)\b', 'back'),
    (r'\bngón chân\b', r'\btoes?\b', 'toe'),
    (r'\bvai\b', r'\bshoulders?\b', 'shoulder'),
    (r'\b(?:ngực|lồng ngực)\b', r'\b(?:chest|rib cage|pectorals?)\b', 'chest'),
    (r'\b(?:cơ bụng|bụng)\b', r'\b(?:abs|abdom\w*|core)\b', 'abdominals'),
    (r'\b(?:đùi trước|quadriceps)\b', r'\bquadriceps\b', 'quadriceps'),
    (r'\b(?:đùi sau|hamstrings?)\b', r'\bhamstrings?\b', 'hamstrings'),
    (r'\b(?:cơ mông|glutes?)\b', r'\b(?:glute\w*|butt\w*)\b', 'gluteals'),
    (r'\b(?:kê tay cao|bề mặt cao)\b', r'\b(?:elevated|raised)\b', 'elevated support'),
    (r'\bgoblet\b', r'\bgoblet\b', 'goblet variant'),
    (r'\bbox squat\b', r'\bbox\b', 'box squat variant'),
    (r'\bfree squat\b', r'\bfree squat\b', 'free squat variant'),
    (r'\bplank\b', r'\bplank\b', 'plank'),
    (r'\bđùi\b', r'\b(?:thigh\w*|quadriceps|hamstrings?)\b', 'thigh'),
    (r'\b(?:cẳng chân|bắp chân)\b', r'\b(?:calves?|calf|shins?|tibia)\b', 'lower leg'),
    (r'\b(?:sàn|mặt đất)\b', r'\b(?:floor|ground)\b', 'floor/ground'),
    (r'\bkhớp\b', r'\b(?:joints?|hinge|hips?|knees?|elbows?|shoulders?)\b', 'joint'),
    (r'\b(?:nhịp tim|tim mạch)\b', r'\b(?:heart|cardiac|cardiovascular)\b', 'cardiac'),
    (r'\b(?:nhịp thở|hơi thở|hô hấp)\b', r'\b(?:breath\w*|respirat\w*)\b', 'breathing'),
    (r'\b(?:vận động|bài tập) toàn thân\b', r'\b(?:full[ -]body|whole[ -]body|entire body)\b', 'full-body classification'),
]

def source_windows(text):
    # Preserve list-item boundaries before collapsing whitespace. Publisher
    # bullet lists often omit sentence punctuation, but each item is a usable
    # exact span and should not force the LLM to quote the entire list.
    splitter=r'(?<=[.!?])\s+' if re.search(r'[.!?]\s',text) else r'\n+'
    sentences=[re.sub(r'\s+',' ',s).strip() for s in re.split(splitter,text) if s.strip()]
    text=re.sub(r'\s+',' ',text).strip()
    spans=[]
    for width in range(1,4):
        for i in range(len(sentences)-width+1):
            span=' '.join(sentences[i:i+width])
            if 12<=len(span)<=1000 and not span.isupper():spans.append(span)
    return list(dict.fromkeys(spans)) or [text[:900]]

def complete_source_sentence(quote,text):
    """Keep a selected subspan attached to its original sentence conditions."""
    clean=lambda x:re.sub(r'\s+',' ',x).strip().casefold()
    windows=[s for s in source_windows(text) if clean(quote) in clean(s)]
    if not windows:return quote,None
    shortest=min(windows,key=len)
    if clean(shortest)==clean(quote):return quote,None
    return shortest,{'before':quote,'after':shortest,'method':'complete original source sentence; preserve negation and conditions'}

def missing_body_terms(claim,quote):
    # Keep Vietnamese accents: "vài" is not "vai", "gợi" is not "gối".
    text=claim.casefold()
    # An exercise title identifies context, not an anatomical assertion.
    for code in detect_exercises(claim):
        for alias in EXERCISES[code]:
            if alias in normalize(text):
                # Alias lengths change when decomposing accents, so match
                # whole original words by their normalized token sequences.
                words=text.split();target=alias.split()
                for i in range(len(words)-len(target)+1):
                    if [normalize(w).strip('.,:;()') for w in words[i:i+len(target)]]==target:
                        words[i:i+len(target)]=['EXERCISE']*len(target)
                text=' '.join(words)
    # Both the extracted sources and the software contract may be Vietnamese.
    # An English-only proof vocabulary rejected valid Vietnamese protocol text.
    missing=[name for vi,en,name in BODY_TERMS if re.search(vi,text) and not (re.search(en,quote.lower()) or re.search(vi,quote.casefold()))]
    # Keep diacritics for đầu (head), otherwise dấu hiệu becomes a false head.
    head_text=re.sub(r'\b(đầu gối|ban đầu|bắt đầu|đầu tiên|từ đầu)\b','',text)
    head_quote=re.sub(r'\b(đầu gối|ban đầu|bắt đầu|đầu tiên|từ đầu)\b','',quote.casefold())
    if re.search(r'\bđầu\b',head_text) and not (re.search(r'\b(?:head|overhead)\b',quote.lower()) or re.search(r'\bđầu\b',head_quote)):missing.append('head')
    return missing

def focused_source_windows(text,query,limit=5):
    """Rank exact spans, never generate or rewrite evidence."""
    spans=source_windows(text);qt=set(tokens(query))
    ranked=sorted(spans,key=lambda s:(-len(qt.intersection(tokens(s))),-len(set(tokens(s)).intersection(qt))/max(1,len(tokens(s))),len(s)))
    return ranked[:limit] if any(qt.intersection(tokens(s)) for s in spans) else spans

def validate_quantities(claim,quote):
    """Conservative checks, not a general unit/causality proof system."""
    values=lambda text:{Decimal(n.replace(',','.')) for n in re.findall(r'(?<![\w])\d+(?:[.,]\d+)?',text)}
    if not values(claim).issubset(values(quote)):
        raise ProviderError('An answer adds a numeric value absent from its source quote. Remove the unsupported value.')
    numeric_rate=r'\d+(?:[.,]\d+)?\s*(?:rps|rpm|lan\s*(?:moi|/|tren)\s*(?:giay|phut))'
    if re.search(numeric_rate,normalize(claim)) and not re.search(r'\b(?:rps|rpm|per second|per minute)\b',quote.casefold()):
        raise ProviderError('A duration or annotation was converted to an unsupported repetition rate. Preserve the original quantity and unit.')
    if 'dung tho' in normalize(claim) and 'paus' in quote.casefold() and 'breath' in quote.casefold():
        raise ProviderError('Pausing for a breath means dừng lại để lấy hơi, not dừng thở. Correct the translation.')


def validate_semantic_fidelity(claim,quote,question='',observation_only=False):
    """Conservative wording/unit checks; semantic source review is still required."""
    text=claim.casefold();proof=quote.casefold()
    if (re.search(r'[đĐăĂâÂêÊôÔơƠưƯáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹỵ]',question)
        and len(claim.split())>=8 and not re.search(r'[^\x00-\x7f]',claim)
        and len(re.findall(r'\b(?:the|your|while|with|and|towards|raising|lowering)\b',text))>=3):
        raise ProviderError('The user asks in Vietnamese, but this point is an untranslated English source sentence. Explain the same supported fact in natural Vietnamese.')
    if re.search(r'\bchỉ (?:cho phép|được phép)\b',text) and re.search(r'\b(?:can|may)\b',proof) and not re.search(r'\b(?:only|exclusively|must)\b',proof):
        raise ProviderError('Can/may gives an option, not an exclusive permission. Remove the unsupported word chỉ and preserve the source modality.')
    if 'an toàn' in text and not re.search(r'\b(?:safe\w*|injur\w*|risk|protect\w*|an toàn)\b',proof):
        raise ProviderError('Do not add a safety claim that the source quotation does not establish.')
    # Accents matter: nhắm vào (target) is not nhằm (purpose).
    if (re.search(r'\b(?:để tạo|giúp|nhằm|dẫn đến|gây|tăng hiệu quả)\b',text)
        and not re.search(r'\b(?:to (?:stabil\w*|strengthen|prevent|protect|improve|promote|reduce|develop|create)|helps?|allow\w*|caus\w*|increas\w*|reduc\w*|improv\w*|promot\w*|risk|stress|benefit\w*|stabili\w*)\b',proof)):
        raise ProviderError('The quote does not establish the added purpose, benefit, consequence or cause. Remove the causal/benefit clause.')
    action=re.sub(r'\bgóc gập(?: của)? (?:khớp )?(?:gối|hông|khuỷu)\b','JOINT_ANGLE',text)
    if re.search(r'\bgập (?:khớp|gối|hông|khuỷu|chân|tay)\b',action) and not re.search(r'\b(?:flex|flexion|flexing|flexes|bend|bending|bent|gập)\b',proof):
        raise ProviderError('Joint flexion (gập) is not extension (duỗi). Cite the flexion phase or correct the action to match the quote.')
    if re.search(r'\bduỗi (?:khớp|gối|hông|khuỷu|chân|tay)\b',action) and not re.search(r'\b(?:extend\w*|extension|straighten\w*|duỗi)\b',proof):
        raise ProviderError('Joint extension needs extension evidence, not an unrelated bending or alignment instruction.')
    if 'nhấn mạnh' in text and re.search(r'\bpress\w*\b',proof) and not re.search(r'\b(?:emphasis|emphasize|stress)\b',proof):
        raise ProviderError('Press in a movement instruction means đẩy/ấn, not nhấn mạnh. Correct the translation.')
    # The Vietnamese exercise title itself contains “chạm”; it is an alias,
    # not a claim that the heel must physically touch the buttocks.
    contact_text=re.sub(r'\bgót chạm mông\b','EXERCISE',text)
    if re.search(r'\bchạm\b',contact_text) and re.search(r'\btowards?\b',proof) and not re.search(r'\b(?:touch\w*|contact|chạm)\b',proof):
        raise ProviderError('Towards specifies direction, not physical contact. Do not add a contact requirement.')
    if re.search(r'\b(?:trong suốt (?:quá trình tập|bài tập)|toàn bộ (?:quá trình tập|bài tập))\b',text) and not re.search(r'\b(?:throughout (?:the )?(?:exercise|entire)|entire exercise|whole exercise)\b',proof):
        raise ProviderError('Do not extend an instruction for one preparation/movement phase to the whole exercise. Preserve the source phase.')
    if re.search(r'\bđể (?:hít vào|thở ra)\b',text) and not re.search(r'\b(?:to|for) (?:inhal\w*|exhal\w*)\b',proof):
        raise ProviderError('The source gives simultaneous breathing and movement, not movement performed in order to breathe. Remove the invented purpose relation.')
    if re.search(r'\b(?:trở (?:về|lại)|quay (?:về|lại)) (?:vị trí|tư thế) (?:ban đầu|khởi đầu)\b',text) and not re.search(r'\b(?:return\w*|back to|starting position|initial (?:standing )?position|original position)\b',proof):
        raise ProviderError('Landing in the opening phase is not a return to the starting position. Preserve the quoted phase and remove the invented return sequence.')
    rate=r'\b(?:rps|rpm|cadence|lan\s*(?:moi|/|tren)\s*(?:giay|phut))\b'
    if re.search(rate,normalize(text)) and not re.search(r'\b(?:rps|rpm|cadence|per second|per minute|lần mỗi giây|lần mỗi phút)\b',proof):
        duration_contrast=(re.search(r'khong phai (?:so |toc do )?(?:lan|cadence|rps|rpm)',normalize(text))
                           and re.search(r'\b(?:seconds?|minutes?|giây|phút)\b',proof))
        if not duration_contrast:
            raise ProviderError('Qualitative pace or form guidance does not establish an RPS/cadence standard or its absence. Keep the qualitative guidance and state the unverified quantitative limit separately.')
    if observation_only and re.search(r'\b(?:nhãn|dự đoán|kết quả mô hình)\b[^.!?\n]{0,160}\b(?:là đúng|đúng vì|là chính xác|được xác nhận đúng)\b',text):
        raise ProviderError('Model output is a prediction, not ground truth. Explain the source criterion without certifying that the model label is correct for this video.')
    if 'kind' not in question.casefold() and re.search(r'\bkind\s*=\s*(?:error|attribute)\b',text):
        raise ProviderError('Explain the requested limitation in everyday Vietnamese; do not insert unrequested programming assignments or speculate about alternative label types.')


def tidy_anatomical_repetition(text):
    """Remove accidental repeated body nouns, preserving Vietnamese reduplication."""
    return re.sub(r'\b(mũi|gối|hông|vai|khuỷu|lưng|tay|chân|mông)(?:\s+\1)+\b',r'\1',text,flags=re.I)

def expand_support(point,evidence,other_evidence=None):
    """Expand within the SAME retrieved chunk, before semantic review.

    The new span must include the original quote. It cannot invent a source,
    replace the answer, or skip the subsequent meaning/phase review.
    """
    clean=lambda s:re.sub(r'\s+',' ',s).strip().casefold()
    available={e.chunk_id:e for e in (other_evidence or [])}
    if hasattr(evidence,'chunk_id'):available[evidence.chunk_id]=evidence
    existing=list(getattr(point,'additional_support',[]))
    for span in existing:
        if span.chunk_id not in available or clean(span.quote) not in clean(available[span.chunk_id].text):
            raise ProviderError('Additional source span is not in retrieved evidence')
    combined=point.quote+' '+' '.join(s.quote for s in existing)
    missing=missing_body_terms(point.text,combined)
    if not missing:return point,None
    choices=[s for s in source_windows(evidence.text) if clean(point.quote) in clean(s) and not missing_body_terms(point.text,s+' '+' '.join(x.quote for x in existing))]
    if choices:
        span=min(choices,key=len)
        return point.model_copy(update={'quote':span}),{'chunk_id':point.chunk_id,'missing_terms':missing,'before':point.quote,'after':span}
    added=[s.model_dump() for s in existing]
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
