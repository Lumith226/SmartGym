"""Restore a project-local official Ollama binary; reuse existing user models."""
from pathlib import Path
import hashlib,json,zipfile
import httpx
ROOT=Path(__file__).resolve().parents[1];out=ROOT/'artifacts/six_exercises_20261117'
dest=ROOT.parents[1]/'.tools/ollama';dest.mkdir(parents=True,exist_ok=True)
with httpx.Client(timeout=120,follow_redirects=True,headers={'User-Agent':'SmartGym-local-runtime'}) as client:
    release=client.get('https://api.github.com/repos/ollama/ollama/releases/latest');release.raise_for_status()
    meta=release.json();asset=next(a for a in meta['assets'] if a['name']=='ollama-windows-amd64.zip')
    archive=dest/asset['name'];print(json.dumps({'release':meta['tag_name'],'download_bytes':asset['size'],'url':asset['browser_download_url']}),flush=True)
    if not archive.exists() or archive.stat().st_size!=asset['size']:
        with client.stream('GET',asset['browser_download_url']) as r:
            r.raise_for_status();done=0;threshold=0
            with archive.open('wb') as f:
                for block in r.iter_bytes(1024*1024):
                    f.write(block);done+=len(block)
                    if done>=threshold:print(f'Downloaded {done//1048576} MiB',flush=True);threshold=done+100*1048576
    digest=hashlib.sha256()
    with archive.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):digest.update(b)
    declared=asset.get('digest')
    if declared and declared!='sha256:'+digest.hexdigest():raise ValueError('Ollama release digest mismatch')
    with zipfile.ZipFile(archive) as z:
        for item in z.infolist():
            target=(dest/item.filename).resolve()
            if not target.is_relative_to(dest.resolve()):raise ValueError('Unsafe runtime archive entry')
        z.extractall(dest)
    report={'version':meta['tag_name'],'asset':asset['browser_download_url'],'sha256':digest.hexdigest(),'publisher_digest':declared,'runtime_directory':str(dest),'models_directory':'C:/Users/Admin/.ollama/models','model_weights_downloaded':False}
    (out/'ollama_runtime.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print('Portable Ollama ready',flush=True)
