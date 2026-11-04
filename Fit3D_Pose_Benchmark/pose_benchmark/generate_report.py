"""Generate figures, tables and synchronized overlays from measured results."""
import argparse,csv,hashlib,json,math,os,subprocess
from collections import Counter,defaultdict
from pathlib import Path
import cv2,numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from adapters import BASE,MODELS,W
from dataset import COCO,FIT,NAMES
from metrics import evaluate
from camera_view import describe

R=Path(os.environ.get('POSE_BENCHMARK_RESULTS',str(BASE/'results')));F=R/'figures';V=R/'comparisons'
F.mkdir(exist_ok=True);V.mkdir(exist_ok=True)
LABELS={'squat':'Squat','pushup':'Push-up'}
COLORS=['#22d3ee','#60a5fa','#c084fc','#34d399','#fbbf24','#fb7185','#a3e635','#818cf8','#fb923c','#2dd4bf']
PAIRS=[(5,6),(5,7),(7,9),(6,8),(8,10),(5,11),(6,12),(11,12),(11,13),(13,15),(12,14),(14,16)]
plt.rcParams.update({'figure.facecolor':'#101523','axes.facecolor':'#182034','savefig.facecolor':'#101523','text.color':'#e2e8f0','axes.labelcolor':'#e2e8f0','xtick.color':'#cbd5e1','ytick.color':'#cbd5e1','axes.edgecolor':'#475569','font.size':10})

def mean(rows,key):return float(np.mean([x[key] for x in rows if x.get(key) is not None]))
def table(headers,rows):
 return '\n'.join(['| '+' | '.join(headers)+' |','| '+' | '.join(['---']*len(headers))+' |']+['| '+' | '.join(map(str,r))+' |' for r in rows])

class H264Writer:
 def __init__(self,path,fps,size):
  import imageio_ffmpeg
  self.path=path;self.temp=path.with_name(path.stem+'_encoding.mp4')
  proof=R/'amf_encoder_probe.json'
  supported=proof.exists() and json.loads(proof.read_text()).get('supported',False)
  self.encoder=os.environ.get('POSE_VIDEO_ENCODER','h264_amf' if supported else 'libx264')
  if self.encoder=='h264_amf':options=['-c:v','h264_amf','-quality','quality','-rc','cqp','-qp_i','18','-qp_p','18','-qp_b','18','-pix_fmt','nv12']
  elif self.encoder=='libx264':options=['-c:v','libx264','-preset','fast','-crf','20','-threads','2','-pix_fmt','yuv420p']
  else:raise ValueError('Unsupported H.264 encoder: '+self.encoder)
  self.process=subprocess.Popen([imageio_ffmpeg.get_ffmpeg_exe(),'-y','-loglevel','error','-f','rawvideo','-pixel_format','bgr24','-video_size',f'{size[0]}x{size[1]}','-framerate',str(fps),'-i','pipe:0','-an',*options,'-movflags','+faststart',str(self.temp)],stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
  self.metadata={'encoder':self.encoder,'options':options,'fps':fps,'size':size,'frames':0,'scope':'rendering only; has no effect on saved pose predictions or timing probes'}
 def isOpened(self):return self.process.poll() is None
 def write(self,frame):
  self.process.stdin.write(np.ascontiguousarray(frame).tobytes());self.metadata['frames']+=1
 def release(self):
  self.process.stdin.close()
  if self.process.wait(timeout=60)!=0:raise RuntimeError('H.264 encoder failed: '+str(self.path))
  self.temp.replace(self.path)
  self.path.with_suffix('.encoding.json').write_text(json.dumps(self.metadata,indent=2))

def charts(ex,rows,models):
 agg=[]
 for model in models:
  group=[r for r in rows if r['model']==model]
  agg.append(dict(model=model,pck=mean(group,'pck_torso_020_pct'),fps=mean(group,'pipeline_fps'),mae=float(np.mean([r['application']['rep_absolute_error'] for r in group])),jitter=mean(group,'error_jitter_torso_per_sample'),coverage=mean(group,'all_required_joints_correct_pct'),pixel_error=mean(group,'pixel_error_capped_image_diagonal'),missing=mean(group,'missing_joint_pct'),lr=mean(group,'lr_confusion_candidate_pct')))
 fig,axes=plt.subplots(1,3,figsize=(18,6),layout='constrained')
 labels=[a['model'] for a in agg];y=np.arange(len(labels))
 for ax,key,title,limit in [(axes[0],'pck','Joint accuracy: PCK@0.2 torso (%)',100),(axes[1],'fps','Pose pipeline FPS (mean across clips)',None),(axes[2],'mae','Rep count MAE (lower is better)',None)]:
  values=[a[key] for a in agg]
  ax.barh(y,values,color=COLORS);ax.set_yticks(y,labels if ax==axes[0] else ['']*len(y));ax.invert_yaxis();ax.set_title(title,pad=14)
  if limit:ax.set_xlim(0,limit+9)
  else:ax.set_xlim(0,max(values)*1.3+.1)
  offset=max(values)*.015+.002
  for i,val in enumerate(values):ax.text(val+offset,i,f'{val:.2f}' if key=='mae' else f'{val:.1f}',va='center',fontsize=9)
  ax.grid(axis='x',alpha=.15);ax.set_axisbelow(True)
 subjects=sorted({r['clip']['subject'] for r in rows})
 fig.suptitle(f'{LABELS[ex]} | {len(models)} pretrained pose models | {len(subjects)} people, {len(set(r["clip"]["camera"] for r in rows))} cameras | DirectML GPU',fontsize=16)
 fig.savefig(F/f'{ex}_summary.png',dpi=150);plt.close(fig)
 cams=sorted({r['clip']['camera'] for r in rows})
 values=np.array([[mean([r for r in rows if r['model']==m and r['clip']['camera']==c],'pck_torso_020_pct') for c in cams] for m in models])
 fig,ax=plt.subplots(figsize=(10,7),layout='constrained');im=ax.imshow(values,vmin=0,vmax=100,cmap='viridis',aspect='auto')
 ax.set_xticks(range(len(cams)),cams);ax.set_yticks(range(len(models)),models)
 for i in range(len(models)):
  for j in range(len(cams)):ax.text(j,i,f'{values[i,j]:.1f}',ha='center',va='center',color='black' if values[i,j]>60 else 'white')
 ax.set_title(f'{LABELS[ex]}: camera comparison, PCK@0.2 torso (%)\nCamera IDs are retained; no assumed 0/45/90 degree labels',pad=14)
 fig.colorbar(im,ax=ax,label='PCK (%)');fig.savefig(F/f'{ex}_cameras.png',dpi=150);plt.close(fig)
 values=np.full((len(models),5),np.nan)
 for i,m in enumerate(models):
  for category in range(5):
   group=[r for r in rows if r['model']==m and r['view_category']==category]
   if group:values[i,category]=mean(group,'pck_torso_020_pct')
 labels_view=['Front <30','Front oblique 30-60','Side 60-120','Rear oblique 120-150','Rear >150'] if ex=='squat' else ['Head end <30','Head oblique 30-60','Side 60-120','Feet oblique 120-150','Feet end >150']
 labels_view=[label+f'\n(n={len({r["clip"]["id"] for r in rows if r["view_category"]==category})})' for category,label in enumerate(labels_view)]
 fig,ax=plt.subplots(figsize=(12,7),layout='constrained');cmap=plt.get_cmap('viridis').copy();cmap.set_bad('#334155');im=ax.imshow(np.ma.masked_invalid(values),vmin=0,vmax=100,cmap=cmap,aspect='auto')
 ax.set_xticks(range(5),labels_view,rotation=15,ha='right');ax.set_yticks(range(len(models)),models)
 for i in range(len(models)):
  for j in range(5):
   v=values[i,j];ax.text(j,i,'N/A' if np.isnan(v) else f'{v:.1f}',ha='center',va='center',color='black' if np.isfinite(v) and v>60 else 'white')
 ax.set_title(f'{LABELS[ex]}: calibrated exercise-relative azimuth (degrees)\nPCK (%); N/A means no matching clip, not zero accuracy',pad=14)
 fig.colorbar(im,ax=ax);fig.savefig(F/f'{ex}_views.png',dpi=150);plt.close(fig)
 joint=np.array([[np.mean([r['per_joint_pck'][j] for r in rows if r['model']==m]) for j in NAMES] for m in models])
 fig,ax=plt.subplots(figsize=(15,7),layout='constrained');im=ax.imshow(joint,vmin=0,vmax=100,cmap='viridis',aspect='auto')
 ax.set_xticks(range(12),[x.replace('_',' ') for x in NAMES],rotation=40,ha='right');ax.set_yticks(range(len(models)),models)
 for i in range(len(models)):
  for j in range(12):ax.text(j,i,f'{joint[i,j]:.0f}',ha='center',va='center',fontsize=8,color='black' if joint[i,j]>60 else 'white')
 ax.set_title(f'{LABELS[ex]}: accuracy for each corresponding limb joint (%)',pad=14)
 fig.colorbar(im,ax=ax);fig.savefig(F/f'{ex}_joints.png',dpi=150);plt.close(fig)
 fig,axes=plt.subplots(1,3,figsize=(18,6),layout='constrained')
 for ax,key,title in [(axes[0],'jitter','Change in error / torso per sample'),(axes[1],'lr','Left/right confusion candidates (%)'),(axes[2],'missing','Missing coordinate outputs (%)')]:
  vals=[a[key] for a in agg];ax.barh(y,vals,color=COLORS);ax.set_yticks(y,labels if ax==axes[0] else ['']*len(y));ax.invert_yaxis();ax.set_title(title,pad=14);ax.set_xlim(0,max(vals)*1.3+.01);ax.grid(axis='x',alpha=.15);ax.set_axisbelow(True)
  for i,val in enumerate(vals):ax.text(val+max(vals)*.02+.001,i,f'{val:.3f}' if key=='jitter' else f'{val:.1f}',va='center',fontsize=9)
 fig.suptitle(f'{LABELS[ex]} | stability and observability | lower is better',fontsize=16)
 fig.savefig(F/f'{ex}_stability.png',dpi=150);plt.close(fig)
 return agg

def overlays(ex,rows,models):
 # Full run provides a synchronized comparison for every measured clip.
 outputs=[]
 refs={r['clip']['id']:r for r in rows if R.name=='results_full' or r['clip']['subject']=='s03'}
 for ref in [refs[k] for k in sorted(refs)]:
  cam=ref['clip']['camera'];subject=ref['clip']['subject']
  clip=ref['clip'];arrays={m:np.load(R/'predictions'/(m+'__'+clip['id']+'.npz')) for m in models}
  ids=arrays[models[0]]['ids'];gt=arrays[models[0]]['gt'];bounds=clip['rep_boundaries']
  predictions={m:arrays[m]['pred'] for m in models}
  for data in arrays.values():data.close()
  # Full run renders every evaluated sampled frame, including context.
  # The preserved pilot keeps its original short two-cycle illustrations.
  chosen=np.arange(len(ids)) if R.name=='results_full' else np.where((ids>=bounds[1])&(ids<=bounds[3]))[0]
  if not len(chosen):continue
  xy=gt[chosen].reshape(-1,2);low=xy.min(0);high=xy.max(0)
  center=(low+high)/2;side=max(high-low)*1.35;origin=np.floor(center-side/2).astype(int)
  side=int(math.ceil(side));tile=320
  def draw(frame,k,gt25,name,row):
   # Identical GT-derived display crop across all models, visualization only.
   canvas=np.zeros((side,side,3),np.uint8)
   h,w=frame.shape[:2];x0,y0=origin;x1,y1=x0+side,y0+side
   a,b=max(0,x0),max(0,y0);c,d=min(w,x1),min(h,y1)
   canvas[b-y0:d-y0,a-x0:c-x0]=frame[b:d,a:c]
   g=gt25[FIT]-origin;p=k[:,:2]-origin
   for a,b in PAIRS:
    if k[a,2]>.1 and k[b,2]>.1:
     cv2.line(canvas,tuple(p[a].astype(int)),tuple(p[b].astype(int)),(255,90,220),2,cv2.LINE_AA)
   for point in g:cv2.circle(canvas,tuple(point.astype(int)),3,(70,255,80),-1)
   for j,point in enumerate(p):
    if k[j,2]>.1:cv2.circle(canvas,tuple(point.astype(int)),4,(255,80,220),1)
   canvas=cv2.resize(canvas,(tile,tile))
   panel=np.full((tile+46,tile,3),(25,20,15),np.uint8)
   panel[46:]=canvas
   cv2.putText(panel,name,(8,18),cv2.FONT_HERSHEY_SIMPLEX,.48,(245,245,245),1,cv2.LINE_AA)
   cv2.putText(panel,f'clip: PCK {row["pck_torso_020_pct"]:.1f}% | reps {row["application"]["predicted_reps_in_annotated_window"]}/{row["application"]["gt_complete_intervals"]}',(8,37),cv2.FONT_HERSHEY_SIMPLEX,.42,(170,230,255),1,cv2.LINE_AA)
   return panel
  rowmap={r['model']:r for r in rows if r['clip']['id']==clip['id']}
  cap=cv2.VideoCapture(clip['video']);cap.set(cv2.CAP_PROP_POS_FRAMES,int(ids[chosen[0]]))
  stem=f'{subject}_{ex}_{cam}' if R.name=='results_full' else f'{ex}_{cam}'
  path=V/f'{stem}.mp4'
  playback_fps=ref['analysis_sampling_fps']
  writer=H264Writer(path,playback_fps,(tile*5,(tile+46)*2+52))
  if not writer.isOpened():raise RuntimeError('Cannot initialize video writer')
  current=int(ids[chosen[0]]);snap=None;mid=int(chosen[len(chosen)//2])
  for index in chosen:
   target=int(ids[index])
   while current<target:
    cap.grab();current+=1
   ok,frame=cap.read();current+=1
   if not ok:raise RuntimeError('Missing frame while rendering comparison')
   tiles=[draw(frame,predictions[m][index],gt[index],m,rowmap[m]) for m in models]
   grid=np.vstack([np.hstack(tiles[:5]),np.hstack(tiles[5:])])
   header=np.full((52,tile*5,3),(35,25,18),np.uint8)
   scope='full evaluated window' if R.name=='results_full' else 'two-cycle preview'
   cv2.putText(header,f'{LABELS[ex]} | {subject} | camera {cam} | source frame {target} | {scope}',(12,22),0,.6,(245,245,245),1,cv2.LINE_AA)
   cv2.putText(header,f'GREEN: Fit3D projection | MAGENTA: model (conf >0.1) | same frames/crop | source 50 fps, sampled {playback_fps:g} fps',(12,43),0,.47,(190,225,205),1,cv2.LINE_AA)
   rendered=np.vstack([header,grid]);writer.write(rendered)
   if index==mid:snap=rendered
  cap.release();writer.release()
  # Single-pass H.264/yuv420p and faststart; all evaluated frames retained.
  if snap is not None:cv2.imwrite(str(V/f'{stem}.jpg'),snap)
  outputs.append((cam,path.name))
  print('VIDEO',path.name,flush=True)
 return outputs

def main():
 manifest=json.loads((R/'run_manifest.json').read_text());models=manifest['models'];clipids={c['id'] for c in manifest['clips']}
 views={c['id']:describe(c) for c in manifest['clips']}
 speedrows=json.loads((R/'speed_results.json').read_text())
 speed={(s['model'],s['clip_id']):s for s in speedrows}
 if len(speed)!=len(models)*len(clipids):raise RuntimeError('Live pipeline speed measurement is incomplete')
 rows=[]
 for model in models:
  for clipid in sorted(clipids):
   path=R/'predictions'/(model+'__'+clipid+'.json')
   if not path.exists():raise RuntimeError('Benchmark incomplete: '+str(path))
   r=json.loads(path.read_text(encoding='utf-8'));data=np.load(path.with_suffix('.npz'))
   r.update(views[clipid])
   measured=speed[(model,clipid)]
   r['cached_detector_pipeline_fps_estimate']=r['pipeline_fps']
   r['pipeline_fps']=measured['pipeline_fps'];r['pipeline_latency_median_ms']=measured['pipeline_median_ms'];r['pipeline_latency_p95_ms']=measured['pipeline_p95_ms'];r['neural_latency_median_ms']=measured['neural_median_ms'];r['speed_probe_frames']=measured['frames']
   r['pipeline_fps_scope']='separate live sequential probe, 30 common sampled frames/clip; detector included for top-down; decoding, rendering and classifier excluded'
   stride=manifest['stride']
   boxdata=np.load(R/'predictions'/(clipid+f'__boxes_stride{stride}_warm.npz'))
   r['common_detector_missing_frame_pct']=float(100*np.mean(~np.isfinite(boxdata['boxes']).all(1)))
   # Recompute all joint metrics from raw saved predictions with the final
   # audited joint map, independent of early diagnostic reports.
   r.update(evaluate(data['pred'],data['gt'],r['image_size'],data['ids']))
   p=data['pred'][:,COCO,:2];g=data['gt'][:,FIT];valid=(data['pred'][:,COCO,2]>0)&np.isfinite(p).all(-1)&(np.linalg.norm(p,axis=-1)>0)
   err=np.linalg.norm(p-g,axis=-1);diag=np.linalg.norm(r['image_size'])
   r['pixel_error_capped_image_diagonal']=float(np.where(valid,np.minimum(err,diag),diag).mean())
   rows.append(r)
 # Cross-camera classifier agreement is descriptive, never form accuracy.
 groups=defaultdict(list)
 for r in rows:
  for i,pred in enumerate(r['application']['fixed_interval_predictions']):groups[(r['model'],r['clip']['subject'],r['clip']['exercise'],i)].append(pred['class_code'])
 agreement=defaultdict(list)
 for (model,subject,ex,i),labels in groups.items():
  if len(labels)==4:agreement[(model,ex)].append(Counter(labels).most_common(1)[0][1]/4)
 summaries={};video_paths={}
 for ex in ['squat','pushup']:
  subset=[r for r in rows if r['clip']['exercise']==ex]
  summaries[ex]=charts(ex,subset,models)
  for a in summaries[ex]:a['cross_camera_form_agreement_pct']=float(100*np.mean(agreement[(a['model'],ex)])) if agreement[(a['model'],ex)] else None
  video_paths[ex]=overlays(ex,subset,models)
 flat=[]
 for r in rows:
  a=r['application']
  flat.append(dict(exercise=r['clip']['exercise'],model=r['model'],subject=r['clip']['subject'],camera=r['clip']['camera'],relative_azimuth_deg=r['relative_azimuth_deg'],elevation_from_torso_deg=r['elevation_from_torso_deg'],view_label=r['view_label_vi'],frames=r['frame_count'],pck_torso_020_pct=r['pck_torso_020_pct'],mean_pixel_error=r['pixel_error_capped_image_diagonal'],jitter_torso_per_sample=r['error_jitter_torso_per_sample'],all_required_correct_pct=r['all_required_joints_correct_pct'],missing_joint_pct=r['missing_joint_pct'],lr_confusion_candidate_pct=r['lr_confusion_candidate_pct'],predicted_reps=a['predicted_reps_in_annotated_window'],gt_complete_intervals=a['gt_complete_intervals'],rep_abs_error=a['rep_absolute_error'],form_accuracy='N/A: no matching form labels',pipeline_fps=r['pipeline_fps'],pipeline_median_ms=r['pipeline_latency_median_ms'],pipeline_p95_ms=r['pipeline_latency_p95_ms'],neural_median_ms=r['neural_latency_median_ms']))
 with (R/'comparison_by_exercise_camera.csv').open('w',encoding='utf-8-sig',newline='') as f:
  writer=csv.DictWriter(f,fieldnames=list(flat[0]));writer.writeheader();writer.writerows(flat)
 (R/'summary.json').write_text(json.dumps(summaries,ensure_ascii=False,indent=2),encoding='utf-8')
 (R/'all_measured_results.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
 subjects=sorted({c['subject'] for c in manifest['clips']})
 total_frames=sum(r['frame_count'] for r in rows)
 scope=f'{len(manifest["clips"])} video, {len(subjects)} người ({", ".join(subjects)}), squat và push-up, mỗi bài 4 camera'
 lines=['# So sánh 10 bộ tìm khớp trên Fit3D','',
 f'**Phạm vi đo:** {scope}. Có {len(rows)} phép đo model–clip và {total_frames:,} frame–model. Đã dùng toàn bộ video train có calibration, khớp 3D và bài trùng tên với SmartGym trong thư mục dữ liệu hiện có. Chỉ đánh giá các đoạn có nhãn rep và thêm một giây ngữ cảnh hai đầu. Lấy một frame mỗi hai frame nguồn: 50 → 25 fps. Không huấn luyện/fine-tune; đây không phải toàn bộ 47 bài Fit3D hoặc tập test ẩn.','',
        '**Thiết bị:** AMD Radeon RX 5600 XT, ONNX Runtime DirectML. Mạng pose và detector chạy GPU; CPU làm tiền/hậu xử lý. ST-GCN++ cố định chạy CPU như ứng dụng gốc trên máy AMD. GPU profiles nằm trong `profiles/`; một số graph có toán tử shape/giải mã chạy CPU.','',
 '**Giữ cố định:** tracker, bộ xử lý khớp và classifier ST-GCN++ V2 của SmartGym. Mỗi dòng pose dùng một checkpoint pretrained cụ thể, FP32, một lần suy luận, không flip/multi-scale TTA. Các model top-down dùng chung detector YOLOv8n; FPS pipeline của chúng tính cả chi phí detector. Kết quả chỉ áp dụng cho các cấu hình này, không xếp hạng mọi kích thước trong từng họ model.','',
 '**Chất lượng khớp:** PCK@0.2 = phần trăm 12 khớp chi có khoảng cách đến khớp Fit3D chiếu 2D không vượt quá 20% thang chuẩn thân. Thang chuẩn = max(20 pixel, khoảng cách giữa trung điểm hai vai và trung điểm hai hông sau khi chiếu lên ảnh); mức sàn tránh chia cho đoạn thân gần bằng 0 ở góc bị thu ngắn. Không dùng các điểm đầu có định nghĩa giải phẫu khác nhau. Khớp không dự đoán được bị tính sai. Jitter đo thay đổi của sai số dự đoán so với chuyển động chuẩn, theo bước lấy mẫu 1/25 giây. PCK dùng chiều dài thân chiếu nên góc gây thu ngắn thân có thể làm ngưỡng pixel chặt hơn; cần xem thêm sai số pixel và video.','',
 '**Đếm rep:** số chu kỳ hoàn chỉnh giữa marker đầu và cuối trong `rep_ann.json` (số khoảng liên tiếp = số marker − 1). Không ép chấm buffer cuối video. Sai số đếm là sai số tuyệt đối so với các khoảng nhãn đó.','',
 '**Nhận diện lỗi:** N/A về độ chính xác vì không có nhãn bốn lớp lỗi tương ứng SmartGym trong dữ liệu này. Chỉ báo thêm mức đồng thuận dự đoán của cùng một rep qua bốn camera; đồng thuận cao không chứng minh dự đoán đúng. Không coi confidence là accuracy.','',
        '**Camera:** góc phương vị tương đối được tính từ tâm camera calibration và hướng cơ thể 3D trong đoạn có nhãn, lấy trung vị theo thời gian. Squat: 0° phía trước, 90° ngang, 180° phía sau. Push-up: 0° phía đầu, 90° ngang, 180° phía chân. Đây là quy ước theo bài; không suy ra góc từ ID camera. Các nhóm không có clip được ghi N/A. Mẫu chủ yếu có góc trước/sau, không đủ để kết luận về quay ngang 90°, góc đúng 45° hoặc thay đổi độ cao camera. Các bảng chính dùng ảnh gốc; thử che khuất nhân tạo được báo riêng trong phần bổ sung.','']
 lines += ['**Cấu hình cụ thể:** HRNet là W32; Lite-HRNet là bản 18; ViTPose-B là Base-Simple; MoveNet là Lightning; LitePose là Auto-S. Confidence của các họ model không được hiệu chỉnh về cùng xác suất; khi đưa vào classifier gốc, confidence chỉ được chặn về [0, 1].','',
  '**Dữ liệu frame đo tốc độ:** các frame nguồn được lưu thành mảng BGR uint8 lossless trong `speed_frame_cache/`, dùng cùng pixel cho mọi model. Đọc cache và copy frame hoàn tất trước khi bắt đầu tính giờ. Cache không resize, không nén JPEG và không dùng khớp chuẩn làm đầu vào mạng.','',
  '**Phủ góc quay:** các nhóm chéo chỉ có rất ít clip, lệch khoảng 30–34° so với trục trước/sau, chưa gần 45°. Nhóm góc có thành phần người khác nhau nên không đủ để quy chênh lệch chất lượng chỉ cho góc quay. Bảng bốn ID camera dùng cùng tám người, còn biểu đồ nhóm góc ghi số clip (n) để thấy mức phủ.','',
  '**Decoder LitePose:** dùng đỉnh heatmap cho một người, trung bình hai stage; chưa dùng bước nhóm nhiều người bằng associative embedding. Đây là một giới hạn của adapter đã đo, cần xét khi so sánh với pipeline LitePose đầy đủ. Không diễn giải kết quả này thành trần chất lượng của cả họ LitePose.','',
  '**Đo tốc độ:** lượt đo riêng dùng 30 frame phân bố đều trên mỗi clip, cùng frame cho 10 model, batch 1 và warm-up 5 lần. Detector chạy thật trong vùng tính giờ đối với model top-down. Không tính đọc/giải mã video, vẽ giao diện hoặc ST-GCN++. FPS vì vậy là throughput xử lý pose, không phải FPS toàn ứng dụng đang hiển thị. Các con số cộng từ thời gian detector đã lưu ở lượt accuracy chỉ là ước lượng và không dùng cho bảng tốc độ cuối.','',
  '**Sai số pixel:** dùng khoảng cách L2; khớp không dự đoán được bị phạt bằng đường chéo ảnh, và sai số quá lớn được chặn ở mức đó. Đây là tiêu chí có phạt mất khớp, không phải MPJPE trên riêng các khớp phát hiện được.','',
  '**Detector chung:** bảng dưới là tỷ lệ frame không tìm thấy người bằng YOLOv8n dùng chung cho top-down. Nó không áp dụng cho các model one-stage; cần đọc cùng kết quả PCK và tỷ lệ mất khớp.','']
 detector_rows=[]
 for clip in manifest['clips']:
  r=next(r for r in rows if r['clip']['id']==clip['id'])
  detector_rows.append([clip['subject'],LABELS[clip['exercise']],clip['camera'],f'{r["common_detector_missing_frame_pct"]:.1f}%'])
 lines += [table(['Người','Bài','Camera','Frame thiếu bbox'],detector_rows),'']
 for ex in ['squat','pushup']:
  agg=summaries[ex];subset=[r for r in rows if r['clip']['exercise']==ex]
  best=max(agg,key=lambda a:a['pck']);fast=max(agg,key=lambda a:a['fps']);repbest=min(agg,key=lambda a:a['mae'])
  second=sorted(agg,key=lambda a:a['pck'],reverse=True)[1]
  close_note=f' Hai model đầu chỉ chênh {best["pck"]-second["pck"]:.2f} điểm phần trăm PCK; xem thêm khoảng bất định theo người trong báo cáo bổ sung.' if best['pck']-second['pck']<1 else ''
  lines += [f'## {LABELS[ex]}','',f'Trong mẫu này, **{best["model"]}** có PCK trung bình cao nhất ({best["pck"]:.1f}%). **{fast["model"]}** đạt FPS pipeline trung bình cao nhất ({fast["fps"]:.1f}). Sai số đếm rep thấp nhất là {repbest["mae"]:.2f} rep/clip; có thể có nhiều model đồng hạng. Các tiêu chí được báo riêng, không gộp thành điểm tối ưu tùy ý.'+close_note,'',f'![So sánh {LABELS[ex]}](figures/{ex}_summary.png)','',
   table(['Model','PCK ↑ (%)','Sai số pixel ↓','Đủ 12 khớp đúng (%)','Jitter ↓','MAE rep ↓','FPS TB clip ↑','Đồng thuận lớp qua camera (%)'],[[a['model'],f'{a["pck"]:.1f}',f'{a["pixel_error"]:.1f}',f'{a["coverage"]:.1f}',f'{a["jitter"]:.3f}',f'{a["mae"]:.2f}',f'{a["fps"]:.1f}',f'{a["cross_camera_form_agreement_pct"]:.1f}' if a['cross_camera_form_agreement_pct'] is not None else 'N/A'] for a in agg]),'',
   f'![Camera {LABELS[ex]}](figures/{ex}_cameras.png)','',f'![Góc nhìn {LABELS[ex]}](figures/{ex}_views.png)','',f'![Từng khớp {LABELS[ex]}](figures/{ex}_joints.png)','',f'![Ổn định và mất khớp {LABELS[ex]}](figures/{ex}_stability.png)','',
   'Nghi đảo trái–phải là chỉ báo hình học: cặp dự đoán gần vị trí chuẩn đã đổi bên hơn đúng bên với biên 0,1 chiều dài thân; loại các cặp chuẩn gần chồng nhau. Đây là ứng viên nhầm bên, không phải nhãn lỗi thủ công. Mất đầu ra nghĩa là không có tọa độ hợp lệ/confidence dương; nó không thay thế tiêu chí đủ 12 khớp đúng.','',
   f'### Camera với {best["model"]} — chọn theo PCK trung bình của bài','']
  camrows=[]
  for cam in sorted({r['clip']['camera'] for r in subset}):
   group=[r for r in subset if r['model']==best['model'] and r['clip']['camera']==cam]
   stem=f's03_{ex}_{cam}' if R.name=='results_full' else f'{ex}_{cam}'
   camrows.append([cam,f'{mean(group,"relative_azimuth_deg"):.1f}°',f'{mean(group,"pck_torso_020_pct"):.1f}',f'{np.mean([r["application"]["rep_absolute_error"] for r in group]):.2f}',f'{mean(group,"pipeline_fps"):.1f}',f'[Ảnh s03](comparisons/{stem}.jpg) · [Video s03](comparisons/{stem}.mp4)'])
  best_camera=max(camrows,key=lambda row:float(row[2]))
  stem=f's03_{ex}_{best_camera[0]}' if R.name=='results_full' else f'{ex}_{best_camera[0]}'
  lines += [table(['Camera','Góc TB','PCK (%)','MAE rep','FPS','10 model trên cùng frame'],camrows),'',f'Với {best["model"]}, camera **{best_camera[0]}** có PCK cao nhất trong mẫu của bài ({best_camera[2]}%). Đây là so sánh các vị trí quay đang có, không phải kết luận tối ưu cho mọi góc quay.','',f'![Đối chiếu 10 model {LABELS[ex]}](comparisons/{stem}.jpg)','',
   f'Bảng số liệu tính toàn bộ {len(subjects)} người. Video xem trước gồm hai chu kỳ; số PCK và rep trên từng panel là kết quả toàn đoạn đánh giá của clip đó, không phải số rep đang chạy trong video. Chấm xanh lá: khớp Fit3D chiếu lên ảnh. Đường/chấm hồng: khớp model có confidence >0,1. Cùng frame và cùng vùng hiển thị cho cả 10 model; vùng cắt phục vụ hiển thị không được dùng làm đầu vào model. Video phát ở 25 fps đúng với lưới lấy mẫu.','']
  if R.name=='results_full':
   lines += ['### Toàn bộ video đối chiếu của bài','',table(['Người','Camera','10 model cùng video'],[[c['subject'],c['camera'],f'[Ảnh](comparisons/{c["id"]}.jpg) · [Video](comparisons/{c["id"]}.mp4)'] for c in manifest['clips'] if c['exercise']==ex]),'']
   hardest=min([r for r in subset if r['model']==best['model']],key=lambda r:r['pck_torso_020_pct'])
   hc=hardest['clip']
   lines += ['### Clip khó nhất đối với model đứng đầu PCK trung bình','',f'{best["model"]}: {hc["subject"]}, camera {hc["camera"]}, PCK {hardest["pck_torso_020_pct"]:.1f}%, sai số đếm {hardest["application"]["rep_absolute_error"]} rep. Đây là lựa chọn theo kết quả toàn đoạn, không phải chọn ảnh đẹp nhất; ảnh vẫn chỉ là một thời điểm minh họa.','',f'![Clip khó](comparisons/{hc["id"]}.jpg)','',f'[Xem video 10 model trên clip này](comparisons/{hc["id"]}.mp4)','']
 lines += ['## Kết quả chi tiết và giới hạn','',
 '[Cấu hình từng checkpoint và kích thước tensor](MODEL_CONFIG.md) · [Phần cứng và driver](HARDWARE.json)','',
 '[Bảng CSV theo bài, model, người và camera](comparison_by_exercise_camera.csv) · [Số liệu JSON đầy đủ](all_measured_results.json) · [Đo FPS trực tiếp](speed_results.json) · [Manifest lượt chạy](run_manifest.json) · [Nguồn trọng số và hash](MODEL_PROVENANCE.json) · [Kiểm tra GPU](gpu_smoke.json) · [Kiểm tra chuyển đổi](conversion_validation.json)','',
 f'Dữ liệu có {len(subjects)} người và hai bài phù hợp, chưa đủ để kết luận một model tốt nhất cho tất cả người tập, bài tập hoặc điều kiện quay. Các video squat có dụng cụ/tạ trong Fit3D có thể khác phân bố dữ liệu của classifier SmartGym. Những bài SmartGym chưa khớp tên trong Fit3D không được thay bằng warmup hay gán nhãn tùy ý.','',
 'Mã và trọng số của SmartGym, cùng dữ liệu Fit3D, chỉ được đọc. Toàn bộ môi trường, mã benchmark, checkpoint tải thêm và đầu ra ở thư mục Fit3D_Pose_Benchmark.','']
 (R/'REPORT.md').write_text('\n'.join(lines),encoding='utf-8')
 if R.name=='results_full':
  text=(R/'REPORT.md').read_text(encoding='utf-8').replace('Video xem trước gồm hai chu kỳ;','Video ghép hiển thị toàn bộ lưới frame của đoạn đánh giá, gồm ngữ cảnh một giây hai đầu;')
  (R/'REPORT.md').write_text(text,encoding='utf-8')
 print('REPORT GENERATED:',len(rows),'model/clip rows',flush=True)

if __name__=='__main__':main()
