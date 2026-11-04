"""Verify the complete available-data run, then publish its local entry point."""
import hashlib,json,os,subprocess
from datetime import datetime
from zoneinfo import ZoneInfo
from adapters import BASE
from application import APP,source_hashes
from verify_results import main as verify

R=BASE/'results_full';ROOT=BASE.parent
assert os.environ.get('POSE_BENCHMARK_RESULTS')==str(R),'Full output directory must be selected explicitly'
verify()
manifest=json.loads((R/'run_manifest.json').read_text());summary=json.loads((R/'summary.json').read_text());audit=json.loads((R/'VERIFICATION.json').read_text())
pilot=json.loads((R/'PILOT_LINEAGE.json').read_text(encoding='utf-8'))['pilot_provenance']
current=json.loads((R/'MODEL_PROVENANCE.json').read_text(encoding='utf-8'))
assert {m['name']:m['sha256'] for m in pilot['models']}=={m['name']:m['sha256'] for m in current['models']},'Pilot/full checkpoints differ'
for name,digest in current['benchmark_code_hashes'].items():assert hashlib.sha256((BASE/name).read_bytes()).hexdigest()==digest,'Code changed after provenance capture: '+name
assert len(manifest['clips'])==64 and len(manifest['subjects'])==8 and audit['model_clip_rows']==640
speed=json.loads((R/'speed_results.json').read_text());assert len(speed)==640
sm={(s['model'],s['clip_id']):s for s in speed};rows=json.loads((R/'all_measured_results.json').read_text(encoding='utf-8'))
import numpy as np
for r in rows:
 d=np.load(R/'predictions'/(r['model']+'__'+r['clip']['id']+'.npz'));ids=d['ids'][np.unique(np.linspace(0,len(d['ids'])-1,30,dtype=int))]
 assert sm[r['model'],r['clip']['id']]['frame_ids']==ids.tolist()
occ=json.loads((R/'occlusion/results.json').read_text());assert len(occ)==64 and {r['clip']['id'] for r in occ}=={c['id'] for c in manifest['clips']}
for r in occ:
 d=np.load(R/'occlusion'/(r['clip']['id']+'.npz'));original_data=np.load(R/'predictions'/(r['model']+'__'+r['clip']['id']+'.npz'))
 indices=np.unique(np.linspace(0,len(original_data['ids'])-1,30,dtype=int))
 assert np.array_equal(d['ids'],original_data['ids'][indices]) and np.array_equal(d['clean_pred'],original_data['pred'][indices])
 assert np.isfinite(d['pred']).all() and d['pred'].shape==(len(indices),17,3)
 assert d['ids'].tolist()==sm[r['model'],r['clip']['id']]['frame_ids']
assert (R/'index.html').exists() and (R/'ANALYSIS.md').exists() and (R/'dataset_audit/SCOPE.md').exists()
original=ROOT.parent/'SmartGym/smart_gym_camera_app'
for name,digest in source_hashes().items():assert hashlib.sha256((original/name).read_bytes()).hexdigest()==digest
for p in (APP/'weights').glob('*.onnx'):assert hashlib.sha256(p.read_bytes()).digest()==hashlib.sha256((original/'weights'/p.name).read_bytes()).digest()
git=subprocess.run(['git','--no-optional-locks','-c','safe.directory=E:/do an/SmartGym','-C',str(ROOT.parent/'SmartGym'),'status','--short'],capture_output=True,text=True,check=True)
assert not git.stdout.strip(),'Original SmartGym has working-tree changes: '+git.stdout
fingerprints=[]
for c in manifest['clips']:
 record={'clip_id':c['id']}
 for k in ['video','camera_file','gt_file']:
  from pathlib import Path
  p=Path(c[k]);h=hashlib.sha256()
  with p.open('rb') as f:
   for block in iter(lambda:f.read(4*1024*1024),b''):h.update(block)
  record[k]={'path':str(p),'bytes':p.stat().st_size,'sha256':h.hexdigest()}
 fingerprints.append(record)
(R/'INPUT_FINGERPRINTS.json').write_text(json.dumps(fingerprints,indent=2))
lines=['# Kết quả benchmark đầy đủ trên dữ liệu phù hợp','',
 f'**Đã hoàn tất:** 10 checkpoint pretrained × 64 video của 8 người, gồm squat và chống đẩy ở bốn camera. Lấy mẫu 25 fps trong đoạn có nhãn rep và ngữ cảnh một giây hai đầu. Có 640 dòng đo, {audit["pose_frames_total"]:,} frame–model, {audit["figures"]} biểu đồ và 64 video H.264 ghép 10 model trên toàn bộ đoạn đánh giá. Thử che khuất nhân tạo dùng 30 frame/clip trên cả 64 clip. Không fine-tune.','',
 '[Mở trình xem tương tác](pose_benchmark/results_full/index.html) · [Báo cáo](pose_benchmark/results_full/REPORT.md) · [Bảng 80 dòng theo bài/model/camera](pose_benchmark/results_full/comparison_camera_summary.csv) · [640 dòng chi tiết](pose_benchmark/results_full/comparison_by_exercise_camera.csv) · [Kiểm tra kết quả](pose_benchmark/results_full/VERIFICATION.json)','',
 '| Bài | PCK trung bình cao nhất | MAE đếm rep thấp nhất |','| --- | --- | --- |']
for ex,label in [('squat','Squat'),('pushup','Chống đẩy')]:
 group=summary[ex];best=max(group,key=lambda a:a['pck']);minimum=min(a['mae'] for a in group);ties=[a['model'] for a in group if abs(a['mae']-minimum)<1e-8]
 lines.append(f'| {label} | {best["model"]}: {best["pck"]:.1f}% | {", ".join(ties)}: {minimum:.2f} rep/clip |')
lines += ['',
 'PCK chấm vị trí 12 khớp chi theo ngưỡng 0,2 chiều dài thân chiếu. Xem khoảng bootstrap theo người trong [ANALYSIS.md](pose_benchmark/results_full/ANALYSIS.md), nhất là khi hai model gần nhau. Chưa có cơ sở kết luận một họ model tốt nhất ở mọi kích thước và điều kiện.','',
 '**GPU:** pose và detector dùng DirectML trên AMD Radeon RX 5600 XT. Classifier ST-GCN++ cố định chạy CPU như ứng dụng gốc trên máy này. FPS gồm pose và detector cần thiết, chưa tính giải mã/hiển thị/classifier.','',
 '**Giới hạn dữ liệu:** người dùng xác nhận chưa có nhãn lỗi, nên accuracy nhận diện lỗi vẫn là N/A. Có số liệu đồng thuận lớp qua camera. Chưa có góc gần 45°, góc ngang 90° hoặc thử thay độ cao có kiểm soát; che khuất nhân tạo được báo riêng. Xem [phạm vi và mức đáp ứng từng tiêu chí](pose_benchmark/results_full/dataset_audit/SCOPE.md).','',
 '![Squat](pose_benchmark/results_full/figures/squat_summary.png)','',
 '![Chống đẩy](pose_benchmark/results_full/figures/pushup_summary.png)','',
 'Tất cả môi trường, checkpoint, mã và đầu ra ở thư mục Fit3D_Pose_Benchmark. SmartGym gốc có git status sạch; mã và trọng số đối chiếu hash trùng bản sao dùng đánh giá. Fit3D chỉ được đọc. Bộ thử 16 clip cũ vẫn giữ nguyên trong `pose_benchmark/results/`; kết quả đầy đủ ở `pose_benchmark/results_full/`.','',
 'Chạy lại hoặc tiếp tục: `run_all.ps1`. Bảng mẫu nhãn lỗi để trống trong `results_full/form_annotation_template.csv`; cần người kiểm chứng trước khi dùng chấm accuracy.','']
(ROOT/'KET_QUA.md').write_text('\n'.join(lines),encoding='utf-8')
status=dict(status='completed_available_data_evaluation',finished_at=datetime.now(ZoneInfo('Asia/Bangkok')).isoformat(),models=10,clips=64,subjects=manifest['subjects'],model_clip_rows=640,pose_frames_total=audit['pose_frames_total'],figures=audit['figures'],comparison_videos=64,synthetic_occlusion_clips=64,report=str(R/'REPORT.md'),viewer=str(R/'index.html'),source_project_modified=False,source_git_clean=True,data_constraints=['Form error accuracy N/A: user confirmed no verified labels','No near-45-degree clips; available oblique views are only about 30–34 degrees off the front/rear axis','No side-view 60–120 degree clips in calibrated matching data','No controlled camera height experiment'],classifier_provider='CPUExecutionProvider',pose_detector_provider='DmlExecutionProvider')
(ROOT/'RUN_STATUS.json').write_text(json.dumps(status,ensure_ascii=False,indent=2),encoding='utf-8')
readme=ROOT/'README.md';txt=readme.read_text(encoding='utf-8');start=txt.index('## Progress');end=txt.index('## Commands')
txt=txt[:start]+'## Progress\n\nCompleted on all 64 calibrated exact-match videos: 640 model/clip records, 64 comparison videos, subject-level uncertainty and a separate synthetic occlusion probe. Start with [KET_QUA.md](KET_QUA.md) or [the interactive viewer](pose_benchmark/results_full/index.html). The earlier 16-clip pilot is preserved in `pose_benchmark/results/`.\n\n'+txt[end:]
txt=txt.replace('The default measured sample is **s03 and s04, 16 clips**, sampled at 25 fps from the annotated repetition windows. The 64 matching clips are the available pool, not the current evaluation sample. The report explicitly states this distinction. Predictions are cached with a signature of the model and processing code so the run can resume.','The default full run covers all **8 subjects and 64 matching calibrated clips**, at 25 fps in annotated windows plus one second of context at both ends. It reuses 160 audited pilot model/clip records without changing their original execution signatures, and adds the remaining 480. Raw predictions, lineage and fingerprints make this reuse reviewable. Results remain resume-safe.')
txt=txt.replace('- Outputs and GPU profiles: `pose_benchmark/results/`','- Full outputs and GPU profiles: `pose_benchmark/results_full/`\n- Preserved pilot: `pose_benchmark/results/`')
txt=txt.replace('`pose_benchmark/results/MODEL_PROVENANCE.json`','`pose_benchmark/results_full/MODEL_PROVENANCE.json`')
readme.write_text(txt,encoding='utf-8');print(json.dumps(status,ensure_ascii=False,indent=2))
