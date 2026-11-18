"""Backup the current service and inspect providers, without printing secrets."""
from pathlib import Path
import hashlib,json,zipfile,sys
import httpx

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/six_exercises_20261117'
OUT.mkdir(parents=True,exist_ok=True)
backup=OUT/'before_update.zip'
if not backup.exists():
    paths=[*ROOT.glob('*.json')]
    for folder in ['kb_service','tests','scripts','model_contracts','data/index']:
        paths += [p for p in (ROOT/folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix in ['.py','.json']]
    manifest={}
    with zipfile.ZipFile(backup,'w',zipfile.ZIP_DEFLATED) as z:
        for p in sorted(set(paths)):
            name=p.relative_to(ROOT).as_posix();data=p.read_bytes()
            z.writestr(name,data);manifest[name]=hashlib.sha256(data).hexdigest()
    (OUT/'before_update_manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
sys.path.insert(0,str(ROOT))
from kb_service.config import Settings
s=Settings.from_env();report={'backup':str(backup),'configured_chat_model':s.chat_model,'configured_embed_model':s.embed_model}
with httpx.Client(timeout=5) as client:
    for key,url in [('ollama',s.ollama_url+'/api/tags'),('kb','http://127.0.0.1:8010/health'),('neo4j_http','http://127.0.0.1:7474')]:
        try:
            r=client.get(url);r.raise_for_status()
            report[key]={'http_status':r.status_code}
            if key=='ollama':report[key]['installed_models']=[x['name'] for x in r.json().get('models',[])]
            if key=='kb':report[key]['health']=r.json()
        except Exception as e:report[key]={'error_type':type(e).__name__}
(OUT/'provider_before.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
