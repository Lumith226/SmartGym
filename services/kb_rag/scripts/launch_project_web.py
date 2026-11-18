"""Start the existing video/chat web and bridge without exposing credentials."""
from pathlib import Path
from datetime import datetime
import json,os,socket,subprocess,sys
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from kb_service.config import Settings

workspace=ROOT.parents[2]
web_root=workspace/'SmartGym-Model/smart_gym_web_v4'
runtime=workspace/'SmartGym-Model/.runtime/python/python.exe'
logs=ROOT/'artifacts/local_runtime';logs.mkdir(parents=True,exist_ok=True)
for port in (8001,8080):
    with socket.socket() as connection:
        connection.settimeout(.5)
        if connection.connect_ex(('127.0.0.1',port))==0:
            raise RuntimeError(f'Port {port} is occupied; stop only the verified SmartGym process first.')
settings=Settings.from_env();child_env=os.environ.copy()
child_env.update(GYM_KB_RAG_URL='http://127.0.0.1:8010',GYM_KB_RAG_TOKEN=settings.internal_token,PYTHONIOENCODING='utf-8')
stamp=datetime.now().strftime('%Y%m%d_%H%M%S');processes=[]
for name,args,port in [('bridge',['-X','utf8','-m','server.app','--device','auto','--port','8001'],8001),
                       ('web',['-X','utf8','web/serve.py','--port','8080'],8080)]:
    stdout=logs/f'{name}_{stamp}.stdout.log';stderr=logs/f'{name}_{stamp}.stderr.log'
    with stdout.open('w',encoding='utf-8') as out,stderr.open('w',encoding='utf-8') as err:
        child=subprocess.Popen([str(runtime),*args],cwd=web_root,env=child_env,stdout=out,stderr=err,
            creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    processes.append({'service':name,'pid':child.pid,'port':port,'stdout':str(stdout),'stderr':str(stderr)})
(logs/'project_runtime.json').write_text(json.dumps({'started_at':stamp,'processes':processes},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'started':[(x['service'],x['pid'],x['port']) for x in processes],'web':'http://localhost:8080'},ensure_ascii=False))
