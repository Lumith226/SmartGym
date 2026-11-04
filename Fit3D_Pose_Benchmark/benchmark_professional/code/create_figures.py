"""Generate figures from the revision results and the original Fit3D frames."""
import json

import cv2
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
from matplotlib.patches import FancyBboxPatch
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from publish_results import ROOT, OLD, OUT, source_prediction
from dataset import FIT

F = ROOT / 'work' / 'figures'
F.mkdir(exist_ok=True)
OLD_REPORT = ROOT.parent / 'word_report' / 'visual_report_v2'
load = lambda p: json.loads(p.read_text(encoding='utf-8'))
S = load(OUT / 'summary.json')
C = load(OUT / 'comparison_by_clip.json')
models = [r['model'] for r in S['squat']]
maps = {e: {r['model']: r for r in S[e]} for e in S}
cams = ['50591643', '58860488', '60457274', '65906101']
labels = {'squat': 'Squat', 'pushup': 'Chống đẩy'}
navy, blue, teal, gray = '#1A3151', '#2F70D6', '#14A69A', '#A4ADBA'
short = ['YOLOv8n', 'YOLO11n', 'YOLO26n', 'RTMPose-m', 'RTMO-s',
         'ViTPose-B', 'HRNet-W32', 'Lite-HRNet-18', 'MoveNet Web', 'LitePose †']
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 9, 'text.color': navy,
                     'axes.labelcolor': navy, 'xtick.color': navy, 'ytick.color': navy,
                     'axes.spines.top': False, 'axes.spines.right': False})


def save(fig, name):
    fig.savefig(F / (name + '.png'), dpi=300, bbox_inches='tight', pad_inches=.09, facecolor='white')
    plt.close(fig)


def pipeline():
    fig, ax = plt.subplots(figsize=(8.5, 2.1), layout='constrained')
    ax.set(xlim=(0, 12), ylim=(0, 4)); ax.axis('off')
    boxes = [(0,1.52,2.05,1.05,'Video Fit3D\nFrame chung',navy),
             (3.06,2.65,3.13,.87,'Top-down · detector + pose',teal),
             (3.06,.55,3.13,.87,'Một mạng pose / bottom-up',blue),
             (7.21,1.52,2.03,1.05,'COCO 17 khớp\nTọa độ ảnh',navy),
             (10.13,1.52,1.85,1.05,'Tracker\nSmartGym',navy)]
    for x,y,w,h,s,c in boxes:
        ax.add_patch(FancyBboxPatch((x,y),w,h,boxstyle='round,pad=0.02,rounding_size=.10',facecolor=c,lw=0))
        ax.text(x+w/2,y+h/2,s,color='white',ha='center',va='center',fontsize=8.9,weight='bold')
    for a,b in [((2.1,2.04),(3,3.06)),((2.1,2.04),(3,.98)),((6.24,3.06),(7.16,2.04)),
                ((6.24,.98),(7.16,2.04)),((9.29,2.04),(10.08,2.04))]:
        ax.annotate('',xy=b,xytext=a,arrowprops={'arrowstyle':'->','color':navy,'lw':1.4})
    ax.text(8.22,1.11,'PCK · jitter · mất khớp',ha='center',fontsize=8)
    ax.text(11.05,1.11,'MAE đếm lượt',ha='center',fontsize=8)
    ax.plot([.12,9.15],[.23,.23],lw=1.1,color=blue)
    ax.text(4.66,.03,'FPS pipeline pose từ ảnh đã giải mã',va='bottom',ha='center',fontsize=8,color=blue,
            bbox={'facecolor':'white','edgecolor':'none','pad':2})
    save(fig,'pipeline')


def results(ex):
    rows = S[ex]
    fig, axs = plt.subplots(1,3,figsize=(8.7,3.37),layout='constrained',sharey=True)
    for i,(ax,key,ttl,c,scale,ticks) in enumerate(zip(axs,['pck','mae','fps'],
            ['Khớp đúng (%) ↑','Sai số lượt/clip ↓','Pose FPS ↑'],[teal,navy,blue],
            [113,4.65,61],[[0,25,50,75,100],[0,1,2,3,4],[0,15,30,45,60]])):
        vals = [r[key] for r in rows]
        bars = ax.barh(range(10), vals, color=[c]*9+[gray], height=.6)
        bars[-1].set_hatch('///');bars[-1].set_edgecolor('#697582')
        for j,v in enumerate(vals):
            digits = 1 if key=='fps' else 2
            ax.text(v+scale*.02,j,f'{v:.{digits}f}',va='center',fontsize=8,clip_on=False)
        ax.set(xlim=(0,scale),xticks=ticks,yticks=range(10),yticklabels=short)
        ax.set_title(ttl,loc='left',fontsize=10,fontweight='bold',pad=10)
        ax.tick_params(axis='y',length=0,labelleft=i==0)
        ax.grid(axis='x',color='#e5eaf0',lw=.7)
        ax.set_axisbelow(True)
        ax.spines['left'].set_visible(False)
    axs[0].invert_yaxis()
    save(fig,ex)


def tradeoff():
    fig, axs = plt.subplots(1,2,figsize=(8.7,3.0),layout='constrained',sharex=True,sharey=True)
    offsets = {'squat': [(7,-14),(0,11),(-9,11),(-7,11),(5,11),(-1,10),(4,-14),(0,-14),(7,-15),(6,-10)],
               'pushup':[(4,-10),(4,-10),(0,10),(6,8),(6,9),(-2,10),(-5,10),(0,-13),(7,8),(7,-6)]}
    for ax,(ex,rows) in zip(axs,S.items()):
        for i,r in enumerate(rows):
            ax.scatter(r['fps'],r['pck'],s=32,marker='x' if not r['ranked'] else 'o',
                       color=gray if not r['ranked'] else teal,linewidth=1.3,zorder=3)
            ax.annotate(f'{i+1:02d}',(r['fps'],r['pck']),xytext=offsets[ex][i],textcoords='offset points',
                        fontsize=7.9,weight='bold',color='#677381' if not r['ranked'] else navy)
        ax.set(title=labels[ex],xlim=(15,57),ylim=(0,104),xlabel='Pose FPS')
        ax.grid(lw=.6,color='#e5eaf0')
    axs[0].set_ylabel('PCK (%)')
    save(fig,'tradeoff')


def camera_heatmap():
    fig, ax = plt.subplots(figsize=(8.4,3.3),layout='constrained')
    values = np.array([[np.mean([r['pck'] for r in C if r['clip']['exercise']==e and r['clip']['camera']==c and r['model']==m])
                        for e in S for c in cams] for m in models])
    cmap=LinearSegmentedColormap.from_list('pose', ['#f1f5fb','#a7d9dd','#247f96','#1A3151'])
    h=ax.imshow(values,aspect='auto',vmin=0,vmax=100,cmap=cmap)
    ax.set_xticks(range(8),[f'{p} C{i}' for p in ['SQ','CĐ'] for i in range(1,5)])
    ax.set_yticks(range(10),short)
    ax.tick_params(length=0)
    ax.xaxis.tick_top()
    for (i,j),v in np.ndenumerate(values):
        ax.text(j,i,f'{v:.1f}',ha='center',va='center',color='white' if v>=62 else navy,fontsize=8)
    ax.axvline(3.5,color='white',lw=3)
    ax.axhline(8.5,color='white',lw=2)
    for spine in ax.spines.values():spine.set_visible(False)
    fig.colorbar(h,ax=ax,label='PCK (%)',pad=.022,shrink=.85)
    save(fig,'cameras')


def stability():
    fig,axs=plt.subplots(1,3,figsize=(8.6,3.16),layout='constrained',sharey=True)
    panels=[('squat','jitter','Jitter squat ↓',teal),('pushup','jitter','Jitter chống đẩy ↓',teal),
            ('pushup','missing','Mất khớp chống đẩy (%) ↓',blue)]
    for i,(ax,(ex,key,ttl,col)) in enumerate(zip(axs,panels)):
        y=[r[key] for r in S[ex]]
        ax.barh(range(10),y,color=[col]*9+[gray],height=.62)
        cap=max(y)
        for j,v in enumerate(y):ax.text(v+cap*.03,j,f'{v:.3f}' if key=='jitter' else f'{v:.2f}',va='center',fontsize=7.8)
        ax.set(xlim=(0,cap*1.31),yticks=range(10),yticklabels=short)
        ax.set_title(ttl,loc='left',fontweight='bold',fontsize=9)
        ax.tick_params(axis='y',length=0,labelleft=i==0)
        ax.grid(axis='x',lw=.6,color='#e5eaf0');ax.set_axisbelow(True)
    axs[0].invert_yaxis()
    save(fig,'stability')


def mask():
    rows=load(OUT/'occlusion'/'results.json')
    fig,ax=plt.subplots(figsize=(8.1,1.58),layout='constrained')
    for i,e in enumerate(labels):
        g=[r for r in rows if r['clip']['exercise']==e]
        a,b=[np.mean([r[k] for r in g]) for k in ('clean_pck','occluded_pck')]
        ax.plot([a,b],[i,i],lw=2,color='#aebccc',zorder=0)
        ax.scatter([a,b],[i,i],color=[teal,blue],s=31,zorder=2)
        ax.text(a+2,i,f'{a:.1f}',va='center',fontsize=8.5)
        ax.text(b-2,i,f'{b:.1f}',va='center',ha='right',fontsize=8.5)
    ax.set(xlim=(0,100),ylim=(1.52,-.52),yticks=[0,1],yticklabels=['Squat · RTMO-s','Chống đẩy · RTMPose-m'],
           xlabel='PCK (%)  ·  xanh lục: sạch  /  xanh dương: che tổng hợp')
    ax.tick_params(axis='y',length=0);ax.grid(axis='x',color='#e5eaf0',lw=.7)
    save(fig,'mask')


def photo(clip, model, frame_id):
    with np.load(source_prediction(model, clip['id'])) as d:
        i=int(np.flatnonzero(d['ids']==frame_id)[0]);gt=d['gt'][i];pred=d['pred'][i]
    v=cv2.VideoCapture(clip['video']);v.set(cv2.CAP_PROP_POS_FRAMES,frame_id)
    ok,frame=v.read();v.release();assert ok
    shape=(450,280)
    lo,hi=gt.min(0),gt.max(0);center=(lo+hi)/2
    size=np.maximum(hi-lo,1)*1.25;ratio=shape[0]/shape[1]
    if size[0]/size[1]>ratio:size[1]=size[0]/ratio
    else:size[0]=size[1]*ratio
    origin=center-size/2
    tr=np.array([[shape[0]/size[0],0,-origin[0]*shape[0]/size[0]],
                 [0,shape[1]/size[1],-origin[1]*shape[1]/size[1]]],np.float32)
    frame=cv2.warpAffine(frame,tr,shape,borderValue=(245,245,245))
    pr=pred[:,:2]@tr[:,:2].T+tr[:,2];g=gt[FIT]@tr[:,:2].T+tr[:,2]
    for a,b in [(5,6),(5,7),(7,9),(6,8),(8,10),(5,11),(6,12),(11,12),(11,13),(13,15),(12,14),(14,16)]:
        if pred[a,2]>.1 and pred[b,2]>.1:cv2.line(frame,tuple(pr[a].astype(int)),tuple(pr[b].astype(int)),(225,50,205),2,cv2.LINE_AA)
    for p in g:cv2.circle(frame,tuple(p.astype(int)),3,(45,225,45),-1,cv2.LINE_AA)
    return Image.fromarray(cv2.cvtColor(frame,cv2.COLOR_BGR2RGB))


def photos():
    selected=load(OLD_REPORT/'PHOTO_SELECTION.json')
    old_by_clip={r['clip']['id']:r['clip'] for r in C}
    font=lambda s,b=False:ImageFont.truetype('C:/Windows/Fonts/'+('arialbd.ttf' if b else 'arial.ttf'),s)
    for e in S:
        canvas=Image.new('RGB',(920,644),'white');d=ImageDraw.Draw(canvas)
        for i,r in enumerate(selected[e]):
            x=(i%2)*470;y=(i//2)*322
            d.text((x+2,y+2),f'C{i+1} · {r["clip"].rsplit("_",1)[-1]}',font=font(23,True),fill=navy)
            canvas.paste(photo(old_by_clip[r['clip']],r['model'],r['frame']),(x,y+31))
        canvas.save(F/(e+'_cameras.jpg'),quality=95)
    for e,cid,fr,first in [('squat','s10_squat_65906101',752,'RTMO-s'),
                           ('pushup','s07_pushup_58860488',422,'RTMPose-m')]:
        canvas=Image.new('RGB',(920,341),'white');d=ImageDraw.Draw(canvas)
        for i,name in enumerate([first,'YOLOv8n-Pose']):
            row=next(r for r in C if r['model']==name and r['clip']['id']==cid)
            x=i*470
            d.text((x+2,0),name,font=font(24,True),fill=navy)
            d.text((x+2,29),f'PCK clip {row["pck"]:.1f}%   •   Lượt {row["counted"]}/{row["gt_reps"]}',font=font(20),fill=navy)
            canvas.paste(photo(row['clip'],name,fr),(x,60))
        canvas.save(F/(e+'_pair.jpg'),quality=95)


if __name__=='__main__':
    pipeline()
    for exercise in S:results(exercise)
    tradeoff()
    camera_heatmap()
    stability()
    mask()
    photos()
