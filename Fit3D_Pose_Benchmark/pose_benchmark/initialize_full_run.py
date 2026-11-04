"""Preserve the audited pilot and create the full matching-video run."""
import hashlib,json,shutil
from datetime import datetime
from zoneinfo import ZoneInfo
from adapters import BASE,W,MODELS
from dataset import clips
from application import source_hashes

old=BASE/'results';new=BASE/'results_full'
new.mkdir(exist_ok=True);(new/'predictions').mkdir(exist_ok=True)
pilot=json.loads((old/'VERIFICATION.json').read_text())
assert pilot['passed'] and pilot['model_clip_rows']==160
manifest=json.loads((old/'run_manifest.json').read_text())
assert manifest['source_hashes']==source_hashes(),'Pilot uses different fixed SmartGym sources'
provenance=json.loads((old/'MODEL_PROVENANCE.json').read_text(encoding='utf-8'))
for filename in ['adapters.py','dataset.py','metrics.py','application.py']:
 assert provenance['benchmark_code_hashes'][filename]==hashlib.sha256((BASE/filename).read_bytes()).hexdigest(),'Pilot processing changed: '+filename
for artifact in provenance['models']:
 assert artifact['sha256']==hashlib.sha256((W/MODELS[artifact['name']][0]).read_bytes()).hexdigest(),'Pilot model changed: '+artifact['name']
manifest.update(subjects=sorted({c['subject'] for c in clips()}),clips=list(clips()),source_hashes=source_hashes())
assert len(manifest['clips'])==64
manifest['reused_pilot']='160 audited model/clip predictions from results; original execution signatures retained'
manifest['form_labels']='User confirmed no verified form-error labels available'
manifest['protocol_version']='annotated_plus_50frames_v1'
for p in (old/'predictions').iterdir():
 if p.suffix in ['.npz','.json'] and not (new/'predictions'/p.name).exists():
  shutil.copy2(p,new/'predictions'/p.name)
for name in ['gpu_smoke.json','conversion_validation.json','reference_snapshot_validation.json','MODEL_PROVENANCE.json']:
 if (old/name).exists():shutil.copy2(old/name,new/name)
for name in ['profiles']:
 if (old/name).exists():shutil.copytree(old/name,new/name,dirs_exist_ok=True)
(new/'run_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
lineage={'pilot_verification':pilot,'pilot_manifest_sha256':hashlib.sha256((old/'run_manifest.json').read_bytes()).hexdigest(),'pilot_provenance':json.loads((old/'MODEL_PROVENANCE.json').read_text(encoding='utf-8'))}
(new/'PILOT_LINEAGE.json').write_text(json.dumps(lineage,ensure_ascii=False,indent=2),encoding='utf-8')
status={'status':'full_run_in_progress','started_at':datetime.now(ZoneInfo('Asia/Bangkok')).isoformat(),'models':len(manifest['models']),'clips_expected':64,'subjects':manifest['subjects'],'reused_model_clip_rows':160,'additional_model_clip_rows':480,'results_directory':str(new),'source_project_modified':False,'form_accuracy':'N/A: user confirmed no labels'}
(BASE.parent/'RUN_STATUS.json').write_text(json.dumps(status,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(status,ensure_ascii=False,indent=2))
