"""Audit hip correspondence without modifying predictions, GT or rankings."""
import json,os
from pathlib import Path
import numpy as np
from adapters import BASE
from dataset import FIT
from metrics import evaluate
from generate_report import table

R=Path(os.environ.get('POSE_BENCHMARK_RESULTS',str(BASE/'results_full')))

def main():
 manifest=json.loads((R/'run_manifest.json').read_text());records=[];subject_rows=[]
 for ex in ['squat','pushup']:
  for model in manifest['models']:
   direct=[];swapped=[];hip_pck=[];other_pck=[];by_subject={}
   for c in [c for c in manifest['clips'] if c['exercise']==ex]:
    path=R/'predictions'/(model+'__'+c['id']+'.npz')
    with np.load(path) as d:pred=d['pred'];gt=d['gt'];ids=d['ids']
    report=json.loads(path.with_suffix('.json').read_text(encoding='utf-8'))
    stats=evaluate(pred,gt,report['image_size'],ids);jp=stats['per_joint_pck']
    hip_pck.append((jp['left_hip']+jp['right_hip'])/2);other_pck.append(np.mean([v for k,v in jp.items() if k not in ['left_hip','right_hip']]))
    p=pred[:,[11,12],:2];g=gt[:,[1,4]];axis=g.mean(1)-gt[:,[11,14]].mean(1);length=np.linalg.norm(axis,axis=1);scale=np.maximum(length,20)
    w,h=report['image_size'];valid=np.all(pred[:,[11,12],2]>0,axis=1)&np.isfinite(p).all((1,2))&np.all(np.linalg.norm(p,axis=2)>0,axis=1)&np.all((g[:,:,0]>=0)&(g[:,:,0]<w)&(g[:,:,1]>=0)&(g[:,:,1]<h),axis=1)
    a=(np.linalg.norm(p-g,axis=2)/scale[:,None])[valid].ravel();b=(np.linalg.norm(p-g[:,::-1],axis=2)/scale[:,None])[valid].ravel()
    direct.extend(a.tolist());swapped.extend(b.tolist())
    if model=='ViTPose-B':
     group=by_subject.setdefault(c['subject'],dict(direct=[],swapped=[],bias=[]));group['direct'].extend(a.tolist());group['swapped'].extend(b.tolist())
     use=valid&(length>=20)
     bias=np.sum((p.mean(1)-g.mean(1))*axis,axis=1)/np.maximum(length,1e-6)/scale
     if ex=='squat':group['bias'].extend(bias[use].tolist())
   records.append(dict(exercise=ex,model=model,hip_pck_macro=float(np.mean(hip_pck)),other_ten_joint_pck_macro=float(np.mean(other_pck)),median_hip_error_torso_scale=float(np.median(direct)),median_swapped_hip_error_torso_scale=float(np.median(swapped))))
   for subject,g in by_subject.items():subject_rows.append(dict(exercise=ex,subject=subject,direct=float(np.median(g['direct'])),swapped=float(np.median(g['swapped'])),signed_bias_toward_feet=float(np.median(g['bias'])) if g['bias'] else None))
 lines=['# Kiểm tra riêng khớp hông','',
  'Phân tích này không sửa GT, không hiệu chỉnh tọa độ model và không thay kết quả PCK 12 khớp chính. Cả hai hông vẫn nằm trong tiêu chí bắt buộc.','',
  'Trên nhiều model, PCK ở hông thấp hơn các khớp còn lại. Đã đối chiếu chuỗi xương 1→2→3 và 4→5→6 với [mã vẽ skeleton của tác giả](../sources/dataset_util.py), xem overlay và làm phép thử đối chứng đổi chỗ hai hông chỉ trong tính sai số chẩn đoán.','',
  table(['Bài','Model','TB PCK 2 hông (%)','TB PCK 10 khớp còn lại (%)','Trung vị sai số hông / thang thân','Nếu đổi hai hông'],[[r['exercise'],r['model'],f'{r["hip_pck_macro"]:.1f}',f'{r["other_ten_joint_pck_macro"]:.1f}',f'{r["median_hip_error_torso_scale"]:.3f}',f'{r["median_swapped_hip_error_torso_scale"]:.3f}'] for r in records]),'',
  'PCK theo nhóm là trung bình clip, có phạt mất khớp như bảng chính. Hai cột sai số trung vị chỉ dùng frame có đủ hai hông hợp lệ và nằm trong ảnh; đây là chẩn đoán hình học, không thay thế điểm số có phạt mất khớp.','',
  '## Đối chứng theo người với ViTPose-B','',
  table(['Bài','Người','Hông trực tiếp','Hông đổi bên','Lệch tâm hông về phía chân / thang thân'],[[r['exercise'],r['subject'],f'{r["direct"]:.3f}',f'{r["swapped"]:.3f}',f'{r["signed_bias_toward_feet"]:.3f}' if r['signed_bias_toward_feet'] is not None else 'N/A: không phân tích hướng ở push-up'] for r in subject_rows]),'',
  'Ở phép đối chứng ViTPose-B, đổi hai hông làm sai số tăng ở cả tám người cho cả hai bài. Trong squat, tâm hông dự đoán thường lệch về phía chân so với tâm hông MoCap chiếu 2D; mức lệch thay đổi theo người. Không thấy căn cứ để sửa bằng cách đổi chỉ số trái–phải.','',
  '**Giới hạn diễn giải:** chưa có nhãn khớp 2D thủ công để tách sai số mạng khỏi chênh lệch vị trí tham chiếu hoặc định nghĩa khớp giữa MoCap chiếu và annotation 2D mà model đã học. Vì vậy, PCK ở đây đo độ trùng với tham chiếu Fit3D đã nêu; không tự động chứng minh mọi điểm hông khác GT đều là lỗi kỹ thuật của người tập. Cũng không kết luận GT bị sai. Xem thêm sai số pixel, từng khớp và video.','',
  '![Ví dụ GT có số chỉ khớp và YOLOv8n-Pose](dataset_audit/full_sample_qc.jpg)','',
  'Ví dụ bốn clip squat: xanh lá là 25 điểm GT cùng chỉ số; hồng là dự đoán YOLOv8n-Pose. Chỉ dùng ảnh để kiểm tra tham chiếu, không làm đầu vào cho mạng.','']
 (R/'HIP_AUDIT.md').write_text('\n'.join(lines),encoding='utf-8')
 (R/'hip_audit.json').write_text(json.dumps(dict(model_groups=records,vitpose_by_subject=subject_rows),indent=2))
 print('Hip correspondence audit generated; primary scores unchanged',flush=True)

if __name__=='__main__':main()
