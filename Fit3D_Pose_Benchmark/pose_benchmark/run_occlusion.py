"""Controlled synthetic occlusion, selected pose model per exercise.

Part B uses the model selected on Part A (highest macro clip PCK), not a new
classifier. This is an in-sample robustness probe, not an independent test.
Only 30 common frames per clip are used; rep counts are intentionally N/A.
"""
import gc,json,os,time
from pathlib import Path
import cv2,numpy as np
from adapters import BASE,W,Engine,Pose,get_box
from dataset import COCO,FIT
from metrics import evaluate
from run_speed import probe_frames
from generate_report import plt,table,LABELS

R=Path(os.environ.get('POSE_BENCHMARK_RESULTS',str(BASE/'results_full')))

def main():
 summary=json.loads((R/'summary.json').read_text());manifest=json.loads((R/'run_manifest.json').read_text())
 out=R/'occlusion';out.mkdir(exist_ok=True);records=[];detector=Engine(W/'yolov8n.onnx')
 for ex in LABELS:
  name=max(summary[ex],key=lambda a:a['pck'])['model'];model=Pose(name)
  topdown=model.kind in ['rtmpose','vitpose','heatmap','qai_heatmap','movenet']
  for clip in [c for c in manifest['clips'] if c['exercise']==ex]:
   path=out/(clip['id']+'.json')
   if path.exists():
    r=json.loads(path.read_text());assert r['model']==name;records.append(r);continue
   d=np.load(R/'predictions'/(name+'__'+clip['id']+'.npz'));indices=np.unique(np.linspace(0,len(d['ids'])-1,30,dtype=int));ids=d['ids'][indices];gt=d['gt'][indices]
   # Fixed image-space obstacle per clip, using GT solely to place the test
   # obstacle over the lower 30% of the projected person. No GT box is passed
   # to the detector/model. This creates synthetic visibility labels only.
   lo=gt.reshape(-1,2).min(0);hi=gt.reshape(-1,2).max(0)
   a=np.floor([lo[0]-5,lo[1]+.7*(hi[1]-lo[1])]).astype(int);b=np.ceil([hi[0]+5,hi[1]+5]).astype(int)
   pred=[];durations=[];miss=0;snap=None
   for i,f in enumerate(probe_frames(clip,ids)):
    h,w=f.shape[:2];x0,y0=np.maximum(a,0);x1,y1=np.minimum(b,[w,h]);masked=f.copy();masked[y0:y1,x0:x1]=[64,64,64]
    if i==0:
     for _ in range(5):model(masked,get_box(masked,detector) if topdown else None)
    start=time.perf_counter();box=get_box(masked,detector) if topdown else None;p=model(masked,box);durations.append((time.perf_counter()-start)*1000);pred.append(p)
    if topdown and box is None:miss+=1
    if i==len(ids)//2:snap=(f.copy(),masked.copy(),p.copy(),gt[i].copy())
   pred=np.array(pred);clean=d['pred'][indices];stats=evaluate(pred,gt,(w,h),ids);baseline=evaluate(clean,gt,(w,h),ids)
   g=gt[:,FIT];hidden=(g[:,:,0]>=x0)&(g[:,:,0]<x1)&(g[:,:,1]>=y0)&(g[:,:,1]<y1)
   torso=np.maximum(np.linalg.norm((gt[:,11]+gt[:,14]-gt[:,1]-gt[:,4])/2,axis=1),20)
   correct=(np.linalg.norm(pred[:,COCO,:2]-g,axis=-1)<=.2*torso[:,None])&(pred[:,COCO,2]>0)
   visible=(g[:,:,0]>=0)&(g[:,:,0]<w)&(g[:,:,1]>=0)&(g[:,:,1]<h)
   hidden&=visible;unhidden=visible&~hidden
   r=dict(model=name,clip=clip,frame_ids=ids.tolist(),rectangle_xyxy=[int(x0),int(y0),int(x1),int(y1)],clean_pck=baseline['pck_torso_020_pct'],occluded_pck=stats['pck_torso_020_pct'],delta_pck=stats['pck_torso_020_pct']-baseline['pck_torso_020_pct'],hidden_joint_pck=float(100*correct[hidden].mean()) if hidden.any() else None,unhidden_joint_pck=float(100*correct[unhidden].mean()) if unhidden.any() else None,hidden_joint_samples=int(hidden.sum()),total_inframe_joint_samples=int(visible.sum()),detector_missing_pct=100*miss/len(ids) if topdown else None,pipeline_fps=1000/float(np.mean(durations)),rep_mae=None,form_accuracy=None,occlusion='synthetic fixed rectangle covering lower 30% of projected full-body vertical extent; all source pixels retained outside it')
   np.savez_compressed(out/(clip['id']+'.npz'),ids=ids,pred=pred,clean_pred=clean,gt=gt,hidden=hidden)
   path.write_text(json.dumps(r,indent=2));records.append(r)
   if clip['subject']=='s03' and snap:
    f,masked,p,g=snap
    for pt in g[FIT]:cv2.circle(masked,tuple(pt.astype(int)),4,(50,255,50),-1)
    for pt in p:
     if pt[2]>.1:cv2.circle(masked,tuple(pt[:2].astype(int)),4,(255,80,220),1)
    cv2.imwrite(str(out/(clip['id']+'.jpg')),np.hstack([cv2.resize(f,(600,600)),cv2.resize(masked,(600,600))]))
   print('OCCLUSION',name,clip['id'],round(r['clean_pck'],1),'->',round(r['occluded_pck'],1),flush=True)
  del model;gc.collect()
 (out/'results.json').write_text(json.dumps(records,indent=2))
 lines=['# Kiểm tra che khuất nhân tạo','',
 'Chọn một model cho mỗi bài theo PCK trung bình cao nhất ở Phần A, giữ classifier/tracker như cũ. Mỗi clip dùng cùng 30 frame phân bố đều với phép đo tốc độ. Chạy lại detector trên ảnh đã che đối với model top-down; không cấp bbox chuẩn cho model.','',
 'Mỗi video có một hình chữ nhật xám cố định theo không gian ảnh, che 30% phần dưới của vùng cơ thể chiếu 2D. Vị trí vật cản được thiết kế bằng GT để có điều kiện kiểm tra tái lập; đó không phải đầu vào bbox của mạng. Đây là vật cản nhân tạo, không đại diện cho mọi kiểu tự che khuất hay camera thấp. Cột PCK sạch được đo lại trên chính 30 frame tương ứng, dùng dự đoán sạch đã lưu.','',
 '**Đếm rep và lỗi kỹ thuật trong thử nghiệm che khuất: N/A.** Lưới 30 frame rời rạc không có tần số thời gian phù hợp cho tracker gốc; chưa có nhãn lỗi. Kết quả này chỉ chấm vị trí khớp, mất detector và throughput pose. Model được chọn từ cùng mẫu, nên đây là kiểm tra độ bền trong mẫu, không phải tập kiểm định độc lập.','']
 for ex in LABELS:
  g=[r for r in records if r['clip']['exercise']==ex];clean=np.mean([r['clean_pck'] for r in g]);occ=np.mean([r['occluded_pck'] for r in g])
  lines += [f'## {LABELS[ex]} — {g[0]["model"]}','',f'PCK trung bình clip trên 30 frame: sạch **{clean:.1f}%**, có vật cản **{occ:.1f}%**, thay đổi **{occ-clean:+.1f} điểm phần trăm**.','',table(['Người','Camera','PCK sạch','PCK che','PCK khớp bị che','Frame mất detector (%)'],[[r['clip']['subject'],r['clip']['camera'],f'{r["clean_pck"]:.1f}',f'{r["occluded_pck"]:.1f}',f'{r["hidden_joint_pck"]:.1f}' if r['hidden_joint_pck'] is not None else 'N/A',f'{r["detector_missing_pct"]:.1f}' if r['detector_missing_pct'] is not None else 'N/A: one-stage'] for r in g]),'']
  fig,ax=plt.subplots(figsize=(9,5),layout='constrained');ax.bar(['Clean','Synthetic lower occlusion'],[clean,occ],color=['#22d3ee','#fb923c']);ax.set_ylim(0,110);ax.set_ylabel('PCK@0.2 torso (%)');ax.set_title(f'{LABELS[ex]} | {g[0]["model"]} | 32 clips, same 30 frames')
  for i,val in enumerate([clean,occ]):ax.text(i,val+2,f'{val:.1f}%',ha='center')
  fig.savefig(R/'figures'/f'{ex}_occlusion.png',dpi=150);plt.close(fig)
  lines += [f'![Che khuất](../figures/{ex}_occlusion.png)','']
  for r in g:
   if r['clip']['subject']=='s03':lines += [f'Camera {r["clip"]["camera"]}: ảnh gốc bên trái, vật cản + dự đoán bên phải.','',f'![Ví dụ]({r["clip"]["id"]}.jpg)','']
 (out/'REPORT.md').write_text('\n'.join(lines),encoding='utf-8')
 report=R/'REPORT.md';report.write_text(report.read_text(encoding='utf-8')+'\n\n## Điều kiện che khuất bổ sung\n\n[Kiểm tra vật cản nhân tạo trên cả 64 clip](occlusion/REPORT.md). Đây là thử nghiệm riêng; các bảng chính dùng ảnh gốc. Chưa có video để thử thay đổi độ cao camera hoặc góc ngang 90°.\n',encoding='utf-8')
 print('OCCLUSION FINISHED',len(records),flush=True)

if __name__=='__main__':main()
