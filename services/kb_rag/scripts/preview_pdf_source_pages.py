"""Render unchanged source pages for visual inspection, not a new PDF."""
from pathlib import Path
import json,hashlib,subprocess
from pypdf import PdfReader

ROOT=Path(__file__).resolve().parents[1]
snapshot=json.loads((ROOT/'data/releases/six_exercises_20261118_r3/snapshot.json').read_text(encoding='utf-8'))
tool=json.loads((ROOT.parents[1]/'.tools/poppler-26.09.0-0/tool_manifest.json').read_text(encoding='utf-8'))
out=ROOT.parents[2]/'tmp/pdfs/six_kb_source_review_20261118';out.mkdir(parents=True,exist_ok=True)
rows=[]
for identity,pages in [('hhs_physical_activity_2018',[62,91]),('nsca_movement_progressions',[1,4])]:
    source=next(s for s in snapshot['sources'] if s['id']==identity)
    pdf=ROOT/'data/raw'/source['file'];before=hashlib.sha256(pdf.read_bytes()).hexdigest()
    reader=PdfReader(pdf)
    for page in pages:
        prefix=out/f'{identity}_file_page_{page}'
        result=subprocess.run([tool['pdftoppm'],'-f',str(page),'-l',str(page),'-r','110','-singlefile','-png',str(pdf),str(prefix)],capture_output=True,text=True,encoding='utf-8',errors='replace')
        if result.returncode:raise RuntimeError(result.stderr)
        text=reader.pages[page-1].extract_text() or ''
        prefix.with_suffix('.txt').write_text(text,encoding='utf-8')
        rows.append({'source_id':identity,'source_file':str(pdf),'source_sha256':before,'file_page_1_based':page,
                     'image':str(prefix.with_suffix('.png')),'text_preview':text[:180],'source_unchanged':hashlib.sha256(pdf.read_bytes()).hexdigest()==before})
    print(identity,'rendered',pages,flush=True)
release=ROOT/'artifacts/six_exercises_20261117/releases'/snapshot['version']
(release/'pdf_source_visual_samples.json').write_text(json.dumps({'origin':'Poppler renders of original PDFs; read-only','not_full_book_layout_review':True,'pages':rows},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'directory':str(out),'pages':len(rows)},ensure_ascii=False))
