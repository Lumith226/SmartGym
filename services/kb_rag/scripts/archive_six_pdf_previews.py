"""Keep inspected source-page previews in the release, including the book sample."""
from pathlib import Path
import json,shutil,hashlib,subprocess
from pypdf import PdfReader

ROOT=Path(__file__).resolve().parents[1]
release=ROOT/'artifacts/six_exercises_20261117/releases/kb_ddae6f149e7b9f57'
dest=release/'pdf_source_pages';dest.mkdir(exist_ok=True)
old=json.loads((release/'pdf_source_visual_samples.json').read_text(encoding='utf-8'))
pages=[]
for record in old['pages']:
    image=Path(record['image']);shutil.copy2(image,dest/image.name)
    if image.with_suffix('.txt').exists():shutil.copy2(image.with_suffix('.txt'),dest/image.with_suffix('.txt').name)
    printed={('hhs_physical_activity_2018',62):62,('hhs_physical_activity_2018',91):91,
             ('nsca_movement_progressions',1):6,('nsca_movement_progressions',4):9}
    pages.append({**record,'earlier_temporary_image':record['image'],'image':str(dest/image.name),
                  'printed_page_observed':printed[(record['source_id'],record['file_page_1_based'])]})
snapshot=json.loads((ROOT/'data/releases/six_exercises_20261118_r3/snapshot.json').read_text(encoding='utf-8'))
book=next(s for s in snapshot['sources'] if s['id']=='openstax_anatomy')
pdf=ROOT/'data/raw'/book['file'];before=hashlib.sha256(pdf.read_bytes()).hexdigest()
tool=json.loads((ROOT.parents[1]/'.tools/poppler-26.09.0-0/tool_manifest.json').read_text(encoding='utf-8'))
prefix=dest/'openstax_anatomy_file_page_426'
result=subprocess.run([tool['pdftoppm'],'-f','426','-l','426','-r','110','-singlefile','-png',str(pdf),str(prefix)],capture_output=True,text=True,encoding='utf-8',errors='replace')
if result.returncode:raise RuntimeError(result.stderr)
text=PdfReader(pdf).pages[425].extract_text() or ''
prefix.with_suffix('.txt').write_text(text,encoding='utf-8')
pages.append({'source_id':book['id'],'source_file':str(pdf),'source_sha256':before,'file_page_1_based':426,
              'image':str(prefix.with_suffix('.png')),'text_preview':text[:180],
              'source_unchanged':hashlib.sha256(pdf.read_bytes()).hexdigest()==before,
              'linked_chunk':'openstax_anatomy_2e2d111a51695430','printed_page_observed':410})
assert all(p['source_unchanged'] for p in pages)
(dest/'manifest.json').write_text(json.dumps({'origin':'Read-only source-page PNG previews; original PDFs unchanged',
     'not_full_pdf_layout_review':True,'pages':pages},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'pages':len(pages),'folder':str(dest),'new_book_page':str(prefix.with_suffix('.png'))}))
