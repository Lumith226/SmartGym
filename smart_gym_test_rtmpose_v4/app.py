"""V4: squat 14 nhãn, jumping jacks 29 nhãn, đối chiếu Qualcomm."""
import argparse
from collections import deque
import json
from pathlib import Path
import time
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from onnx_gym_analyzer import ONNXGymAnalyzer, EXERCISE_CONFIG, V4_STEMS
from rep_tracker import ExerciseRepTracker
from rtmpose_tracker import RTMPoseTracker
from session_logger import SessionLogger
from squat_schema import LABELS, write_json
from video_tools import analyze_squat_video, print_result
from camera_capture import CameraCapture

APP=Path(__file__).resolve().parent
PAIRS=[(0,1),(0,2),(1,3),(2,4),(5,6),(5,7),(7,9),(6,8),(8,10),
       (5,11),(6,12),(11,12),(11,13),(13,15),(12,14),(14,16)]
EXERCISES=['squat','push_up','jump_jack','situp']
EXERCISE_NAMES={'squat':'Squat (V4)','push_up':'Chống đẩy (V3)',
                'jump_jack':'Bật nhảy dang tay chân (V4)','situp':'Gập bụng ngược (V3)'}
EXERCISE_SHORT=['Squat','Chống đẩy','Bật nhảy','Gập bụng']
for _key in ('push_up','situp'):
    if EXERCISE_CONFIG[_key].get('is_multihead',False):
        EXERCISE_NAMES[_key]=('Chống đẩy' if _key=='push_up' else 'Gập bụng ngược')+' (V4)'


def is_v4(exercise):
    return EXERCISE_CONFIG[exercise].get('is_multihead',False)


def exercise_at_point(x,y):
    if 50<=y<=82:
        for i,key in enumerate(EXERCISES):
            if 20+i*200<=x<=214+i*200:return key
    return None


def pick_video_file():
    import tkinter as tk
    from tkinter import filedialog
    root=tk.Tk();root.withdraw();root.attributes('-topmost',True)
    try:return filedialog.askopenfilename(title='Chọn video kiểm thử',filetypes=[('Video','*.mp4 *.avi *.mov *.mkv *.webm'),('Tất cả','*.*')])
    finally:root.destroy()


def open_camera_capture(preferred_index=None):
    return CameraCapture(preferred_index),preferred_index


def draw_skeleton(frame,kpts):
    h,w=frame.shape[:2]
    for a,b in PAIRS:
        if min(kpts[2,a],kpts[2,b])>=.25:
            cv2.line(frame,(int(kpts[0,a]*w),int(kpts[1,a]*h)),
                     (int(kpts[0,b]*w),int(kpts[1,b]*h)),(80,230,160),2,cv2.LINE_AA)
    for j in range(17):
        if kpts[2,j]>=.25:cv2.circle(frame,(int(kpts[0,j]*w),int(kpts[1,j]*h)),3,(60,180,255),-1)


def font(size):
    for name in ['C:/Windows/Fonts/arial.ttf','C:/Windows/Fonts/segoeui.ttf','DejaVuSans.ttf']:
        try:return ImageFont.truetype(name,size)
        except OSError:pass
    return ImageFont.load_default()


FONTS={size:font(size) for size in [14,16,18,20,24,28]}


def render_dashboard(frame,result,rep_count=0,state='READY',source='',paused=False,view='Toàn video',fps=0.,
                     exercise=None,notice='',camera_state=None):
    exercise=exercise or (result.get('exercise') if result else None) or 'squat'
    canvas=np.full((900,1500,3),(24,22,20),dtype=np.uint8)
    if frame is not None:
        h,w=frame.shape[:2];scale=min(800/w,470/h)
        small=cv2.resize(frame,(max(1,int(w*scale)),max(1,int(h*scale))))
        y=120+(470-small.shape[0])//2;x=20+(800-small.shape[1])//2
        canvas[y:y+small.shape[0],x:x+small.shape[1]]=small
    image=Image.fromarray(cv2.cvtColor(canvas,cv2.COLOR_BGR2RGB));d=ImageDraw.Draw(image)
    def text(x,y,value,size=18,color=(225,230,235)):
        d.text((x,y),str(value),font=FONTS[size],fill=color)
    def wrap(x,y,value,width=770,size=18,color=(225,230,235)):
        line=''
        for word in str(value).split():
            trial=(line+' '+word).strip()
            if d.textbbox((0,0),trial,font=FONTS[size])[2]>width and line:
                text(x,y,line,size,color);y+=size+8;line=word
            else:line=trial
        if line:text(x,y,line,size,color);y+=size+8
        return y
    number=EXERCISES.index(exercise)+1
    text(20,14,f'ĐANG CHỌN [{number}]: '+EXERCISE_NAMES[exercise].upper(),24,(90,220,185))
    for i,key in enumerate(EXERCISES):
        active=key==exercise;x=20+i*200
        d.rounded_rectangle((x,50,x+194,82),radius=6,fill=(28,110,90) if active else (43,48,54),
                            outline=(100,235,190) if active else (65,72,80),width=2)
        text(x+10,57,f'[{i+1}] {EXERCISE_SHORT[i]}',16,(255,255,255) if active else (190,200,205))
    text(20,91,source[:105],14)
    if frame is None:
        text(95,290,'Đang chờ hình từ camera…' if camera_state and camera_state['state']=='opening' else 'Chưa có hình từ nguồn phát',24)
        if camera_state and camera_state['state']=='error':
            wrap(75,340,camera_state['message'],width=700,size=20,color=(255,185,110))
    text(20,610,f'Rep: {rep_count}    Trạng thái: {state}    FPS xử lý: {fps:.1f}',20)
    play_state=('CHỜ CAMERA' if camera_state['state']=='opening' else 'LỖI CAMERA') if camera_state and camera_state['state']!='live' else ('TẠM DỪNG' if paused else 'ĐANG PHÁT')
    text(20,648,play_state,18,(255,200,90) if paused or play_state!='ĐANG PHÁT' else (100,220,180))
    if notice:wrap(205,648,notice,width=610,size=14,color=(255,205,130))
    text(850,20,'KẾT QUẢ: '+view.upper(),24)
    text(850,58,'Tên nhãn',16);text(1165,58,'Điểm',16);text(1230,58,'Ngưỡng',16)
    text(1310,58,'AI',16);text(1370,58,'Nhãn gốc',16)
    rows=result.get('label_results',[]) if result else []
    if result and not rows and not result.get('is_multihead',False):
        details=EXERCISE_CONFIG[exercise].get('details',{})
        rows=[{'raw_label':key,'name_vi':details.get(key,{}).get('name_vi',key),
               'probability':float(value),'threshold':None,'detected':key==result.get('class_code'),
               'supported':True} for key,value in result.get('probabilities',{}).items()]
    comparison=result.get('comparison') if result else None
    truth=set(comparison['ground_truth']) if comparison else None
    if not result:
        text(852,110,'Đã chọn: '+EXERCISE_NAMES[exercise],20,(100,230,185))
        waiting=('Đang chờ đủ chuỗi khớp. Một số nhãn cần phân tích toàn video.' if is_v4(exercise)
                 else 'Đang chờ chuyển động. Hoàn thành một lượt để xem kết quả của bài đang chọn.')
        wrap(852,155,waiting,width=610,size=18)
        if not is_v4(exercise):
            text(852,235,'Bài này dùng mô hình V3, đánh giá sau từng lượt.',16)
    for i,row in enumerate(rows):
        spacing=min(38,max(18,540//max(len(rows),1)))
        size=14 if len(rows)>16 else 16
        y=94+i*spacing;active=row['detected'];supported=row['supported']
        gt=row['raw_label'] in truth if truth is not None else None
        color=(105,220,170) if active else (160,170,180)
        if gt is True and not active:color=(255,195,80)
        elif gt is False and active:color=(255,125,125)
        d.rectangle((844,y-2,1480,y+spacing-3),fill=(35,40,45) if i%2==0 else (28,32,37))
        text(852,y,row['name_vi'],size,color)
        p=row['probability'];t=row['threshold']
        text(1165,y,f'{p*100:.1f}%' if p is not None else '--',16,color)
        text(1235,y,f'{t*100:.1f}%' if t is not None and 0<=t<=1 else '--',16)
        text(1310,y,('Có' if active else '—') if supported else 'N/A',16,color)
        text(1390,y,'Có' if gt else ('—' if gt is False else '?'),16,color)
    if result:
        y=690
        y=wrap(20,y,result['class_name_vi'],size=18,color=(255,205,130))
        if result.get('review_notes'):
            y=wrap(20,y,result['review_notes'][0],size=16,color=(255,195,80))
        if not rows:y=wrap(20,y,result.get('feedback_vi',''),size=16)
        quality=result.get('quality')
        text(850,645,f"Khung hình có pose dùng được: {quality['valid_frame_ratio']*100:.0f}%" if quality else 'Mô hình V3: đánh giá theo từng lượt chuyển động.',16)
        text(850,674,f"ONNX: {result.get('latency_ms',0):.1f} ms | Phạm vi: {result.get('scope','rep')}",16)
        if comparison:
            text(850,708,f"Khớp toàn bộ: {'CÓ' if comparison['exact_match'] else 'CHƯA'}",18)
            text(850,738,f"Bỏ sót: {len(comparison['missed'])} | Báo thừa: {len(comparison['extra'])}",18)
        text(850,776,'Vàng: bỏ sót nhãn gốc | Đỏ: dự đoán nhãn không được ghi',14)
        text(850,802,'N/A: thiếu ngữ cảnh hoặc mẫu xác thực. Điểm chưa hiệu chuẩn.',14)
    text(20,844,'[V] Video  [C] Camera  [P/Space] Dừng  [T] Toàn video/Rep  [R] Phát lại',16)
    text(20,871,'Bấm nút chọn bài hoặc phím 1–4 trong cửa sổ này. [S] Lưu ảnh  [Q/Esc] Thoát.',14)
    return cv2.cvtColor(np.array(image),cv2.COLOR_RGB2BGR)


def main():
    parser=argparse.ArgumentParser(description='Smart Gym V4: đánh giá nhiều nhãn Qualcomm cho bốn bài tập')
    parser.add_argument('--video',default='');parser.add_argument('--exercise',default='squat')
    parser.add_argument('--device',choices=['cuda','cpu'],default='cuda')
    parser.add_argument('--mode',default='balanced');parser.add_argument('--camera-id',type=int,default=None)
    parser.add_argument('--headless',action='store_true',help='Kiểm thử không mở cửa sổ')
    parser.add_argument('--max-frames',type=int,default=0)
    parser.add_argument('--output',default=str(APP/'logs/last_video_analysis.json'));parser.add_argument('--snapshot',default='')
    args=parser.parse_args()
    if args.headless and not args.video:parser.error('--headless cần --video')
    if args.video and not Path(args.video).is_file():parser.error('Không tìm thấy video: '+args.video)
    analyzer=ONNXGymAnalyzer(args.device);exercise=analyzer.normalize_exercise(args.exercise)
    if exercise not in EXERCISES:parser.error('Bài tập không được hỗ trợ')
    pose=RTMPoseTracker(mode=args.mode,device=args.device)
    if exercise=='squat':analyzer.load_squat_contract()
    elif exercise=='jump_jack':analyzer.load_jumpjack_contract()
    elif is_v4(exercise):analyzer.load_v4_contract(exercise)
    tracker=ExerciseRepTracker(analyzer);tracker.reset(exercise)
    source=args.video;whole=None;latest=None;last_kpts=None;last_info={};show_whole=True
    def analyze_source(path):
        if not is_v4(exercise):return None
        value,_=analyze_squat_video(path,pose,analyzer,exercise=V4_STEMS[exercise])
        print_result(value)
        if args.output:write_json(args.output,value)
        if args.output:print('Đã lưu đối chiếu toàn video:',args.output)
        return value
    if source:
        whole=analyze_source(source);pose.reset();cap=cv2.VideoCapture(source)
        if not cap.isOpened():raise ValueError('Không mở được video: '+source)
    else:
        if args.headless:parser.error('--headless cần --video')
        cap,_=open_camera_capture(args.camera_id)
    if args.headless:
        if whole is not None:cap.set(cv2.CAP_PROP_POS_FRAMES,whole.get('source',{}).get('preview_frame_index',0))
        ok,frame=cap.read();cap.release()
        if whole is None:raise ValueError('Bài này chưa có mô hình V4 nhiều nhãn để phân tích toàn video')
        if args.snapshot and ok:
            preview=render_dashboard(frame,whole,source=Path(source).name,view='Toàn video',exercise=exercise)
            Path(args.snapshot).parent.mkdir(parents=True,exist_ok=True)
            cv2.imencode('.png',preview)[1].tofile(args.snapshot)
        return
    logger=SessionLogger();window='Smart Gym V4 - Qualcomm multilabel'
    cv2.namedWindow(window,cv2.WINDOW_NORMAL);cv2.resizeWindow(window,1500,900)
    clicks=deque()
    def on_mouse(event,x,y,flags,param):
        if event==cv2.EVENT_LBUTTONDOWN:
            selected=exercise_at_point(x,y)
            if selected:clicks.append(selected)
    cv2.setMouseCallback(window,on_mouse)
    paused=False;frame=None;eof=False;processed=0;empty_since=None
    history=deque(maxlen=480);last_window=0.;last_capture=time.monotonic();fps=0.;canvas=None
    notice='Đã chọn '+EXERCISE_NAMES[exercise];pending_analysis=0
    try:
        while True:
            iteration=time.monotonic()
            if pending_analysis==1:
                whole=analyze_source(source);pending_analysis=0;pose.reset()
                notice='Đã chọn '+EXERCISE_NAMES[exercise]
            elif pending_analysis==2:pending_analysis=1
            camera_state=cap.status() if not source and cap is not None and hasattr(cap,'status') else None
            if not paused and not pending_analysis:
                ok,fresh=cap.read() if cap is not None else (False,None)
                if not ok:
                    if source:paused=True;eof=True
                    else:
                        empty_since=empty_since or time.monotonic()
                        if time.monotonic()-empty_since>1:
                            tracker.notify_missing(time.monotonic());pose.reset();history.clear();latest=None;whole=None
                        if camera_state and camera_state['state']!='live':frame=None;last_kpts=None
                else:
                    empty_since=None;frame=fresh;processed+=1
                    h,w=frame.shape[:2];analyzer.frame_aspect_ratio=w/h
                    now=(cap.get(cv2.CAP_PROP_POS_MSEC)/1000) if source else getattr(cap,'frame_timestamp',time.monotonic())
                    found,last_kpts=pose.process_frame(frame)
                    if found:
                        last_info=tracker.process_frame(last_kpts,timestamp=now)
                        if last_info.get('just_finished_rep'):
                            latest=last_info['last_result']
                            logger.log_rep(tracker.rep_count,exercise,latest,last_info['rep_tensor_32'],
                                           last_info['raw_frames_count'],Path(source).name if source else 'Webcam')
                        corrected=last_kpts.copy();corrected[0]*=w/h;history.append((now,corrected))
                        if not source and last_info.get('need_full_body') and exercise in ('push_up','situp'):
                            history.clear();whole=None;latest=None
                        elif not source and is_v4(exercise) and len(history)>=20 and time.monotonic()-last_window>3:
                            samples=[item[1] for item in history]
                            predict=getattr(analyzer,'predict_'+V4_STEMS[exercise]+'_sequence')
                            whole=predict(samples,max(history[-1][0]-history[0][0],.1),scope='window')
                            last_window=time.monotonic()
                    else:
                        last_kpts=None
                        if not source:whole=None;latest=None
                        if tracker.notify_missing(now):pose.reset();history.clear()
            shown=frame.copy() if frame is not None else None
            if last_kpts is not None and shown is not None:draw_skeleton(shown,last_kpts)
            display=whole if show_whole and whole is not None else latest
            name=Path(source).name if source else (camera_state['message'] if camera_state else 'Camera chưa có hình')
            state='HẾT VIDEO' if eof else ('ĐANG MỞ CAMERA' if camera_state and camera_state['state']=='opening' else ('LỖI CAMERA' if camera_state and camera_state['state']=='error' else tracker.state))
            if not eof and last_info.get('need_full_body') and exercise in ('push_up','situp'):
                state=last_info['state']
            canvas=render_dashboard(shown,display,tracker.rep_count,state,
                                    name,paused,('Toàn video' if source else 'Cửa sổ trực tiếp') if whole is not None and display is whole else 'Rep gần nhất',fps,
                                    exercise=exercise,notice=notice,camera_state=camera_state)
            cv2.imshow(window,canvas)
            delay=max(1,int(1000/(cap.get(cv2.CAP_PROP_FPS) or 30)-(time.monotonic()-iteration)*1000)) if source and not paused else 20
            key=cv2.waitKey(min(delay,100))&255
            selected=clicks.popleft() if clicks else None
            if selected is None and key in [ord(str(i)) for i in range(1,5)]:selected=EXERCISES[int(chr(key))-1]
            if key in [ord('q'),27]:break
            if args.max_frames and processed>=args.max_frames:break
            if selected is not None:
                exercise=selected;tracker.reset(exercise);pose.reset();history.clear()
                whole=None;latest=None;last_kpts=None;last_info={};last_window=0.;show_whole=True
                paused=False;eof=False;empty_since=None
                if source:cap.set(cv2.CAP_PROP_POS_FRAMES,0)
                pending_analysis=2 if source and is_v4(exercise) else 0
                notice='Đã chọn '+EXERCISE_NAMES[exercise]+(' — đang phân tích toàn video…' if pending_analysis else ' — chờ hoàn thành một lượt.')
            elif key in [ord('p'),32]:
                if not eof:paused=not paused
            elif key==ord('t'):show_whole=not show_whole
            elif key==ord('s'):
                path=APP/'logs'/f'preview_{time.time_ns()}.png';cv2.imencode('.png',canvas)[1].tofile(str(path));print('Đã lưu ảnh:',path)
            elif key==ord('r'):
                if source:cap.set(cv2.CAP_PROP_POS_FRAMES,0)
                tracker.reset();pose.reset();history.clear();latest=None;paused=False;eof=False;show_whole=True
            elif key==ord('v'):
                chosen=pick_video_file()
                if chosen:
                    new_cap=cv2.VideoCapture(chosen)
                    if new_cap.isOpened():
                        if cap is not None:cap.release()
                        cap=new_cap;source=chosen;whole=None
                        tracker.reset();pose.reset();history.clear();latest=None;frame=None;last_kpts=None
                        paused=False;eof=False;show_whole=True;last_info={};last_window=0.;empty_since=None
                        pending_analysis=2 if is_v4(exercise) else 0
                        notice='Đang phân tích video…' if pending_analysis else 'Đã mở video; chờ hoàn thành một lượt.'
                    else:new_cap.release()
            elif key==ord('c'):
                # Close the old handle first: opening the same webcam twice can
                # fail or hang the Windows camera driver.
                if cap is not None:cap.release()
                cap=None;source='';whole=None;latest=None;frame=None;last_kpts=None
                tracker.reset();pose.reset();history.clear();paused=False;eof=False;show_whole=True
                pending_analysis=0;last_info={};last_window=0.;empty_since=None
                notice='Đang kết nối camera; vẫn có thể chọn bài hoặc bấm V.'
                new_cap,_=open_camera_capture(args.camera_id)
                cap=new_cap
            fps=1/max(time.monotonic()-iteration,1e-6)
    finally:
        if args.snapshot and canvas is not None:
            Path(args.snapshot).parent.mkdir(parents=True,exist_ok=True)
            cv2.imencode('.png',canvas)[1].tofile(args.snapshot)
        if cap is not None:cap.release()
        cv2.destroyAllWindows()


if __name__=='__main__':main()
