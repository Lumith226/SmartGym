"""Nonblocking webcam reader; isolate blocking Windows drivers in a child process."""
import json
from pathlib import Path
import queue
import struct
import subprocess
import sys
import threading
import time
import cv2
import numpy as np

HEADER=struct.Struct('<cI')
FRAME_HEADER=struct.Struct('<II')
MAX_PACKET=32*1024*1024


def write_packet(stream,kind,payload):
    stream.write(HEADER.pack(kind,len(payload)));stream.write(payload);stream.flush()


def read_exact(stream,size):
    data=bytearray()
    while len(data)<size:
        part=stream.read(size-len(data))
        if not part:raise EOFError('Camera worker closed its stream')
        data.extend(part)
    return bytes(data)


def decode_frame(payload):
    if len(payload)<FRAME_HEADER.size:raise ValueError('Incomplete camera frame')
    h,w=FRAME_HEADER.unpack(payload[:FRAME_HEADER.size])
    if not (0<h<=4096 and 0<w<=4096) or len(payload)-FRAME_HEADER.size!=h*w*3:
        raise ValueError('Invalid camera frame dimensions')
    return np.frombuffer(payload,dtype=np.uint8,offset=FRAME_HEADER.size).reshape(h,w,3).copy()


class CameraCapture:
    """VideoCapture-compatible latest-frame source; opening never blocks the GUI."""
    def __init__(self,preferred_index=None,attempt_timeout=8.,overall_timeout=30.,worker_path=None,candidates=None):
        indices=[preferred_index] if preferred_index is not None else [0,1,2]
        backends=[('DirectShow',cv2.CAP_DSHOW),('Media Foundation',cv2.CAP_MSMF)] if sys.platform=='win32' else [('Tự động',cv2.CAP_ANY)]
        self.candidates=candidates or [(i,name,backend) for i in indices for name,backend in backends]
        self.attempt_timeout=attempt_timeout;self.overall_timeout=overall_timeout
        self.worker_path=Path(worker_path or Path(__file__).with_name('camera_worker.py'))
        self._lock=threading.Lock();self._stop=threading.Event();self._process=None
        self._frame=None;self._serial=0;self._consumed=0;self.frame_timestamp=0.
        self.state='opening';self.message='Đang mở camera…';self.index=preferred_index;self.backend=''
        self.attempts=[]
        self._thread=threading.Thread(target=self._run,name='gym-camera-supervisor',daemon=True)
        self._thread.start()

    def _status(self,state,message):
        with self._lock:self.state=state;self.message=message

    def status(self):
        with self._lock:
            return {'state':self.state,'message':self.message,'index':self.index,'backend':self.backend,
                    'frames_received':self._serial,'attempts':list(self.attempts)}

    def isOpened(self):
        return not self._stop.is_set() and self.state in ('opening','live')

    def read(self):
        with self._lock:
            if self.state!='live' or self._frame is None or self._serial==self._consumed:return False,None
            self._consumed=self._serial;self.frame_timestamp=self._received_at
            return True,self._frame.copy()

    def get(self,prop):
        if prop==cv2.CAP_PROP_FPS:return 30.
        with self._lock:
            if self._frame is not None:
                if prop==cv2.CAP_PROP_FRAME_WIDTH:return self._frame.shape[1]
                if prop==cv2.CAP_PROP_FRAME_HEIGHT:return self._frame.shape[0]
        return 0.

    @staticmethod
    def _terminate(process):
        if process is None:return
        try:
            if process.poll() is None:
                process.terminate()
                try:process.wait(timeout=.7)
                except subprocess.TimeoutExpired:process.kill();process.wait(timeout=.7)
        except (ProcessLookupError,OSError):pass

    def release(self):
        self._stop.set()
        self._terminate(self._process)
        self._thread.join(timeout=1.5)
        with self._lock:self.state='closed';self._frame=None

    def _read_packets(self,process,events):
        def send(value):
            try:events.put_nowait(value)
            except queue.Full:
                try:events.get_nowait()
                except queue.Empty:pass
                try:events.put_nowait(value)
                except queue.Full:pass
        try:
            while not self._stop.is_set():
                kind,length=HEADER.unpack(read_exact(process.stdout,HEADER.size))
                if kind not in (b'F',b'S') or length>MAX_PACKET:raise ValueError('Invalid camera stream')
                send((kind,read_exact(process.stdout,length)))
        except (EOFError,OSError,ValueError) as exc:send((b'E',str(exc).encode('utf-8')))

    def _run(self):
        started=time.monotonic()
        for index,name,backend in self.candidates:
            if self._stop.is_set() or time.monotonic()-started>=self.overall_timeout:break
            with self._lock:
                self.index=index;self.backend=name;self._frame=None
            self._status('opening',f'Đang mở camera {index} ({name})…')
            process=None;failure='Không nhận được hình';attempt_start=time.monotonic();got_frame=False;stage='starting_worker'
            events=queue.Queue(maxsize=2)
            try:
                process=subprocess.Popen([sys.executable,'-u',str(self.worker_path),'--index',str(index),'--backend',str(backend)],
                    stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,
                    creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
                self._process=process
                if self._stop.is_set():break
                reader=threading.Thread(target=self._read_packets,args=(process,events),daemon=True);reader.start()
                last_frame=attempt_start
                while not self._stop.is_set():
                    now=time.monotonic()
                    if not got_frame and (now-attempt_start>self.attempt_timeout or now-started>self.overall_timeout):
                        failure=f'Camera {index} ({name}) không phản hồi trong thời gian cho phép';break
                    if got_frame and now-last_frame>3.:
                        failure=f'Camera {index} bị mất hình';break
                    try:kind,payload=events.get(timeout=.1)
                    except queue.Empty:continue
                    if kind==b'E':
                        failure='Tiến trình đọc camera đã ngắt kết nối: '+payload.decode('utf-8',errors='replace')
                        break
                    if kind==b'S':
                        info=json.loads(payload)
                        if info.get('error'):failure=info['error'];break
                        stage=info.get('stage',stage)
                    else:
                        frame=decode_frame(payload);last_frame=time.monotonic();got_frame=True
                        with self._lock:
                            self._frame=frame;self._serial+=1;self._received_at=last_frame
                        self._status('live',f'Camera {index} đang phát ({name})')
            except (OSError,ValueError) as exc:failure=str(exc)
            finally:
                self._terminate(process)
                if process and process.stdout:process.stdout.close()
                self._process=None
            if not self._stop.is_set():
                with self._lock:self.attempts.append({'index':index,'backend':name,'stage':stage,'error':failure,'seconds':round(time.monotonic()-attempt_start,2)})
        if not self._stop.is_set():
            self._status('error','Không nhận được hình camera. Kiểm tra camera trong ứng dụng Camera của Windows rồi đóng ứng dụng đó; bấm C thử lại hoặc V chọn video.')


if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('--camera-id',type=int,default=0)
    parser.add_argument('--timeout',type=float,default=8.)
    args=parser.parse_args();camera=CameraCapture(args.camera_id,attempt_timeout=args.timeout,overall_timeout=args.timeout*2)
    try:
        deadline=time.monotonic()+args.timeout*2+2
        while time.monotonic()<deadline:
            ok,frame=camera.read()
            if ok or camera.status()['state']=='error':break
            time.sleep(.05)
        print(json.dumps(camera.status(),ensure_ascii=False,indent=2))
    finally:camera.release()
