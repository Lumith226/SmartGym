from __future__ import annotations
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import tempfile
import httpx
from bs4 import BeautifulSoup
from pypdf import PdfReader
from .config import ROOT
from .text import detect_exercises, normalize, split_text

def read_json(path: Path):
    return json.loads(path.read_text(encoding='utf-8'))

def write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    # Replace atomically, so a running reader never sees a partial file.
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent, delete=False, suffix='.tmp') as f:
        json.dump(value, f, ensure_ascii=False, indent=2)
        temp = Path(f.name)
    try:
        temp.replace(path)
    except PermissionError:
        # Some Windows workspace ACLs permit writing but not replacing an
        # existing file created by another account. Stop/restart the service
        # around ingestion; each running engine holds an immutable snapshot.
        with path.open('w',encoding='utf-8') as target:
            target.write(temp.read_text(encoding='utf-8'))
            target.flush()
        try:temp.unlink()
        except OSError:pass

def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def file_sha256(path: Path) -> str:
    digest=hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''):
            digest.update(block)
    return digest.hexdigest()

def sources(root: Path = ROOT) -> list[dict]:
    result = read_json(root / 'sources.json')
    seen = set()
    for s in result:
        if not re.fullmatch(r'[a-z0-9_]+', s['id']) or s['id'] in seen:
            raise ValueError('Source IDs must be unique lowercase identifiers')
        seen.add(s['id'])
        raw = (root / 'data/raw' / s['file']).resolve()
        if not raw.is_relative_to((root / 'data/raw').resolve()):
            raise ValueError('Source file must stay inside data/raw')
        if s['format'] not in ['pdf', 'html', 'txt']:
            raise ValueError('Supported source formats: pdf, html, txt')
        if s.get('local_note') and not (root/'source_notes'/s['local_note']).resolve().is_relative_to((root/'source_notes').resolve()):
            raise ValueError('Notes must stay inside source_notes')
    return result

def fetch_sources(root: Path = ROOT) -> list[dict]:
    raw_dir = root / 'data/raw'
    raw_dir.mkdir(parents=True, exist_ok=True)
    report = []
    with httpx.Client(timeout=120, follow_redirects=True, headers={'User-Agent': 'SmartGym-Academic-KB/0.1'}) as client:
        for s in sources(root):
            path = raw_dir / s['file']
            entry = {'source_id': s['id'], 'url': s['url'], 'file': s['file'], 'optional':s.get('optional',False)}
            try:
                if path.exists():
                    entry['status'] = 'cached'
                elif s.get('local_note'):
                    data=(root/'source_notes'/s['local_note']).read_bytes()
                    path.write_bytes(data)
                    entry['status']='prepared_from_attributed_notes'
                else:
                    if s.get('manual_download'):
                        raise ValueError(f"Download the PDF from {s['url']} and save it as data/raw/{s['file']}")
                    if not s['url'].startswith('https://'):
                        raise ValueError('Only HTTPS downloads are allowed; local files can be added manually')
                    response = client.get(s['url'])
                    response.raise_for_status()
                    data = response.content
                    if s['format']=='pdf' and not data.lstrip().startswith(b'%PDF'):
                        raise ValueError('Response is not a PDF')
                    if not data or len(data)>100_000_000:
                        raise ValueError('Empty source or source larger than 100 MB')
                    path.write_bytes(data)
                    entry['status'] = 'downloaded'
                entry.update(bytes=path.stat().st_size, sha256=file_sha256(path))
            except (httpx.HTTPError, ValueError, OSError) as exc:
                entry.update(status='failed', error=str(exc))
            entry['checked_at'] = datetime.now(timezone.utc).isoformat()
            report.append(entry)
            print(f"{s['id']}: {entry['status']}", flush=True)
    stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    write_json(root/f'artifacts/download_report_{stamp}.json', report)
    return report

def html_sections(data: bytes, source: dict) -> list[tuple[str, str]]:
    soup = BeautifulSoup(data, 'html.parser')
    for tag in soup(['script','style','nav','footer','header','noscript','form','iframe']): tag.decompose()
    if source.get('selector')=='ace_steps':
        result = []
        for heading in soup.find_all(re.compile('^h[1-6]$')):
            heading_text=heading.get_text(' ', strip=True)
            if not re.match(r'^Step \d+', heading_text, flags=re.I) and heading_text not in source.get('extra_headings',[]): continue
            parts=[]
            for sibling in heading.next_siblings:
                if getattr(sibling,'name','') in ['h1','h2','h3','h4','h5','h6']: break
                text = sibling.get_text(' ', strip=True) if hasattr(sibling,'get_text') else str(sibling).strip()
                if text: parts.append(text)
            if parts: result.append((heading.get_text(' ',strip=True), '\n'.join(parts)))
        if not result: raise ValueError('No exercise steps found; inspect source HTML instead of indexing navigation')
        return result
    main = soup.find('main') or soup.find('article')
    if main is None: raise ValueError('No main/article content found; configure an extraction selector')
    for tag in main.select('aside, .related-posts, .newsletter, .share'): tag.decompose()
    return [(source['title'], main.get_text('\n',strip=True))]

def extract_source(path: Path, source: dict):
    if source['format']=='pdf':
        # Keep the file seekable on disk instead of loading a large textbook
        # into an additional BytesIO buffer.
        with path.open('rb') as stream:
            reader = PdfReader(stream)
            expected=source.get('verified_total_pdf_pages')
            if expected is not None and len(reader.pages)!=expected:
                raise ValueError('PDF edition differs from verified page map; inspect the outline before changing ranges')
            selected = set()
            for lo, hi in source.get('page_ranges', [[1,len(reader.pages)]]):
                if lo<1 or hi<lo or hi>len(reader.pages): raise ValueError('Invalid PDF page range')
                selected.update(range(lo,hi+1))
            for page_num in sorted(selected):
                page = reader.pages[page_num-1]
                text = page.extract_text() or ''
                section=next((s['title'] for s in source.get('page_sections',[]) if s['start']<=page_num<=s['end']),None)
                yield {'pdf_page':page_num, 'section':section, 'text':text, 'needs_ocr':len(text.strip())<60}
    elif source['format']=='html':
        for section,text in html_sections(path.read_bytes(), source):
            yield {'pdf_page':None,'section':section,'text':text,'needs_ocr':False}
    else:
        yield {'pdf_page':None,'section':source['title'],'text':path.read_text(encoding='utf-8'),'needs_ocr':False}

def build_index(root: Path = ROOT, index_dir: Path | None = None) -> dict:
    index_dir = index_dir or root/'data/index'
    chunks, available, skipped = [], [], []
    seen_hashes = set()
    for s in sources(root):
        path = root/'data/raw'/s['file']
        if not path.exists():
            skipped.append({'source_id':s['id'],'reason':'file_missing'})
            continue
        source_meta = {**s,'sha256':file_sha256(path),'indexed_at':datetime.now(timezone.utc).isoformat()}
        pages, empty_pages, count = 0, [], 0
        try:
            for page in extract_source(path,s):
                pages += 1
                if page['needs_ocr']: empty_pages.append(page['pdf_page']); continue
                for ordinal, text in enumerate(split_text(page['text'])):
                    digest = sha(text.encode())
                    if digest in seen_hashes: continue
                    seen_hashes.add(digest)
                    code_tags = s.get('exercise_codes', []) or detect_exercises(text)
                    locator = str(page['pdf_page'] or page['section'])
                    chunk_id = s['id'] + '_' + sha((locator+':'+str(ordinal)+':'+text).encode())[:16]
                    chunk={'chunk_id':chunk_id,'source_id':s['id'],'title':s['title'],
                        'publisher':s['publisher'],'url':s['url'],'pdf_page':page['pdf_page'],
                        'section':page['section'],'text':text,'exercise_codes':code_tags}
                    if s.get('attribution'):
                        chunk.update(attribution=s['attribution'],license=s.get('license'))
                    chunks.append(chunk)
                    count += 1
            available.append({**source_meta,'chunks':count,'selected_pages_or_sections':pages,'ocr_pages':empty_pages})
        except Exception as exc:
            # An extraction error aborts the build; keep the previous atomic index intact.
            raise ValueError(f"Cannot extract {s['id']}: {exc}") from exc
    if not chunks: raise ValueError('No usable source content; run fetch or add registered files to data/raw')
    claims, unsupported = [], []
    claim_path=root/'claims.json'
    for claim in read_json(claim_path) if claim_path.exists() else []:
        matches=[c['chunk_id'] for c in chunks if c['source_id']==claim['source_id'] and normalize(claim['anchor']) in normalize(c['text'])]
        if matches:
            claims.append({**claim,'chunk_ids':matches,'review_status':'developer_checked_against_anchor; domain_review_pending'})
        else: unsupported.append(claim['id'])
    catalog=read_json(root/'label_catalog_v4.json') if (root/'label_catalog_v4.json').exists() else None
    if catalog:
        by_claim={c['id']:c for c in claims}
        for exercise,spec in catalog['exercises'].items():
            for label in spec['labels']:
                for criterion in label['criterion_ids']:
                    if criterion not in by_claim or by_claim[criterion]['exercise_code']!=exercise:
                        raise ValueError('V4 label refers to unpublished or wrong-exercise criterion: '+criterion)
    version = 'kb_' + sha(json.dumps({'chunks':chunks,'claims':claims,'label_catalog':catalog},ensure_ascii=False,sort_keys=True).encode())[:16]
    nodes = [{'id':s['id'],'type':'Source','title':s['title'],'url':s['url']} for s in available]
    edges=[]
    for code in ['SQUAT','PUSHUP','JUMPING_JACK','REVERSE_CRUNCH']: nodes.append({'id':code,'type':'Exercise'})
    for c in chunks:
        nodes.append({'id':c['chunk_id'],'type':'Chunk','source_id':c['source_id'],'pdf_page':c['pdf_page'],'section':c['section']})
        edges.append({'from':c['source_id'],'to':c['chunk_id'],'type':'HAS_CHUNK'})
        for code in c['exercise_codes']: edges.append({'from':c['chunk_id'],'to':code,'type':'MENTIONS'})
    for claim in claims:
        nodes.append({'id':claim['id'],'type':'TechniqueCriterion','text_vi':claim['text_vi'],'review_status':claim['review_status']})
        edges.append({'from':claim['exercise_code'],'to':claim['id'],'type':'HAS_CRITERION'})
        for cid in claim['chunk_ids']: edges.append({'from':claim['id'],'to':cid,'type':'SUPPORTED_BY'})
    if catalog:
        for exercise,spec in catalog['exercises'].items():
            for label in spec['labels']:
                label_id=exercise+'.'+label['key']
                nodes.append({'id':label_id,'type':'ModelLabel','exercise_code':exercise,
                    'label_key':label['key'],'kind':label['kind'],'name_vi':label['name_vi'],
                    'coverage':label['coverage'],'model_sha256':spec['model_sha256']})
                edges.append({'from':exercise,'to':label_id,'type':'HAS_LABEL'})
                for criterion in label['criterion_ids']:
                    edges.append({'from':label_id,'to':criterion,'type':'RETRIEVES_CRITERION'})
    report={'version':version,'chunk_count':len(chunks),'source_count':sum(s['chunks']>0 for s in available),
        'book_pdf_ready':any(s['id']=='openstax_anatomy' and s['chunks']>0 for s in available),
        'format_distribution':dict(Counter(s['format'] for s in available)),
        'chunks_by_source':dict(Counter(c['source_id'] for c in chunks)),
        'exercise_tag_distribution':dict(Counter(code for c in chunks for code in c['exercise_codes'])),
        'chunk_characters':{'min':min(len(c['text']) for c in chunks),'max':max(len(c['text']) for c in chunks),'mean':round(sum(len(c['text']) for c in chunks)/len(chunks),1)},
        'unsupported_claims_not_published':unsupported,'skipped_sources':skipped,
        'graph_nodes':len(nodes),'graph_edges':len(edges),'domain_review':'pending',
        'note':'PDF pages are 1-based file page positions, not printed page numbers. Exercise tags use dictionary matches, not learned semantic classification.'}
    # Corpus and graph are one atomic snapshot. Readers do not mix index generations.
    write_json(index_dir/'snapshot.json',{'version':version,'chunks':chunks,'sources':available,'claims':claims,'label_catalog':catalog,'graph':{'nodes':nodes,'edges':edges},'report':report})
    write_json(root/'artifacts/corpus_report.json', report)
    return report
