"""Verify imported textbook evidence against the user's unchanged PDF."""
import re
from pypdf import PdfReader
from kb_service.config import ROOT, Settings
from kb_service.ingest import read_json, write_json, file_sha256

settings=Settings.from_env()
snapshot=read_json(settings.index_dir/'snapshot.json')
source=next(s for s in snapshot['sources'] if s['id']=='openstax_anatomy')
path=ROOT/'data/raw'/source['file']
assert file_sha256(path)==source['sha256']
example=read_json(ROOT/'artifacts/book_in_out.json')
evidence=example['output']['evidence']
assert evidence and evidence[0]['source_id']=='openstax_anatomy'
samples=[]
with path.open('rb') as stream:
    reader=PdfReader(stream)
    assert len(reader.pages)==source['verified_total_pdf_pages']
    copyright_text=reader.pages[source['copyright_pdf_page']-1].extract_text()
    assert '2026' in copyright_text and 'CC BY-NC-SA 4.0' in copyright_text
    for item in evidence:
        if item['source_id']!='openstax_anatomy':continue
        page=item['pdf_page']
        assert any(lo<=page<=hi for lo,hi in source['page_ranges'])
        cleaned=re.sub(r'[ \t]+',' ',reader.pages[page-1].extract_text().replace('\x00','')).strip()
        assert item['text'] in cleaned
        assert item['section']
        assert item['attribution']==source['attribution']
        samples.append({'chunk_id':item['chunk_id'],'pdf_page':page,'section':item['section'],'exact_text_span_verified':True})
report={'file':source['file'],'file_bytes':path.stat().st_size,'sha256':source['sha256'],
    'pdf_total_pages':source['verified_total_pdf_pages'],'selected_pages':source['selected_pages_or_sections'],
    'indexed_chunks':source['chunks'],'license':source['license'],'attribution':source['attribution'],
    'sample_citations_verified':samples,'status':'passed','kb_version':snapshot['version'],
    'generation_used':example['output']['generation_used']}
write_json(ROOT/'artifacts/book_import_verification.json',report)
print({'status':report['status'],'selected_pages':report['selected_pages'],'indexed_chunks':report['indexed_chunks'],
    'verified_citation_pages':[x['pdf_page'] for x in samples]})
