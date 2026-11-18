"""Download a pinned portable Poppler for read-only PDF source previews."""
from pathlib import Path
import hashlib,json,zipfile,httpx

ROOT=Path(__file__).resolve().parents[3]
dest=ROOT/'.tools/poppler-26.09.0-0'
url='https://github.com/oschwartz10612/poppler-windows/releases/download/v26.09.0-0/Release-26.09.0-0.zip'
expected='7a6f256a0ddf7536182246a5733331bf4677cbcc34f4663774947ad34556c8d0'
archive=ROOT/'.tools/Release-26.09.0-0.zip'
if not archive.exists():
    partial=archive.with_suffix('.download')
    with httpx.stream('GET',url,follow_redirects=True,timeout=90) as r:
        r.raise_for_status()
        with partial.open('wb') as f:
            for data in r.iter_bytes():f.write(data)
    if hashlib.sha256(partial.read_bytes()).hexdigest()!=expected:raise ValueError('Poppler archive digest mismatch')
    partial.replace(archive)
assert hashlib.sha256(archive.read_bytes()).hexdigest()==expected
with zipfile.ZipFile(archive) as z:
    for member in z.infolist():
        target=(dest/member.filename).resolve()
        if not target.is_relative_to(dest.resolve()):raise ValueError('Unsafe zip member')
    z.extractall(dest)
executables=list(dest.rglob('pdftoppm.exe'));assert len(executables)==1
manifest={'version':'26.09.0-0','url':url,'release_metadata':'https://api.github.com/repos/oschwartz10612/poppler-windows/releases/389278735',
          'sha256':expected,'pdftoppm':str(executables[0]),'portable_only':True,'system_path_changed':False}
(dest/'tool_manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps(manifest))
