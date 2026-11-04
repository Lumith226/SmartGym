"""Verify outputs and write a concise Vietnamese entry point."""
import json
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path
from adapters import BASE
from verify_results import main as verify

verify()
R=BASE/'results';ROOT=BASE.parent
summary=json.loads((R/'summary.json').read_text())
lines=['# Kết quả benchmark Fit3D','',
 'Toàn bộ mã benchmark, môi trường Python, trọng số tải thêm và đầu ra nằm trong thư mục này. Dự án SmartGym gốc không được sửa. Tracker và classifier dùng bản sao nguyên trạng trong `pose_benchmark/smartgym_reference/`.','',
 '**Phạm vi đã đo:** 10 checkpoint pretrained × 16 video squat/push-up, hai người s03/s04, bốn camera, lấy mẫu 25 fps. Tổng cộng 55.160 frame–model. Có 160 dòng kết quả, 10 biểu đồ và 8 video H.264 đối chiếu.','',
 '[Mở báo cáo đầy đủ](pose_benchmark/results/REPORT.md) · [Bảng CSV theo bài/model/camera](pose_benchmark/results/comparison_by_exercise_camera.csv) · [Kết quả kiểm tra](pose_benchmark/results/VERIFICATION.json)','',
 '| Bài | PCK cao nhất trong mẫu | Model đếm rep có MAE thấp nhất |','| --- | --- | --- |']
for ex,label in [('squat','Squat'),('pushup','Push-up')]:
 rows=summary[ex];best=max(rows,key=lambda x:x['pck']);minimum=min(x['mae'] for x in rows);ties=[x['model'] for x in rows if abs(x['mae']-minimum)<1e-8]
 name=', '.join(ties) if len(ties)<=3 else f'{len(ties)} model đồng hạng'
 lines.append(f'| {label} | {best["model"]}: {best["pck"]:.1f}% | {name}: {minimum:.2f} rep/clip |')
lines+=['',
 'PCK là độ chính xác vị trí 12 khớp chi theo ngưỡng 0,2 chiều dài thân, không phải độ chính xác nhận diện lỗi kỹ thuật. Các model đứng đầu PCK chênh nhau rất ít; xem giới hạn mẫu trong báo cáo.','',
 '**GPU:** các mạng pose và detector chạy bằng DirectML trên AMD Radeon RX 5600 XT. Classifier ST-GCN++ giữ CPU như cấu hình gốc trên máy này.','',
 '**Chưa có nhãn để chấm accuracy lỗi kỹ thuật:** mục này được ghi N/A; chỉ báo thêm đồng thuận dự đoán qua camera. Mẫu không phủ đầy đủ góc ngang 90°, góc đúng 45° hay thử thay độ cao camera.','',
 '## Xem nhanh','',
 '![Squat](pose_benchmark/results/figures/squat_summary.png)','',
 '![Push-up](pose_benchmark/results/figures/pushup_summary.png)','',
 'Các ảnh và video ghép 10 model nằm trong [comparisons](pose_benchmark/results/comparisons/). Nguồn checkpoint, hash và phiên bản thư viện ở [MODEL_PROVENANCE.json](pose_benchmark/results/MODEL_PROVENANCE.json).','',
 'Lặp lại quy trình: chạy `run_all.ps1` từ thư mục này. Không chạy các lệnh benchmark trong SmartGym gốc.','']
(ROOT/'KET_QUA.md').write_text('\n'.join(lines),encoding='utf-8')
readme=ROOT/'README.md';text=readme.read_text(encoding='utf-8')
text=text.replace('Environment and GPU path verified; geometry projection audit generated. Model preparation and validation are in progress. `gpu_smoke.json` contains smoke tests, not benchmark results. No model ranking has been established yet.','Completed and verified: 160 model/clip measurements, 55,160 pose frames, 10 figures, and 8 H.264 comparison videos. Start with [KET_QUA.md](KET_QUA.md) or [the full report](pose_benchmark/results/REPORT.md). `gpu_smoke.json` is GPU validation only; actual benchmark figures come from the measured results and separate live speed probes.')
readme.write_text(text,encoding='utf-8')
status={'status':'complete_for_documented_sample','finished_at':datetime.now(ZoneInfo('Asia/Bangkok')).isoformat(),'entry_point':str(ROOT/'KET_QUA.md'),'report':str(R/'REPORT.md'),'source_project_modified':False,'models':10,'clips':16,'subject_count':2,'exercises':['squat','pushup'],'limitations':['No matching form-error ground truth; form accuracy N/A','Camera-angle and height coverage incomplete','Fixed ST-GCN++ runs on CPU; pose/detector networks use GPU']}
(ROOT/'RUN_STATUS.json').write_text(json.dumps(status,ensure_ascii=False,indent=2),encoding='utf-8')
print('Workspace finalized')
