import json
from pathlib import Path
import struct
import sys
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server.app import create_app
from server.protocol import decode_packet, encode_packet, MAX_FRAME_BYTES


class FakeEngine:
    def __init__(self):
        self.paths = []
    def describe(self):
        return {'device': 'cpu', 'pose_providers': ['CPUExecutionProvider']}
    def exercises(self):
        return [{'id': key} for key in ('squat', 'push_up', 'jump_jack', 'situp')]
    def supports_whole_video(self,exercise):
        return exercise in ('squat','push_up','jump_jack','situp')
    def create_session(self, exercise, source, generation):
        return SimpleNamespace(exercise=exercise, source=source, generation=generation, count=0)
    def process(self, state, meta, jpeg):
        state.count += 1
        return {'type': 'result', 'generation': state.generation, 'frame_id': meta['frame_id'],
                'exercise': state.exercise, 'rep_count': state.count, 'metrics': {}}
    def analyze_video(self, path, exercise):
        assert path.is_file() and path.read_bytes() == b'video-fixture'
        self.paths.append(path)
        return {'exercise': exercise, 'source': {'file': 'input.mp4'},
                'comparison': {'benchmark': True, 'exact_match': True}}


@pytest.fixture
def api():
    engine = FakeEngine()
    with TestClient(create_app(engine=engine)) as client:
        yield client, engine


def test_health_and_exercise_catalog(api):
    client, _ = api
    assert client.get('/api/health').json()['ready']
    assert len(client.get('/api/exercises').json()['exercises']) == 4
    response = client.get('/api/health', headers={'Origin': 'http://localhost:8080'})
    assert response.headers['access-control-allow-origin'] == 'http://localhost:8080'


def configure(ws, generation=1, exercise='squat'):
    ws.send_json({'type': 'configure', 'exercise': exercise, 'source': 'camera', 'generation': generation})
    assert ws.receive_json()['type'] == 'ready'


def test_websocket_uses_separate_client_state_and_reset(api):
    client, _ = api
    with client.websocket_connect('/ws/live') as first, client.websocket_connect('/ws/live') as second:
        assert first.receive_json()['type'] == second.receive_json()['type'] == 'connected'
        configure(first); configure(second, exercise='jump_jack')
        for ws, expected in ((first, 1), (first, 2), (second, 1)):
            ws.send_bytes(encode_packet({'frame_id': expected, 'timestamp': expected, 'generation': 1}, b'jpeg'))
            assert ws.receive_json()['rep_count'] == expected
        configure(first, generation=2, exercise='push_up')
        first.send_bytes(encode_packet({'frame_id': 3, 'timestamp': 3, 'generation': 2}, b'jpeg'))
        response = first.receive_json()
        assert response['rep_count'] == 1 and response['exercise'] == 'push_up'
        assert client.get('/api/health').json()['active_clients'] == 2
    assert client.get('/api/health').json()['active_clients'] == 0


def test_websocket_rejects_stale_frame_and_invalid_commands(api):
    client, _ = api
    with client.websocket_connect('/ws/live') as ws:
        ws.receive_json(); configure(ws)
        ws.send_bytes(encode_packet({'frame_id': 1, 'timestamp': 1, 'generation': 0}, b'jpeg'))
        assert ws.receive_json()['type'] == 'error'
        ws.send_json({'type': 'configure', 'exercise': 'invalid'})
        assert ws.receive_json()['type'] == 'error'
        ws.send_bytes(encode_packet({'frame_id': 1, 'timestamp': 1, 'generation': 1}, b'jpeg'))
        assert ws.receive_json()['type'] == 'result'


def test_websocket_rejects_unknown_origin(api):
    client, _ = api
    from starlette.websockets import WebSocketDisconnect
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect('/ws/live', headers={'Origin': 'http://untrusted.example'}):
            pass


@pytest.mark.parametrize('packet', [b'', struct.pack('<I', 5000)+b'x',
    encode_packet({'frame_id': 1, 'timestamp': float('nan')}, b'jpeg'),
    encode_packet({'frame_id': True, 'timestamp': 1}, b'jpeg'),
    b'x' * (MAX_FRAME_BYTES + 1)], ids=['empty', 'oversized_metadata', 'nonfinite_timestamp', 'boolean_frame_id', 'oversized_frame'])
def test_protocol_rejects_invalid_packets(packet):
    with pytest.raises(ValueError):
        decode_packet(packet)


def test_video_upload_is_temporary_and_preserves_filename(api):
    client, engine = api
    response = client.post('/api/analyze-video', data={'exercise': 'squat'},
                           files={'file': ('my_squat.mp4', b'video-fixture', 'video/mp4')})
    assert response.status_code == 200
    assert response.json()['result']['source']['file'] == 'my_squat.mp4'
    assert 'benchmark' not in response.json()['result']['comparison']
    assert all(not path.exists() for path in engine.paths)


def test_video_upload_rejects_unsupported_exercise_and_extension(api):
    client, _ = api
    for exercise, name in [('unknown', 'clip.mp4'), ('squat', 'script.py')]:
        response = client.post('/api/analyze-video', data={'exercise': exercise}, files={'file': (name, b'bad')})
        assert response.status_code == 400


@pytest.mark.parametrize('exercise',['push_up','situp'])
def test_new_multilabel_exercises_accept_whole_video(api,exercise):
    client,_=api
    response=client.post('/api/analyze-video',data={'exercise':exercise},
                         files={'file':('clip.mp4',b'video-fixture','video/mp4')})
    assert response.status_code==200 and response.json()['result']['exercise']==exercise
