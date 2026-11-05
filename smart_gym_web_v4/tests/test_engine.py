"""Coordinate, source-clock and stale-observation regression checks."""
from collections import deque
from pathlib import Path
from types import SimpleNamespace
import sys
import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server.engine import InferenceEngine


class Tracker:
    rep_count = 0
    state = 'READY'
    def reset(self, *args):
        self.rep_count = 0
    def process_frame(self, points, timestamp):
        return {}
    def notify_missing(self, timestamp):
        return True


class Pose:
    previous_center = None
    found = True
    def process_frame(self, frame):
        return self.found, np.array([[.5]*17, [.5]*17, [.9]*17], np.float32)


class Analyzer:
    def __init__(self):
        self.calls = []
    def predict_squat_sequence(self, frames, duration, scope):
        self.calls.append((frames, duration, scope))
        return {'scope': scope, 'label_results': []}


@pytest.fixture
def inference():
    engine = InferenceEngine.__new__(InferenceEngine)
    engine.pose = Pose(); engine.analyzer = Analyzer()
    state = SimpleNamespace(exercise='squat', source='video', generation=1, tracker=Tracker(),
                            previous_center=None, history=deque(maxlen=360), latest=None, latest_rep=None,
                            last_prediction=-float('inf'), last_timestamp=None, last_found=None, last_frame_id=-1)
    jpeg = cv2.imencode('.jpg', np.zeros((100, 200, 3), np.uint8))[1].tobytes()
    def run(index, timestamp):
        return engine.process(state, {'frame_id': index, 'timestamp': timestamp}, jpeg)
    return engine, state, run


def test_window_uses_source_time_and_converts_width_coordinates(inference):
    engine, state, run = inference
    for i in range(125):
        response = run(i, i / 10)
    assert response['found'] and engine.analyzer.calls
    assert state.history[-1][0] - state.history[0][0] <= 6
    frames, duration, scope = engine.analyzer.calls[-1]
    assert scope == 'window' and 1 <= duration <= 6
    assert frames[0][0, 0] == 1.0  # x / height = (x / width) * aspect 2
    assert response['keypoints'][0][0] == .5  # browser overlay keeps x / width


def test_lost_pose_clears_previous_result(inference):
    engine, state, run = inference
    for i in range(25):
        run(i, i / 10)
    assert state.latest is not None
    engine.pose.found = False
    response = run(25, 3.3)
    assert response['result'] is None and response['keypoints'] == []
    assert state.latest is None and not state.history


def test_nonmonotonic_frames_are_rejected(inference):
    _, _, run = inference
    run(1, 1)
    with pytest.raises(ValueError): run(1, 1.1)
    with pytest.raises(ValueError): run(2, .9)


def test_long_source_gap_resets_window(inference):
    _, state, run = inference
    for i in range(25):run(i, i / 10)
    state.tracker.rep_count = 7
    response = run(25, 10)
    assert state.tracker.rep_count == 0 and len(state.history) == 1
    assert response['result'] is None


@pytest.mark.parametrize('exercise',['push_up','situp'])
def test_floor_missing_required_joints_cannot_reuse_old_prediction(inference,exercise):
    _,state,run=inference
    state.exercise=exercise
    state.latest=state.latest_rep={'scope':'rep','detected_labels':['old']}
    state.tracker.process_frame=lambda *args,**kwargs:{'need_full_body':True,'state':'CHỜ KHỚP'}
    response=run(0,0.)
    assert response['found'] and response['state']=='CHỜ KHỚP'
    assert response['result'] is None and response['rep_result'] is None
    assert not state.history
