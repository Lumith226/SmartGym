"""Camera-driver worker: raw BGR frames over stdout, never touches model weights."""
import argparse
import json
import sys
import time
import cv2
from camera_capture import FRAME_HEADER,write_packet


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--index',type=int,required=True)
    parser.add_argument('--backend',type=int,required=True);args=parser.parse_args()
    stream=sys.stdout.buffer;cap=None
    def error(message):write_packet(stream,b'S',json.dumps({'error':message},ensure_ascii=False).encode('utf-8'))
    def stage(name):write_packet(stream,b'S',json.dumps({'stage':name}).encode('utf-8'))
    try:
        stage('opening_device')
        cap=cv2.VideoCapture(args.index,args.backend)
        if not cap.isOpened():error(f'Không mở được camera {args.index}. Kiểm tra thiết bị, quyền truy cập và ứng dụng đang dùng camera.');return
        stage('configuring_device')
        cap.set(cv2.CAP_PROP_FOURCC,cv2.VideoWriter_fourcc(*'MJPG'))
        cap.set(cv2.CAP_PROP_FRAME_WIDTH,640);cap.set(cv2.CAP_PROP_FRAME_HEIGHT,480)
        cap.set(cv2.CAP_PROP_FPS,30);cap.set(cv2.CAP_PROP_BUFFERSIZE,1)
        stage('reading_frames')
        bad_reads=0
        while True:
            ok,frame=cap.read()
            if not ok or frame is None or not frame.size:
                bad_reads+=1
                if bad_reads>=25:error(f'Camera {args.index} mở được nhưng không trả hình.');return
                time.sleep(.08);continue
            bad_reads=0
            if frame.ndim==2:frame=cv2.cvtColor(frame,cv2.COLOR_GRAY2BGR)
            elif frame.shape[2]==4:frame=cv2.cvtColor(frame,cv2.COLOR_BGRA2BGR)
            h,w=frame.shape[:2]
            if w>1280 or h>960:
                scale=min(1280/w,960/h);frame=cv2.resize(frame,(int(w*scale),int(h*scale)));h,w=frame.shape[:2]
            write_packet(stream,b'F',FRAME_HEADER.pack(h,w)+frame.tobytes())
    except (BrokenPipeError,OSError):pass
    except Exception as exc:
        try:error(str(exc))
        except (BrokenPipeError,OSError):pass
    finally:
        if cap is not None:cap.release()


if __name__=='__main__':main()
