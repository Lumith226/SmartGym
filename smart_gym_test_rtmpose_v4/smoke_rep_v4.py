"""Exercise the real per-frame rep -> new V4 inference path on local videos."""
import argparse
from pathlib import Path
import cv2
from onnx_gym_analyzer import ONNXGymAnalyzer
from rep_tracker import ExerciseRepTracker
from rtmpose_tracker import RTMPoseTracker
from squat_schema import write_json

APP=Path(__file__).resolve().parent


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--exercise',choices=['squat','jumpjack','all'],default='all')
    parser.add_argument('--device',choices=['cpu','cuda'],default='cuda')
    args=parser.parse_args()
    analyzer=ONNXGymAnalyzer(args.device);pose=RTMPoseTracker(device=args.device)
    items=[]
    for exercise in (['squat','jumpjack'] if args.exercise=='all' else [args.exercise]):
        folder='squats' if exercise=='squat' else 'jumping_jacks'
        videos=['CORRECT_00002456.mp4','BACK_ROUNDING_00001672.mp4'] if exercise=='squat' else ['CORRECT_00003013.mp4','NOT_JUMPING_00001425.mp4']
        for name in videos:
            cap=cv2.VideoCapture(str(APP/'test_videos_benchmark'/folder/name))
            if not cap.isOpened():raise FileNotFoundError(name)
            pose.reset();tracker=ExerciseRepTracker(analyzer)
            tracker.reset('squat' if exercise=='squat' else 'jump_jack')
            frames=0;reps=[];fps=cap.get(cv2.CAP_PROP_FPS)
            try:
                while True:
                    ok,frame=cap.read()
                    if not ok:break
                    frames+=1;h,w=frame.shape[:2];analyzer.frame_aspect_ratio=w/h
                    found,kpts=pose.process_frame(frame)
                    if not found:tracker.notify_missing((frames-1)/fps);continue
                    info=tracker.process_frame(kpts,timestamp=(frames-1)/fps)
                    if info['just_finished_rep']:
                        result=info['last_result']
                        assert result['scope']=='rep' and len(result['label_results'])==(14 if exercise=='squat' else 29)
                        assert all(row['rep_supported'] for row in result['detected_labels'])
                        reps.append(result)
            finally:cap.release()
            if name.startswith('CORRECT_') and not reps:
                raise AssertionError('No completed rep on control video: '+name)
            items.append({'exercise':exercise,'video':name,'frames':frames,'rep_count':len(reps),'reps':reps})
            print(exercise,name,'frames=',frames,'completed_reps=',len(reps),flush=True)
    report={'passed':True,'videos':items,'note':'Functional integration smoke test; no annotated rep-count accuracy claim.'}
    path=APP/f'logs/rep_stream_smoke_{args.exercise}_v4.json'
    write_json(path,report)
    print('Saved',path,flush=True)


if __name__=='__main__':main()
