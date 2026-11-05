"""Camera-driver isolation and exercise-selection regressions from real UI bugs."""
from pathlib import Path
import sys
import time
import numpy as np
import pytest

APP=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(APP))
import app
from camera_capture import CameraCapture,decode_frame,FRAME_HEADER


@pytest.fixture
def ui(monkeypatch,tmp_path):
    events=[];renders=[];mouse={};keys=[];cameras=[]
    video_path=tmp_path/'clip.mp4';video_path.write_bytes(b'fixture')
    class Analyzer:
        def __init__(self,*args):pass
        def normalize_exercise(self,value):return value
        def load_squat_contract(self):pass
        def load_jumpjack_contract(self):pass
        def load_v4_contract(self,exercise):pass
    class Pose:
        def __init__(self,*args,**kwargs):pass
        def reset(self):pass
        def process_frame(self,frame):return True,np.zeros((3,17),np.float32)
    class Tracker:
        def __init__(self,*args):self.rep_count=0;self.state='READY'
        def reset(self,exercise=None):
            self.state='READY';events.append(('select',exercise))
        def process_frame(self,*args,**kwargs):events.append(('pose',));return {}
        def notify_missing(self,*args):return False
    class Video:
        def __init__(self,*args):self.index=0;self.total=3;self.closed=False
        def isOpened(self):return True
        def read(self):
            self.index+=1
            return (True,np.zeros((50,80,3),np.uint8)) if self.index<=self.total else (False,None)
        def get(self,*args):return 30.
        def set(self,prop,value):self.index=int(value);events.append(('rewind',value))
        def release(self):self.closed=True;events.append(('release_video',))
    video=Video()
    class FailedCamera:
        def __init__(self):self.closed=False
        def read(self):return False,None
        def status(self):return {'state':'error','message':'Camera bị chiếm dụng','index':0,'backend':'fixture'}
        def release(self):self.closed=True;events.append(('release_camera',))
    def open_camera(*args):
        assert video.closed or not video_path_arg[0]
        assert not cameras or cameras[-1].closed
        events.append(('open_camera',));camera=FailedCamera();cameras.append(camera);return camera,0
    real_render=app.render_dashboard
    def render(frame,result,*args,**kwargs):
        renders.append({'exercise':kwargs.get('exercise'),'result':result,'state':args[1],
                        'camera':kwargs.get('camera_state'),'frame':frame})
        return real_render(frame,result,*args,**kwargs)
    def analyze(*args,**kwargs):
        return {'exercise':'squat','class_name_vi':'Kết quả squat cũ','label_results':[],
                'is_multihead':True,'quality':{'valid_frame_ratio':1.}},None
    def wait_key(*args):
        value=keys.pop(0)
        if value=='mouse2':
            mouse['handler'](app.cv2.EVENT_LBUTTONDOWN,240,65,0,None);return -1
        return value
    monkeypatch.setattr(app,'ONNXGymAnalyzer',Analyzer)
    monkeypatch.setattr(app,'RTMPoseTracker',Pose)
    monkeypatch.setattr(app,'ExerciseRepTracker',Tracker)
    monkeypatch.setattr(app,'SessionLogger',lambda:object())
    monkeypatch.setattr(app,'analyze_squat_video',analyze)
    monkeypatch.setattr(app,'print_result',lambda *args:None)
    monkeypatch.setattr(app,'render_dashboard',render)
    monkeypatch.setattr(app,'open_camera_capture',open_camera)
    monkeypatch.setattr(app.cv2,'VideoCapture',lambda *args:video)
    for name in ('namedWindow','resizeWindow','imshow','destroyAllWindows'):
        monkeypatch.setattr(app.cv2,name,lambda *args:None)
    monkeypatch.setattr(app.cv2,'setMouseCallback',lambda window,handler:mouse.update(handler=handler))
    monkeypatch.setattr(app.cv2,'waitKey',wait_key)
    monkeypatch.setattr(app,'pick_video_file',lambda:pytest.fail('Camera failure must not open a blocking file picker'))
    video_path_arg=[True]
    def run(sequence,with_video=True):
        keys.extend(sequence);video_path_arg[0]=with_video
        args=['app.py','--device','cpu','--output',str(tmp_path/'output.json')]
        if with_video:args.extend(['--video',str(video_path)])
        monkeypatch.setattr(sys,'argv',args);app.main()
        return renders,events
    return run,video


def test_all_four_keys_change_visible_exercise_and_clear_previous_result(ui):
    run,video=ui
    renders,events=run([ord('2'),ord('3'),ord('4'),ord('q')])
    assert [r['exercise'] for r in renders]==['squat','push_up','jump_jack','situp']
    assert all(r['result'] is None for r in renders[1:])
    assert len([e for e in events if e[0]=='rewind'])==3


def test_switch_after_eof_restarts_video_for_new_exercise(ui):
    run,video=ui;video.total=1
    # Let the new selection paint once before whole-video analysis starts.
    renders,events=run([0,ord('2'),0,ord('q')])
    assert renders[1]['state']=='HẾT VIDEO'
    assert renders[2]['exercise']=='push_up' and renders[2]['state']!='HẾT VIDEO'
    assert len([e for e in events if e[0]=='pose'])==2


def test_mouse_button_changes_exercise_without_keyboard(ui):
    run,_=ui;renders,_=run(['mouse2',ord('q')])
    assert renders[-1]['exercise']=='push_up' and renders[-1]['result'] is None


def test_camera_retry_releases_previous_handle_and_keeps_selection_working(ui):
    run,_=ui
    renders,events=run([ord('c'),ord('c'),ord('2'),ord('q')])
    operations=[e[0] for e in events if e[0] in ('release_video','release_camera','open_camera')]
    assert operations[:4]==['release_video','open_camera','release_camera','open_camera']
    assert renders[-1]['exercise']=='push_up'
    assert renders[-1]['camera']['state']=='error' and renders[-1]['frame'] is None


def test_camera_failure_at_start_keeps_gui_available(ui):
    run,_=ui;renders,_=run([ord('2'),ord('q')],with_video=False)
    assert renders[-1]['exercise']=='push_up' and renders[-1]['camera']['state']=='error'


def test_hung_camera_driver_times_out_without_blocking_caller(tmp_path):
    worker=tmp_path/'hung.py';worker.write_text('import time\ntime.sleep(30)\n',encoding='utf-8')
    started=time.monotonic()
    camera=CameraCapture(worker_path=worker,candidates=[(0,'fixture',0)],attempt_timeout=.8,overall_timeout=1.5)
    assert time.monotonic()-started<.5
    try:
        deadline=started+4
        while camera.status()['state']!='error' and time.monotonic()<deadline:time.sleep(.03)
        assert camera.status()['state']=='error' and camera.status()['attempts']
        assert camera.read()==(False,None)
    finally:camera.release()
    assert time.monotonic()-started<4


def test_real_process_streams_latest_frame_and_releases_worker(tmp_path):
    worker=tmp_path/'frames.py'
    worker.write_text("import sys,struct,time\npayload=struct.pack('<II',10,20)+bytes([123])*600\nsys.stdout.buffer.write(struct.pack('<cI',b'F',len(payload))+payload)\nsys.stdout.buffer.flush()\ntime.sleep(30)\n",encoding='utf-8')
    camera=CameraCapture(worker_path=worker,candidates=[(0,'fixture',0)],attempt_timeout=2.)
    try:
        deadline=time.monotonic()+4
        while camera.status()['state']!='live' and time.monotonic()<deadline:time.sleep(.03)
        ok,frame=camera.read();assert ok and frame.shape==(10,20,3) and (frame==123).all()
        assert camera.read()==(False,None)
        process=camera._process
    finally:camera.release()
    assert process.poll() is not None and camera.status()['state']=='closed'


def test_malformed_camera_frame_is_rejected():
    with pytest.raises(ValueError):decode_frame(FRAME_HEADER.pack(480,640)+b'partial')
