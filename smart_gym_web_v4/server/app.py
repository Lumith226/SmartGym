"""Run with: python -m server.app --device cuda --port 8001 (from smart_gym_web_v4)."""
import argparse
import asyncio
from contextlib import asynccontextmanager
import json
import logging
import os
from pathlib import Path
import tempfile
import time

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .engine import ALLOWED_EXERCISES, InferenceEngine, json_safe
from .protocol import MAX_FRAME_BYTES, decode_packet

LOGGER = logging.getLogger('smartgym.web')
MAX_UPLOAD_BYTES = 200 * 1024 * 1024


def create_app(engine=None, device=None):
    origins = [value.strip() for value in os.getenv('GYM_WEB_ORIGINS',
               'http://localhost:8080,http://127.0.0.1:8080').split(',') if value.strip()]

    @asynccontextmanager
    async def lifespan(app):
        app.state.engine = engine
        app.state.startup_error = None
        app.state.gpu_lock = asyncio.Lock()
        app.state.clients = 0
        if app.state.engine is None:
            try:
                app.state.engine = await asyncio.to_thread(InferenceEngine, device or os.getenv('GYM_DEVICE', 'auto'))
            except Exception as exc:
                LOGGER.exception('Không khởi tạo được mô hình')
                app.state.startup_error = str(exc)
        yield

    app = FastAPI(title='Smart Gym V4 — Server AI local', lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=origins,
                       allow_methods=['GET', 'POST'], allow_headers=['*'])

    def require_engine():
        if app.state.engine is None:
            raise HTTPException(503, detail=app.state.startup_error or 'Mô hình chưa sẵn sàng.')
        return app.state.engine

    @app.get('/api/health')
    async def health():
        ready = app.state.engine is not None
        return {'ready': ready, 'service': 'Smart Gym V4 AI',
                'error': app.state.startup_error,
                'active_clients': app.state.clients,
                'inference_busy': app.state.gpu_lock.locked(),
                'runtime': app.state.engine.describe() if ready else None}

    @app.get('/api/exercises')
    async def exercises():
        return {'exercises': require_engine().exercises()}

    @app.websocket('/ws/live')
    async def live(socket: WebSocket):
        origin = socket.headers.get('origin')
        if origin and origin not in origins:
            await socket.close(code=1008, reason='Origin không được phép.')
            return
        await socket.accept()
        if app.state.engine is None:
            await socket.send_json({'type': 'error', 'message': app.state.startup_error or 'Mô hình chưa sẵn sàng.'})
            await socket.close(code=1011)
            return
        if app.state.clients >= 4:
            await socket.send_json({'type': 'error', 'message': 'Bản local hỗ trợ tối đa 4 phiên kết nối. Hãy đóng tab không sử dụng.'})
            await socket.close(code=1013)
            return
        app.state.clients += 1
        state = None
        try:
            await socket.send_json({'type': 'connected', 'message': 'Đã kết nối server AI.'})
            while True:
                message = await socket.receive()
                if message['type'] == 'websocket.disconnect':
                    break
                try:
                    if message.get('text') is not None:
                        if len(message['text']) > 4096:
                            raise ValueError('Thông điệp điều khiển quá lớn.')
                        command = json.loads(message['text'])
                        if not isinstance(command, dict):
                            raise ValueError('Thông điệp điều khiển không hợp lệ.')
                        if command.get('type') == 'ping':
                            await socket.send_json({'type': 'pong'})
                            continue
                        if command.get('type') != 'configure':
                            raise ValueError('Lệnh không được hỗ trợ.')
                        exercise = command.get('exercise', 'squat')
                        source = command.get('source', 'camera')
                        generation = command.get('generation', 0)
                        if exercise not in ALLOWED_EXERCISES or source not in ('camera', 'video'):
                            raise ValueError('Bài tập hoặc nguồn hình không hợp lệ.')
                        if not isinstance(generation, int) or isinstance(generation, bool):
                            raise ValueError('Mã phiên không hợp lệ.')
                        state = app.state.engine.create_session(exercise, source, generation)
                        await socket.send_json({'type': 'ready', 'exercise': exercise,
                                                'source': source, 'generation': generation})
                    elif message.get('bytes') is not None:
                        if state is None:
                            raise ValueError('Hãy chọn bài trước khi gửi hình.')
                        meta, jpeg = decode_packet(message['bytes'])
                        if meta.get('generation') != state.generation:
                            raise ValueError('Khung hình thuộc phiên cũ; hãy kết nối lại.')
                        queued = time.perf_counter()
                        async with app.state.gpu_lock:
                            queue_ms = (time.perf_counter() - queued) * 1000
                            result = await asyncio.to_thread(app.state.engine.process, state, meta, jpeg)
                        result['metrics']['queue_ms'] = round(queue_ms, 2)
                        await socket.send_json(json_safe(result))
                except (ValueError, UnicodeError, KeyError, TypeError) as exc:
                    await socket.send_json({'type': 'error', 'message': str(exc),
                                            'generation': getattr(state, 'generation', None)})
        except WebSocketDisconnect:
            pass
        except Exception:
            LOGGER.exception('Lỗi phiên nhận diện')
            try:
                await socket.send_json({'type': 'error', 'message': 'Phiên AI gặp lỗi. Hãy kết nối lại và kiểm tra cửa sổ server.'})
            except Exception:
                pass
        finally:
            app.state.clients -= 1

    @app.post('/api/analyze-video')
    async def analyze_video(exercise: str = Form(...), file: UploadFile = File(...)):
        ai = require_engine()
        supported=ai.supports_whole_video(exercise) if hasattr(ai,'supports_whole_video') else exercise in ('squat','jump_jack')
        if not supported:
            raise HTTPException(400, 'Bài tập chưa có mô hình V4 nhiều nhãn để phân tích toàn video.')
        suffix = Path(file.filename or '').suffix.lower()
        if suffix not in ('.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'):
            raise HTTPException(400, 'Định dạng video chưa hỗ trợ.')
        try:
            with tempfile.TemporaryDirectory(prefix='smartgym-v4-') as folder:
                path = Path(folder) / ('input' + suffix)
                size = 0
                with path.open('wb') as stream:
                    while chunk := await file.read(1024 * 1024):
                        size += len(chunk)
                        if size > MAX_UPLOAD_BYTES:
                            raise HTTPException(413, 'Video vượt giới hạn 200 MB.')
                        stream.write(chunk)
                if size == 0:
                    raise HTTPException(400, 'Video rỗng.')
                started = time.perf_counter()
                async with app.state.gpu_lock:
                    result = await asyncio.to_thread(ai.analyze_video, path, exercise)
                if 'source' in result:
                    result['source']['file'] = Path(file.filename).name
                # Internal reference provenance is not part of the browser contract.
                if result.get('comparison'):
                    result['comparison'].pop('benchmark', None)
                return json_safe({'result': result, 'elapsed_seconds': round(time.perf_counter() - started, 2)})
        except HTTPException:
            raise
        except (ValueError, OSError, RuntimeError) as exc:
            LOGGER.exception('Không phân tích được video')
            raise HTTPException(422, 'Không phân tích được video. '+str(exc)) from exc
        finally:
            await file.close()

    return app


app = create_app()


if __name__ == '__main__':
    import uvicorn
    parser = argparse.ArgumentParser(description='SERVER AI: mô hình V4 chạy trên Python')
    parser.add_argument('--device', choices=['auto', 'cuda', 'cpu'], default='auto')
    parser.add_argument('--port', type=int, default=8001)
    args = parser.parse_args()
    uvicorn.run(create_app(device=args.device), host='127.0.0.1', port=args.port,
                ws='wsproto', ws_max_size=MAX_FRAME_BYTES, access_log=False)
