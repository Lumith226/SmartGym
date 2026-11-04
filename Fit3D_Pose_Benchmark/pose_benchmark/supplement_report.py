"""Subject-level uncertainty, detailed camera tables and a local HTML viewer."""
import csv,html,json,os
from collections import Counter
from pathlib import Path
import numpy as np
from adapters import BASE
from dataset import COCO,FIT
from generate_report import LABELS,COLORS,plt,table

R=Path(os.environ.get('POSE_BENCHMARK_RESULTS',str(BASE/'results_full')))

def main():
 rows=json.loads((R/'all_measured_results.json').read_text(encoding='utf-8'))
 manifest=json.loads((R/'run_manifest.json').read_text());models=manifest['models'];subjects=manifest['subjects']
 pose_summary=json.loads((R/'summary.json').read_text())
 rng=np.random.default_rng(20261030);resamples=rng.integers(0,len(subjects),(10000,len(subjects)))
 summaries={};camera_summary=[];lines=['# Phân tích theo người và camera','',
 'Các số tổng hợp là trung bình theo clip. Khoảng 95% bên dưới là bootstrap theo **người** (10.000 lần, seed 20261030): lấy mẫu lại người và giữ bốn camera đi cùng. Bốn góc quay cùng một chuyển động không được coi là bốn người độc lập. Với chỉ tám người, khoảng này vẫn chỉ mang tính thăm dò; dữ liệu đang được dùng để so sánh và chọn model, không phải kiểm định độc lập.','']
 for ex in LABELS:
  subset=[r for r in rows if r['clip']['exercise']==ex];agg=[]
  for m in models:
   group=[r for r in subset if r['model']==m]
   pck=np.array([np.mean([r['pck_torso_020_pct'] for r in group if r['clip']['subject']==s]) for s in subjects])
   mae=np.array([np.mean([r['application']['rep_absolute_error'] for r in group if r['clip']['subject']==s]) for s in subjects])
   ci=np.percentile(pck[resamples].mean(1),[2.5,97.5]);mc=np.percentile(mae[resamples].mean(1),[2.5,97.5])
   agg.append(dict(model=m,pck=float(pck.mean()),pck_ci=ci.tolist(),rep_mae=float(mae.mean()),rep_mae_ci=mc.tolist(),subject_pck=pck.tolist(),exact_rep_count_pct=100*sum(r['application']['rep_absolute_error']==0 for r in group)/len(group)))
  summaries[ex]=agg;fig,ax=plt.subplots(figsize=(12,7),layout='constrained')
  for i,a in enumerate(agg):
   ax.plot(a['pck_ci'],[i,i],color=COLORS[i],lw=3);ax.scatter(a['pck'],i,color=COLORS[i],s=65,zorder=3)
   ax.text(101,i,f'{a["pck"]:.1f} [{a["pck_ci"][0]:.1f}, {a["pck_ci"][1]:.1f}]',va='center',fontsize=9)
  ax.set_yticks(range(len(models)),models);ax.invert_yaxis();ax.set_xlim(0,127);ax.set_xticks([0,20,40,60,80,100]);ax.grid(axis='x',alpha=.15)
  ax.set_xlabel('PCK@0.2 torso (%)');ax.set_title(f'{LABELS[ex]} | 95% bootstrap interval by person | {len(subjects)} people',pad=15)
  fig.savefig(R/'figures'/f'{ex}_uncertainty.png',dpi=150);plt.close(fig)
  fig,axes=plt.subplots(1,2,figsize=(19,7),layout='constrained');y=np.arange(len(models))
  values=[next(a['cross_camera_form_agreement_pct'] for a in pose_summary[ex] if a['model']==m) for m in models]
  axes[0].barh(y,values,color=COLORS);axes[0].set_xlim(0,110);axes[0].set_yticks(y,models);axes[0].invert_yaxis();axes[0].set_title('Agreement across 4 cameras (%) | NOT accuracy',pad=16)
  for i,val in enumerate(values):axes[0].text(val+1,i,f'{val:.1f}',va='center',fontsize=9)
  distributions={m:Counter(p['class_code'] for r in subset if r['model']==m for p in r['application']['fixed_interval_predictions']) for m in models}
  classes=sorted({c for d in distributions.values() for c in d});left=np.zeros(len(models))
  for i,c in enumerate(classes):
   v=np.array([100*distributions[m][c]/max(sum(distributions[m].values()),1) for m in models]);axes[1].barh(y,v,left=left,label=c,color=COLORS[(i+3)%len(COLORS)]);left+=v
  axes[1].set_xlim(0,100);axes[1].set_yticks(y,['']*len(models));axes[1].invert_yaxis();axes[1].set_title('Predicted class distribution (%) | unverified',pad=16);axes[1].legend(loc='upper left',bbox_to_anchor=(1.01,1),fontsize=9)
  fig.suptitle(f'{LABELS[ex]} | fixed SmartGym classifier | no verified form labels',fontsize=15);fig.savefig(R/'figures'/f'{ex}_form_stability.png',dpi=150);plt.close(fig)
  ranked=sorted(agg,key=lambda a:a['pck'],reverse=True);delta=np.array(ranked[0]['subject_pck'])-np.array(ranked[1]['subject_pck']);dci=np.percentile(delta[resamples].mean(1),[2.5,97.5])
  lines += [f'## {LABELS[ex]}','',f'![Khoảng bất định](figures/{ex}_uncertainty.png)','',f'![Đồng thuận lớp qua camera](figures/{ex}_form_stability.png)','',
   'Đồng thuận là tỷ lệ camera theo lớp phổ biến nhất của cùng rep, rồi trung bình qua các rep. Đồng thuận có thể cao khi model luôn đoán một lớp; xem cả phân bố lớp bên phải. Chưa biết các dự đoán này đúng hay sai vì chưa có nhãn đối chiếu.','',table(['Model','PCK TB [95%]','MAE rep [95%]','Clip đếm đúng số rep (%)'],[[a['model'],f'{a["pck"]:.2f} [{a["pck_ci"][0]:.2f}, {a["pck_ci"][1]:.2f}]',f'{a["rep_mae"]:.2f} [{a["rep_mae_ci"][0]:.2f}, {a["rep_mae_ci"][1]:.2f}]',f'{a["exact_rep_count_pct"]:.1f}'] for a in agg]),'',
   f'Chênh PCK ghép cặp giữa {ranked[0]["model"]} và {ranked[1]["model"]}: {delta.mean():.2f} điểm %, khoảng bootstrap [{dci[0]:.2f}, {dci[1]:.2f}]. '+('Khoảng chứa 0; chưa có bằng chứng rõ để phân biệt hai model đứng đầu trong nhóm người này.' if dci[0]<=0<=dci[1] else 'Khoảng này chỉ mô tả mẫu đang có; chưa chứng minh ưu thế trên tập độc lập.'),'',
   '### Đúng mẫu bảng yêu cầu: từng model và camera','']
  camrows=[]
  for m in models:
   for cam in sorted({r['clip']['camera'] for r in subset}):
    g=[r for r in subset if r['model']==m and r['clip']['camera']==cam]
    camera_summary.append(dict(exercise=ex,model=m,camera=cam,subjects=len({r['clip']['subject'] for r in g}),clips=len(g),mean_relative_azimuth_deg=float(np.mean([r['relative_azimuth_deg'] for r in g])),pck_torso_020_pct=float(np.mean([r['pck_torso_020_pct'] for r in g])),mean_pixel_error=float(np.mean([r['pixel_error_capped_image_diagonal'] for r in g])),all_required_correct_pct=float(np.mean([r['all_required_joints_correct_pct'] for r in g])),rep_mae=float(np.mean([r['application']['rep_absolute_error'] for r in g])),exact_rep_count_pct=100*sum(r['application']['rep_absolute_error']==0 for r in g)/len(g),form_accuracy='N/A: no verified form labels',pipeline_fps_mean_across_clips=float(np.mean([r['pipeline_fps'] for r in g])),pipeline_median_ms_mean_across_clips=float(np.mean([r['pipeline_latency_median_ms'] for r in g])),pipeline_p95_ms_mean_across_clips=float(np.mean([r['pipeline_latency_p95_ms'] for r in g]))))
    camrows.append([LABELS[ex],m,cam,f'{np.mean([r["relative_azimuth_deg"] for r in g]):.1f}°',f'{np.mean([r["pck_torso_020_pct"] for r in g]):.1f}%',f'{np.mean([r["application"]["rep_absolute_error"] for r in g]):.2f} MAE','N/A: chưa có nhãn',f'{np.mean([r["pipeline_fps"] for r in g]):.1f}'])
  lines += [table(['Bài tập','Mô hình tìm khớp','Camera','Góc tương đối TB','Chất lượng khớp','Đếm lượt','Nhận diện lỗi','FPS'],camrows),'']
  # Separate threshold sensitivity from one arbitrary operating threshold.
  thresholds=np.array([.05,.1,.15,.2,.3,.4,.5]);curve=[];detector_rows=[]
  for m in models:
   values=[];conditioned=[]
   for r in [r for r in subset if r['model']==m]:
    cid=r['clip']['id'];d=np.load(R/'predictions'/(m+'__'+cid+'.npz'));p=d['pred'][:,COCO,:2];g=d['gt'][:,FIT];conf=d['pred'][:,COCO,2]
    w,h=r['image_size'];valid=(g[:,:,0]>=0)&(g[:,:,0]<w)&(g[:,:,1]>=0)&(g[:,:,1]<h)
    finite=np.isfinite(p).all(2)&(conf>0)&(np.linalg.norm(p,axis=2)>0)
    torso=np.maximum(np.linalg.norm((g[:,0]+g[:,1]-g[:,6]-g[:,7])/2,axis=1),20)
    distance=np.linalg.norm(p-g,axis=2)/torso[:,None]
    values.append([100*np.sum((distance<=t)&finite&valid)/max(valid.sum(),1) for t in thresholds])
    b=np.load(R/'predictions'/(cid+f'__boxes_stride{manifest["stride"]}_warm.npz'));found=np.isfinite(b['boxes']).all(1)
    v=valid&found[:,None]
    if v.any():conditioned.append(100*np.sum((distance<=.2)&finite&v)/v.sum())
   curve.append(np.mean(values,axis=0).tolist());detector_rows.append([m,f'{np.mean(conditioned):.1f}' if conditioned else 'N/A'])
  fig,ax=plt.subplots(figsize=(11,6),layout='constrained')
  for i,m in enumerate(models):ax.plot(thresholds*100,curve[i],label=m,color=COLORS[i],marker='o',markersize=4)
  ax.set_ylim(0,100);ax.set_xlabel('Allowed joint error (% of projected torso length)');ax.set_ylabel('PCK (%)');ax.set_title(f'{LABELS[ex]} | sensitivity to matching threshold');ax.grid(alpha=.15);ax.legend(loc='upper left',bbox_to_anchor=(1.01,1))
  fig.savefig(R/'figures'/f'{ex}_thresholds.png',dpi=150);plt.close(fig)
  values=np.array([a['subject_pck'] for a in agg]);fig,ax=plt.subplots(figsize=(12,7),layout='constrained');im=ax.imshow(values,vmin=0,vmax=100,cmap='viridis',aspect='auto');ax.set_xticks(range(len(subjects)),subjects);ax.set_yticks(range(len(models)),models)
  for i in range(len(models)):
   for j in range(len(subjects)):ax.text(j,i,f'{values[i,j]:.1f}',ha='center',va='center',color='black' if values[i,j]>60 else 'white',fontsize=9)
  ax.set_title(f'{LABELS[ex]} | PCK by person, averaged over 4 cameras');fig.colorbar(im,ax=ax,label='PCK (%)');fig.savefig(R/'figures'/f'{ex}_subjects.png',dpi=150);plt.close(fig)
  lines += ['### Độ nhạy ngưỡng và khác biệt giữa người','',f'![Độ nhạy](figures/{ex}_thresholds.png)','',f'![Theo người](figures/{ex}_subjects.png)','',
   'PCK thay đổi theo ngưỡng và độ thu ngắn thân chiếu. Đường cong dùng cùng một lưới GT và phạt đầu ra mất khớp; bảng chính giữ ngưỡng 0,2 để nhất quán. Không dùng GT để sửa tọa độ hoặc đổi trái–phải của dự đoán.','',
   'Bảng sau chỉ giữ những frame mà detector chung tìm được bbox, áp dụng cùng mặt nạ frame cho cả 10 model. Bảng này giúp tách bớt ảnh hưởng mất detector nhưng có thiên lệch về frame dễ; không thay thế kết quả toàn clip và không chứng minh model pose độc lập tốt hơn.','',table(['Model','PCK@0.2 khi detector chung có bbox (%)'],detector_rows),'']
 (R/'subject_uncertainty.json').write_text(json.dumps(summaries,indent=2))
 with (R/'comparison_camera_summary.csv').open('w',encoding='utf-8-sig',newline='') as f:
  w=csv.DictWriter(f,fieldnames=list(camera_summary[0]));w.writeheader();w.writerows(camera_summary)
 (R/'ANALYSIS.md').write_text('\n'.join(lines),encoding='utf-8')
 # One annotation row per physical repetition, with all synchronized views.
 template=[]
 for c in manifest['clips']:
  if c['camera']!=sorted({x['camera'] for x in manifest['clips']})[0]:continue
  classes='CORRECT|BACK_ROUNDING|KNEE_ALIGNMENT|SHALLOW_DEPTH' if c['exercise']=='squat' else 'CORRECT|SHALLOW_DEPTH|HIP_ALIGNMENT|HAND_PLACEMENT'
  for i,(a,b) in enumerate(zip(c['rep_boundaries'][:-1],c['rep_boundaries'][1:])):
   record=dict(subject=c['subject'],exercise=c['exercise'],rep_index=i,start_frame=a,end_frame=b,start_seconds=a/50,end_seconds=b/50,label='',allowed_labels=classes,reviewer='',review_notes='')
   for v in manifest['clips']:
    if (v['subject'],v['exercise'])==(c['subject'],c['exercise']):record['video_'+v['camera']]=v['video']
   template.append(record)
 template_path=R/'form_annotation_template.csv'
 if not template_path.exists():
  with template_path.open('w',encoding='utf-8-sig',newline='') as f:
   w=csv.DictWriter(f,fieldnames=list(template[0]));w.writeheader();w.writerows(template)
 make_viewer(rows,manifest)
 report=R/'REPORT.md';text=report.read_text(encoding='utf-8')
 text+='\n\n## Xem và kiểm tra thêm\n\n[Mở trình xem tương tác](index.html) · [Khoảng bất định và bảng đầy đủ theo camera](ANALYSIS.md) · [Phạm vi bài và điều kiện quay](dataset_audit/SCOPE.md) · [Mẫu gán nhãn lỗi thủ công](form_annotation_template.csv).\n\nMẫu nhãn để trống, mỗi hàng là một rep vật lý với đường dẫn bốn camera. Chỉ điền nhãn sau khi người có chuyên môn kiểm tra video; không dùng nhãn dự đoán hoặc ngưỡng góc làm ground truth.\n'
 report.write_text(text,encoding='utf-8')
 from audit_hips import main as audit_hips
 audit_hips()
 report.write_text(report.read_text(encoding='utf-8')+'\n\n[Kiểm tra riêng khớp hông và giới hạn tham chiếu 2D](HIP_AUDIT.md). Phân tích này không sửa GT hoặc kết quả chính.\n',encoding='utf-8')
 print('Supplemental analysis and viewer generated',len(template),'unlabeled rep intervals',flush=True)

def make_viewer(rows,manifest):
 payload=[dict(exercise=r['clip']['exercise'],subject=r['clip']['subject'],camera=r['clip']['camera'],id=r['clip']['id'],model=r['model'],pck=r['pck_torso_020_pct'],rep=r['application']['predicted_reps_in_annotated_window'],gt=r['application']['gt_complete_intervals'],mae=r['application']['rep_absolute_error'],fps=r['pipeline_fps'],p95=r['pipeline_latency_p95_ms'],jitter=r['error_jitter_torso_per_sample'],missing=r['missing_joint_pct'],angle=r['relative_azimuth_deg']) for r in rows]
 page='''<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fit3D · So sánh 10 model</title>
<style>:root{color-scheme:dark}*{box-sizing:border-box}body{font:16px system-ui;margin:0;background:#0e1422;color:#e6edf7}main{max-width:1600px;margin:auto;padding:28px}h1{font-size:30px;margin:0 0 8px}p{line-height:1.6;color:#b7c6da}a{color:#65d5ed}header{margin-bottom:25px}.filters{display:flex;gap:18px;flex-wrap:wrap;margin:22px 0}label{display:grid;gap:7px}select{font:inherit;padding:9px 14px;border:1px solid #3a4b66;border-radius:8px;background:#182339}.card{background:#172238;border:1px solid #2d3d57;border-radius:12px;padding:18px;margin:20px 0}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-size:14px;white-space:nowrap}td,th{text-align:left;padding:11px;border-bottom:1px solid #2c3a51}th{color:#9fdbed}video,img{display:block;width:100%;height:auto;border-radius:8px}.note{color:#f8d18d;font-size:14px}.links{display:flex;gap:18px;flex-wrap:wrap}.bar{height:5px;background:#3cc9d9;margin-top:5px;border-radius:3px}summary{cursor:pointer;padding:12px}#scope{font-size:14px}footer{padding:18px 0;color:#9aaec8}</style>
<main><header><h1>So sánh 10 bộ tìm khớp · Fit3D</h1><p>64 video · 8 người · Squat & chống đẩy · 4 camera · pretrained FP32 · GPU DirectML</p><div class="links"><a href="REPORT.md">Báo cáo phương pháp</a><a href="ANALYSIS.md">Bất định & bảng theo camera</a><a href="comparison_by_exercise_camera.csv">Tải bảng CSV</a><a href="dataset_audit/SCOPE.md">Phạm vi dữ liệu</a></div></header>
<p class="note">Nhận diện lỗi: chưa có nhãn đối chiếu nên accuracy là N/A. Đồng thuận giữa camera không chứng minh model đoán đúng. FPS chỉ tính pose và detector cần thiết; không gồm giải mã, hiển thị hoặc classifier ST-GCN++ trên CPU.</p>
<div class="filters"><label>Bài tập<select id="ex"><option value="squat">Squat</option><option value="pushup">Chống đẩy</option></select></label><label>Người tập<select id="sub"></select></label><label>Camera<select id="cam"></select></label></div>
<section class="card"><h2>Kết quả trên cùng clip</h2><p id="scope"></p><div class="scroll"><table><thead><tr><th>Model</th><th>PCK ↑</th><th>Rep / GT</th><th>Sai số rep ↓</th><th>Jitter ↓</th><th>Mất khớp ↓</th><th>FPS ↑</th><th>p95 (ms) ↓</th><th>Lỗi kỹ thuật</th></tr></thead><tbody id="body"></tbody></table></div></section>
<section class="card"><h2>10 model trên cùng frame</h2><p>Xanh lá: khớp chuẩn Fit3D chiếu 2D. Hồng: dự đoán. Video xem trước hai chu kỳ; PCK và rep ở nhãn panel thuộc toàn đoạn đánh giá.</p><video id="video" controls preload="metadata"></video><details><summary>Ảnh đối chiếu tĩnh</summary><img id="still" alt="Đối chiếu dự đoán 10 model"></details></section>
<section class="card"><h2>So sánh tổng hợp của bài</h2><p>Tính trên cả 8 người và 4 camera; xem khoảng bootstrap theo người khi hai model gần nhau.</p><img id="summary" alt="Biểu đồ tổng hợp"><details><summary>Khoảng bất định theo người</summary><img id="uncertainty" alt="Khoảng bootstrap 95%"></details><details><summary>Từng khớp</summary><img id="joints" alt="Độ chính xác từng khớp"></details><details><summary>Góc quay</summary><img id="views" alt="Góc quay thực có"></details><details><summary>Ổn định và mất khớp</summary><img id="stability" alt="Ổn định và mất khớp"></details></section>
<footer>Dữ liệu và dự án SmartGym là đầu vào chỉ đọc. Tất cả mã và kết quả benchmark nằm trong Fit3D_Pose_Benchmark. Kết quả có điều kiện trên các checkpoint, bộ giải mã và giao thức đã ghi trong báo cáo.</footer></main>
<script>const data=__DATA__;const subjects=__SUBJECTS__;const cameras=__CAMERAS__;const $=id=>document.getElementById(id);for(const s of subjects)$('sub').add(new Option(s,s));for(const c of cameras)$('cam').add(new Option(c,c));function render(){const ex=$('ex').value,sub=$('sub').value,cam=$('cam').value;const rows=data.filter(r=>r.exercise===ex&&r.subject===sub&&r.camera===cam);const id=rows[0].id;$('scope').textContent=`${sub} · camera ${cam} · góc tương đối ${rows[0].angle.toFixed(1)}° · cùng frame đầu vào và cùng GT`; $('body').replaceChildren();for(const r of rows){const tr=document.createElement('tr');const values=[r.model,r.pck.toFixed(1)+'%',r.rep+' / '+r.gt,r.mae,r.jitter.toFixed(3),r.missing.toFixed(1)+'%',r.fps.toFixed(1),r.p95.toFixed(1),'N/A'];values.forEach((v,i)=>{const td=document.createElement('td');td.textContent=v;if(i===1){const b=document.createElement('div');b.className='bar';b.style.width=r.pck+'%';td.append(b)}tr.append(td)});$('body').append(tr)}$('video').src='comparisons/'+id+'.mp4';$('still').src='comparisons/'+id+'.jpg';for(const key of ['summary','uncertainty','joints','views','stability'])$(key).src='figures/'+ex+'_'+key+'.png';}for(const id of ['ex','sub','cam'])$(id).addEventListener('change',render);render();</script></html>'''
 page=page.replace('__DATA__',json.dumps(payload)).replace('__SUBJECTS__',json.dumps(manifest['subjects'])).replace('__CAMERAS__',json.dumps(sorted({c['camera'] for c in manifest['clips']})))
 page=page.replace('</div></header>','<a href="occlusion/REPORT.md">Thử che khuất nhân tạo</a></div></header>')
 page=page.replace('</div></header>','<a href="comparison_camera_summary.csv">Bảng TB theo camera (80 dòng)</a></div></header>')
 page=page.replace('<div class="filters">','<details class="card"><summary>Cách đọc các phép đo</summary><p>PCK là tỷ lệ đúng vị trí của 12 khớp chi, với sai số không quá 20% thang chuẩn thân. Thang chuẩn là khoảng cách trung điểm vai–hông chiếu 2D, có sàn 20 pixel. PCK và FPS càng cao càng tốt; sai số rep, jitter, tỷ lệ mất khớp và độ trễ càng thấp càng tốt.</p><p>Jitter đo thay đổi của sai số khớp so với GT ở mỗi bước 1/25 giây. Rep/GT là số lượt tracker đếm được so với số khoảng hoàn chỉnh giữa các marker nhãn. p95 là phân vị 95% độ trễ của lượt đo 30 frame, không phải thời gian chậm nhất toàn bộ video.</p></details><div class="filters">')
 page=page.replace('<footer>','<section class="card"><h2>Đồng thuận dự đoán lỗi qua camera</h2><p>Tổng hợp cả 8 người và 4 camera. Chưa có nhãn để chấm accuracy. Đồng thuận cao có thể do luôn đoán một lớp; phân bố lớp chỉ mô tả đầu ra chưa kiểm chứng.</p><img id="form_stability" alt="Đồng thuận và phân bố lớp, không phải accuracy"></section><footer>')
 page=page.replace("['summary','uncertainty','joints','views','stability']","['summary','uncertainty','joints','views','stability','form_stability']")
 page=page.replace('Video xem trước hai chu kỳ;','Video hiển thị toàn bộ đoạn đánh giá ở lưới 25 fps, gồm ngữ cảnh một giây hai đầu;')
 (R/'index.html').write_text(page,encoding='utf-8')

if __name__=='__main__':main()
