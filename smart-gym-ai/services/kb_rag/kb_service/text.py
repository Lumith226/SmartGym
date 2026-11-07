import re
import unicodedata

def normalize(text: str) -> str:
    text = text.lower().replace('đ', 'd')
    return ''.join(c for c in unicodedata.normalize('NFD', text) if not unicodedata.combining(c))

STOP = set('a an the of to and or in on is are for with from by at as it this that be can your you how what i my la va cua cho toi ban cac nhung mot co khi thi nen nhu nao'.split())

def tokens(text: str) -> list[str]:
    return [t for t in re.findall(r'[a-z0-9]+', normalize(text)) if len(t) > 1 and t not in STOP]

EXERCISES = {
    'SQUAT': ['squat', 'ngoi xom', 'ganh dui'],
    'PUSHUP': ['pushup', 'push-up', 'push up', 'chong day', 'hit dat'],
    'JUMPING_JACK': ['jumping jack', 'jumping jacks', 'bat nhay dang tay', 'dang tay chan'],
    'REVERSE_CRUNCH': ['reverse crunch', 'reverse ab crunch', 'gap bung nguoc'],
}

# Retrieval translations only. These are not claims about causes or diagnoses.
EXPANSIONS = {
    'hong': 'hips pelvis', 'lung': 'back spine torso', 'goi': 'knees',
    'tay': 'hands arms', 'chan': 'legs feet', 'co bung': 'abdominal core muscles',
    'nhom co': 'muscles', 'ha xuong': 'downward phase', 'nang len': 'upward phase',
    'do sau': 'depth parallel thighs', 'xuong nong': 'depth lowering floor',
    'vong lung': 'back sag rigid torso', 'hong cao': 'hips hike upwards',
    'nang hong': 'raise hips pelvis', 'khong bat nhay': 'jump legs apart',
    'ha canh': 'landing soft knees', 'tu the': 'starting position technique',
    'khoang cach': 'width apart', 'dau': 'head aligned spine',
    'co chu van': 'agonist prime mover', 'co doi khang': 'antagonist',
    'co hiep dong': 'synergist', 'gap khop': 'flexion', 'duoi khop': 'extension',
    'duoi hong': 'hip extension', 'van dong': 'body movements',
}

def detect_exercises(text: str) -> list[str]:
    n = normalize(text)
    return [code for code, aliases in EXERCISES.items() if any(a in n for a in aliases)]

def expand_query(text: str) -> str:
    n = normalize(text)
    extra = [en for vi, en in EXPANSIONS.items() if re.search(r'\b' + re.escape(vi) + r'\b', n)]
    for code in detect_exercises(text): extra.extend(EXERCISES[code][:2])
    return text + ' ' + ' '.join(extra)

def fitness_intent(text: str, labels: list[str]) -> bool:
    """Conservative domain gate, independent of incidental words in source metadata."""
    n=normalize(text)
    phrases=['tap luyen','tu the','ky thuat','nhom co','co bap','khoi dong','ha canh',
        'hong','lung','goi','khop','vai','khuu','ban tay','ban chan','fitness','exercise',
        'muscle','torso','spine','hip','hips','pelvis','knee','knees','elbow','core','bracing',
        'co chu van','co doi khang','co hiep dong','van dong','agonist','antagonist','synergist','flexion','extension']
    if detect_exercises(text) or any(re.search(r'\b'+re.escape(p)+r'\b',n) for p in phrases): return True
    return bool(labels) and bool(re.search(r'\b(giai thich|can chu y|explain|tieu chi)\b',n))

def split_text(text: str, max_chars=1500, overlap=200) -> list[str]:
    """Split within a source page/section; preserve exact spans and bounded overlap."""
    text = re.sub(r'[ \t]+', ' ', text.replace('\x00', '')).strip()
    pieces = []
    start = 0
    while start < len(text):
        end = min(start + max_chars, len(text))
        if end < len(text):
            boundary = max(text.rfind('\n', start+max_chars//2, end), text.rfind('. ', start+max_chars//2, end))
            if boundary > start: end = boundary + 1
        part = text[start:end].strip()
        if len(part) >= 60: pieces.append(part)
        if end == len(text): break
        start = max(start+1, end-overlap)
    return pieces
