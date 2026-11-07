"""Inventory supplied Fit3D files; do not treat numerical annotations as KB advice."""
from pathlib import Path
from collections import Counter
import json
import cv2

ROOT=Path(__file__).resolve().parents[1]
data_root=ROOT.parents[2]
report={'scope':'Filesystem inventory and selected video metadata, not a training or accuracy evaluation.',
        'role':'Pose/rep evaluation data; not authoritative exercise instruction for RAG.', 'splits':{}}
for split in ['train','test']:
    root=data_root/('fit3d_'+split)/split
    subjects=sorted(p.name for p in root.iterdir() if p.is_dir())
    videos=sorted(root.rglob('*.mp4'))
    extensions=Counter(p.suffix for p in root.rglob('*') if p.is_file())
    examples=[]
    for term in ['squat','pushup']:
        selected=next((p for p in videos if term==p.stem.lower().replace('_','')),None)
        if selected is None:selected=next((p for p in videos if term in p.stem.lower().replace('_','')),None)
        if selected:
            cap=cv2.VideoCapture(str(selected))
            fps=cap.get(cv2.CAP_PROP_FPS);frames=cap.get(cv2.CAP_PROP_FRAME_COUNT)
            examples.append({'activity':term,'activity_filename':selected.stem,'path':str(selected),'opened':cap.isOpened(),
                'fps':fps,'frames':frames,'width':cap.get(cv2.CAP_PROP_FRAME_WIDTH),
                'height':cap.get(cv2.CAP_PROP_FRAME_HEIGHT),'duration_seconds':frames/fps if fps else None})
            cap.release()
    report['splits'][split]={'path':str(root),'subjects':subjects,'video_files':len(videos),
        'video_bytes':sum(p.stat().st_size for p in videos),'file_extensions':dict(extensions),
        'activities':dict(Counter(p.stem for p in videos)),
        'subjects_with_joints3d':[s for s in subjects if (root/s/'joints3d_25').is_dir()],
        'subjects_with_rep_annotations':[s for s in subjects if (root/s/'rep_ann.json').is_file()],
        'subjects_with_camera_parameters':[s for s in subjects if (root/s/'camera_parameters').is_dir()],
        'examples':examples}
report['subject_overlap']=sorted(set(report['splits']['train']['subjects']) & set(report['splits']['test']['subjects']))
report['limitations']=['No claim of pose-error labels from folder names.','No new train/test split or model training performed.',
    'Test video accuracy cannot be measured without appropriate reference annotations.',
    'A subject-disjoint folder listing does not prove the independence of earlier model-selection experiments.']
(ROOT/'artifacts/fit3d_inventory.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:{x:v[x] for x in ['subjects','video_files','subjects_with_joints3d','subjects_with_rep_annotations','examples']} for k,v in report['splits'].items()},ensure_ascii=False,indent=2))
