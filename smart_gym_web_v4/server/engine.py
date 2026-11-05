"""Adapter for the existing models. No weight, threshold or training changes."""
from collections import deque
from pathlib import Path
import sys
import time

import cv2
import numpy as np

PROJECT = Path(__file__).resolve().parents[2]
LEGACY_APP = PROJECT / 'smart_gym_test_rtmpose_v4'
sys.path.insert(0, str(LEGACY_APP))

EXERCISES = (
    {'id': 'squat', 'name': 'Squat', 'subtitle': 'Gánh đùi', 'version': 'V4', 'label_count': 14},
    {'id': 'jump_jack', 'name': 'Jumping jacks', 'subtitle': 'Bật nhảy dang tay chân', 'version': 'V4', 'label_count': 29},
    {'id': 'push_up', 'name': 'Chống đẩy', 'subtitle': 'Nhiều nhãn Qualcomm', 'version': 'V4', 'label_count': 21},
    {'id': 'situp', 'name': 'Gập bụng ngược', 'subtitle': 'Nhiều nhãn Qualcomm', 'version': 'V4', 'label_count': 19},
)
ALLOWED_EXERCISES = {row['id'] for row in EXERCISES}


class LiveSession:
    def __init__(self, engine, exercise='squat', source='camera', generation=0):
        from rep_tracker import ExerciseRepTracker
        self.exercise = exercise
        self.source = source
        self.generation = generation
        self.tracker = ExerciseRepTracker(engine.analyzer)
        self.tracker.reset(exercise)
        self.previous_center = None
        self.history = deque(maxlen=360)
        self.latest = None
        self.latest_rep = None
        self.last_prediction = -float('inf')
        self.last_timestamp = None
        self.last_found = None
        self.last_frame_id = -1


class InferenceEngine:
    def __init__(self, device='auto'):
        from onnx_gym_analyzer import ONNXGymAnalyzer
        from rtmpose_tracker import RTMPoseTracker
        import onnxruntime as ort
        import torch
        if device == 'auto':
            device = 'cuda' if torch.cuda.is_available() and 'CUDAExecutionProvider' in ort.get_available_providers() else 'cpu'
        self.device = device
        self.analyzer = ONNXGymAnalyzer(device)
        self.pose = RTMPoseTracker(device=device)
        self.analyzer.load_squat_contract()
        self.analyzer.load_jumpjack_contract()
        # Load once; requests and sessions reuse these ONNX Runtime sessions.
        for exercise in ALLOWED_EXERCISES:
            from onnx_gym_analyzer import EXERCISE_CONFIG
            if EXERCISE_CONFIG[exercise].get('is_multihead',False):
                self.analyzer.load_v4_contract(exercise)
            self.analyzer.get_session(exercise)
        # Allocate inference buffers before advertising ready, not on the first
        # camera frame. Warm-up values never become observations or predictions.
        self.pose.body.det_model(np.zeros((480, 640, 3), dtype=np.uint8))
        for session in [self.pose.body.pose_model.session, *self.analyzer.sessions.values()]:
            feed = {item.name: np.zeros([dim if isinstance(dim, int) and dim > 0 else 1
                                       for dim in item.shape], dtype=np.float32)
                    for item in session.get_inputs()}
            session.run(None, feed)

    def describe(self):
        return {'device': self.device,
                'pose_providers': self.pose.body.pose_model.session.get_providers(),
                'detector_providers': self.pose.body.det_model.session.get_providers(),
                'models': {key: value.get_providers() for key, value in self.analyzer.sessions.items()}}

    def exercises(self):
        from onnx_gym_analyzer import EXERCISE_CONFIG
        rows = []
        for exercise in EXERCISES:
            row = dict(exercise)
            key = row['id']
            if EXERCISE_CONFIG[key].get('is_multihead',False):
                contract = self.analyzer.load_v4_contract(key)
                row['version']='V4';row['label_count']=len(contract['labels'])
                row['subtitle']='Nhiều nhãn Qualcomm'
                row['labels'] = [{k: label.get(k) for k in
                                  ('key', 'raw_label', 'name_vi', 'kind', 'threshold', 'rep_supported', 'calibrated')}
                                 for label in contract['labels']]
            else:
                row['labels'] = [{'key': key_, 'name_vi': value['name_vi'], 'kind': 'legacy', 'threshold': None}
                                 for key_, value in EXERCISE_CONFIG[key]['details'].items()]
            rows.append(row)
        return rows

    def create_session(self, exercise, source, generation):
        return LiveSession(self, exercise, source, generation)

    def supports_whole_video(self,exercise):
        from onnx_gym_analyzer import EXERCISE_CONFIG
        return exercise in ALLOWED_EXERCISES and EXERCISE_CONFIG[exercise].get('is_multihead',False)

    def process(self, state, meta, jpeg):
        started = time.perf_counter()
        timestamp = float(meta['timestamp'])
        if meta['frame_id'] <= state.last_frame_id:
            raise ValueError('Khung hình bị lặp hoặc sai thứ tự; hãy bắt đầu lại phiên.')
        if state.last_timestamp is not None:
            if timestamp <= state.last_timestamp:
                raise ValueError('Thời gian phải tăng; hãy đặt lại phiên khi tua video.')
            if timestamp - state.last_timestamp > 2:
                state.tracker.reset(state.exercise)
                state.history.clear()
                state.latest = state.latest_rep = None
                state.previous_center = None
                state.last_found = None
                state.last_prediction = -float('inf')
        frame = cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR)
        if frame is None or frame.size == 0:
            raise ValueError('Không giải mã được ảnh JPEG.')
        h, w = frame.shape[:2]
        if h > 1920 or w > 1920 or h * w > 1920 * 1080:
            raise ValueError('Ảnh quá lớn; hãy gửi ảnh có cạnh dài tối đa 960 pixel.')
        state.last_timestamp = timestamp
        state.last_frame_id = meta['frame_id']
        self.analyzer.frame_aspect_ratio = w / h
        # The GPU engine is shared under a lock, while tracking state is per client.
        self.pose.previous_center = state.previous_center
        pose_started = time.perf_counter()
        found, keypoints = self.pose.process_frame(frame)
        pose_ms = (time.perf_counter() - pose_started) * 1000
        state.previous_center = self.pose.previous_center
        just_finished = False
        observed_state = state.tracker.state
        if found:
            state.last_found = timestamp
            info = state.tracker.process_frame(keypoints, timestamp=timestamp)
            observed_state=info.get('state',state.tracker.state)
            just_finished = bool(info.get('just_finished_rep'))
            if just_finished:
                state.latest_rep = info.get('last_result')
            corrected = keypoints.copy()
            corrected[0] *= w / h
            state.history.append((timestamp, corrected))
            # Keep an actual six-second window, independent of transport FPS.
            while state.history and timestamp - state.history[0][0] > 6:
                state.history.popleft()
            if info.get('need_full_body') and state.exercise in ('push_up','situp'):
                state.latest=state.latest_rep=None;state.history.clear()
            elif self.supports_whole_video(state.exercise):
                if (len(state.history) >= 20 and timestamp - state.history[0][0] >= 1
                        and timestamp - state.last_prediction >= .75):
                    from onnx_gym_analyzer import V4_STEMS
                    predict = getattr(self.analyzer,'predict_'+V4_STEMS[state.exercise]+'_sequence')
                    state.latest = predict([item[1] for item in state.history],
                                           timestamp - state.history[0][0], scope='window')
                    state.last_prediction = timestamp
            else:
                state.latest = state.latest_rep
        else:
            state.tracker.notify_missing(timestamp)
            # Never show a previous prediction as a fresh observation after losing pose.
            if state.last_found is None or timestamp - state.last_found >= .75:
                state.history.clear()
                state.latest = state.latest_rep = None
                state.previous_center = None
                state.last_prediction = -float('inf')
        result = state.latest if found else None
        return {
            'type': 'result', 'generation': state.generation,
            'frame_id': meta['frame_id'], 'timestamp': timestamp,
            'exercise': state.exercise, 'found': bool(found),
            'keypoints': keypoints.T.tolist() if found else [],
            'rep_count': state.tracker.rep_count, 'just_finished_rep': just_finished,
            'state': observed_state if found else 'CHỜ KHỚP',
            'result': result, 'rep_result': state.latest_rep if found else None,
            'metrics': {'pose_ms': round(pose_ms, 2),
                        'server_ms': round((time.perf_counter() - started) * 1000, 2)},
        }

    def analyze_video(self, path, exercise):
        from video_tools import analyze_squat_video
        from onnx_gym_analyzer import V4_STEMS
        result, _ = analyze_squat_video(path, self.pose, self.analyzer,
                                       exercise=V4_STEMS[exercise])
        return result


def json_safe(value):
    """Remove numpy values and non-finite numbers from inference responses."""
    if isinstance(value, np.ndarray):
        return json_safe(value.tolist())
    if isinstance(value, np.generic):
        return json_safe(value.item())
    if isinstance(value, dict):
        return {str(k): json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(v) for v in value]
    if isinstance(value, float) and not np.isfinite(value):
        return None
    return value
