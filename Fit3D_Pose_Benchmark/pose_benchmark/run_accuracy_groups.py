"""Two disjoint model groups; final speed probes run only after both exit.

Accuracy execution times are diagnostic only. Published FPS comes from the
separate sequential speed pass, with no competing benchmark GPU process.
"""
import json,os,subprocess,sys,time
from datetime import datetime
from zoneinfo import ZoneInfo
from adapters import BASE,MODELS

R=BASE/'results_full';os.environ['POSE_BENCHMARK_RESULTS']=str(R)
manifest=json.loads((R/'run_manifest.json').read_text());groups=[list(MODELS)[:5],list(MODELS)[5:]]
assert len(list((R/'predictions').glob('*__boxes_stride2_warm.npz')))==64,'Finish common detector cache first'
workers=[]
for label,names in zip(['A','B'],groups):
 log=(R/f'accuracy_group_{label}.log').open('w',encoding='utf-8')
 args=[sys.executable,'-B','-u',str(BASE/'run_benchmark.py'),'--subjects','s05','s07','s08','s09','s10','s11','--stride','2','--preserve-manifest','--models',*names]
 p=subprocess.Popen(args,stdout=log,stderr=subprocess.STDOUT,env=os.environ.copy());workers.append((label,p,log));print('START GROUP',label,'pid',p.pid,'models',names,flush=True)
while True:
 counts={m:sum((R/'predictions'/(m+'__'+c['id']+'.json')).exists() for c in manifest['clips']) for m in manifest['models']}
 progress=dict(updated_at=datetime.now(ZoneInfo('Asia/Bangkok')).isoformat(),stage='gpu_accuracy',completed_rows=sum(counts.values()),expected_rows=640,rows_by_model=counts,workers={label:p.poll() for label,p,_ in workers},concurrent_accuracy_workers=2,published_speed_protocol='separate sequential pass after both accuracy workers exit')
 temp=R/'PROGRESS.partial';temp.write_text(json.dumps(progress,ensure_ascii=False,indent=2),encoding='utf-8');temp.replace(R/'PROGRESS.json')
 if all(p.poll() is not None for _,p,_ in workers):break
 time.sleep(10)
for label,p,log in workers:
 log.close();assert p.returncode==0,f'Group {label} failed with exit {p.returncode}'
check=subprocess.run([sys.executable,'-B',str(BASE/'check_full_matrix.py')],check=True,capture_output=True,text=True)
print(check.stdout,flush=True)
progress.update(stage='accuracy_complete');(R/'PROGRESS.json').write_text(json.dumps(progress,ensure_ascii=False,indent=2),encoding='utf-8')
print('BENCHMARK FINISHED',flush=True)
