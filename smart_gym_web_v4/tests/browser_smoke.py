"""Real browser + real server/model smoke. Uses a prerecorded fake webcam only."""
from pathlib import Path
import json
import time
import cv2
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / 'smart_gym_web_v4'
RUNTIME = WEB / 'runtime'
APP = ROOT / 'smart_gym_test_rtmpose_v4'
RUNTIME.mkdir(exist_ok=True)
VIDEO = next((APP/'test_videos_benchmark/squats').glob('*.mp4'))
FAKE_CAMERA = RUNTIME / 'test_camera.y4m'


def prepare_fake_camera():
    cap = cv2.VideoCapture(str(VIDEO))
    ok, frame = cap.read()
    if not ok:
        raise RuntimeError('Không đọc được video mẫu')
    h, w = frame.shape[:2]
    with FAKE_CAMERA.open('wb') as stream:
        stream.write(f'YUV4MPEG2 W{w} H{h} F30:1 Ip A1:1 C420\n'.encode())
        while ok:
            stream.write(b'FRAME\n')
            stream.write(cv2.cvtColor(frame, cv2.COLOR_BGR2YUV_I420).tobytes())
            ok, frame = cap.read()
    cap.release()


def main():
    prepare_fake_camera()
    captured, errors = [], []
    floor_checks = {}
    with sync_playwright() as p:
        installed = Path.home()/'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'
        options = {'headless': True, 'args': ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
                     f'--use-file-for-fake-video-capture={FAKE_CAMERA}']}
        if installed.is_file():
            options['executable_path'] = str(installed)
        browser = p.chromium.launch(**options)
        context = browser.new_context(viewport={'width': 1440, 'height': 1100}, permissions=['camera'], reduced_motion='reduce')
        page = context.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        def on_socket(socket):
            def frame(payload):
                try:
                    item = json.loads(payload)
                    if item.get('type') == 'result':
                        captured.append(item)
                except (ValueError, TypeError):
                    pass
            socket.on('framereceived', frame)
        page.on('websocket', on_socket)
        page.goto('http://localhost:8080', wait_until='networkidle')
        page.get_by_text('Server AI đã sẵn sàng', exact=True).wait_for(timeout=30000)
        assert page.locator('#label-rows tr').count() == 14
        page.screenshot(path=str(RUNTIME/'web_initial.png'), full_page=True)

        page.locator('#video-source').click()
        page.locator('#video-file').set_input_files(str(VIDEO))
        page.locator('#start-analysis:not([disabled])').wait_for()
        page.locator('#start-analysis').click()
        page.wait_for_timeout(4000)
        assert any(item.get('found') for item in captured), 'No real pose responses'
        assert any(item.get('result') for item in captured), 'No live V4 predictions'
        page.screenshot(path=str(RUNTIME/'web_video_live.png'), full_page=True)
        page.locator('#analyze-whole').click()
        page.wait_for_function("document.querySelector('#notice').textContent.includes('Đã phân tích toàn video')", timeout=90000)
        assert page.locator('#whole-view').get_attribute('class') == 'active'
        assert page.locator('#result-scope').inner_text() == 'Phạm vi: toàn video'
        page.screenshot(path=str(RUNTIME/'web_video_whole.png'), full_page=True)

        page.keyboard.press('2')
        assert 'Chống đẩy' in page.locator('#selected-name').inner_text()
        assert page.locator('#label-rows tr').count() == 21
        assert page.locator('#whole-view').is_disabled()
        page.keyboard.press('3')
        assert 'Jumping jacks' in page.locator('#selected-name').inner_text()
        assert page.locator('#label-rows tr').count() == 29
        page.keyboard.press('4')
        assert page.locator('#label-rows tr').count() == 19
        for key, folder, stem, exercise, count in [('2', 'pushups', 'pushup', 'push_up', 21), ('4', 'reverse_crunches', 'crunch', 'situp', 19)]:
            page.keyboard.press(key)
            # Exercise real inference, in addition to the insufficient-pose cases.
            evaluation = json.loads((APP/f'logs/benchmark_{stem}_v4.json').read_text(encoding='utf-8'))
            usable = [row for row in evaluation['videos'] if row['quality']['usable']]
            selected = max(usable, key=lambda row: (row['quality']['valid_frame_ratio'], len(row['detected_labels'])))
            sample = APP/'test_videos_benchmark'/folder/selected['video']
            page.locator('#video-file').set_input_files(str(sample))
            page.locator('#analyze-whole:not([disabled])').wait_for()
            page.locator('#analyze-whole').click()
            page.wait_for_function("document.querySelector('#notice').textContent.includes('Đã phân tích toàn video')", timeout=90000)
            assert page.locator('#label-rows tr').count() == count
            assert page.locator('#result-scope').inner_text() == 'Phạm vi: toàn video'
            assert page.locator('#summary-title').inner_text() != 'Chưa đủ dữ liệu quan sát'
            assert '%' in page.locator('#label-rows').inner_text()
            page.screenshot(path=str(RUNTIME/f'web_{folder}_whole.png'), full_page=True)
            before_floor = len(captured)
            page.locator('#start-analysis').click()
            deadline = time.monotonic() + 15
            while time.monotonic() < deadline:
                page.wait_for_timeout(250)
                live = [row for row in captured[before_floor:] if row.get('exercise') == exercise
                        and row.get('result') and row['result'].get('status') != 'insufficient_data'
                        and any(label.get('probability') is not None for label in row['result'].get('label_results', []))]
                if live:
                    break
            assert live, f'No usable live predictions for {exercise}'
            assert len(live[-1]['result']['label_results']) == count
            floor_checks[exercise] = {'whole_video_labels': count, 'live_labels': count, 'video': sample.name}
            page.locator('#start-analysis').click()
        page.keyboard.press('1')

        page.locator('#camera-source').click()
        page.locator('#open-camera').click()
        page.wait_for_function("document.querySelector('#notice').textContent.includes('Camera đã mở')", timeout=15000)
        page.locator('#start-analysis:not([disabled])').wait_for()
        before = len(captured)
        page.locator('#start-analysis').click()
        page.wait_for_timeout(5000)
        camera = captured[before:]
        assert len(camera) >= 10 and any(item.get('result') for item in camera)
        page.screenshot(path=str(RUNTIME/'web_camera_live.png'), full_page=True)
        metrics = {key: page.locator('#'+key).inner_text() for key in ('display-fps','analysis-fps','roundtrip-ms','rep-count')}
        page.locator('#start-analysis').click()
        page.locator('#reset-session').click()
        assert page.locator('#rep-count').inner_text() == '00'
        assert page.locator('#summary-title').inner_text() == 'Đang chờ chuyển động'
        page.set_viewport_size({'width': 390, 'height': 844})
        page.wait_for_timeout(500)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Mobile horizontal overflow'
        page.screenshot(path=str(RUNTIME/'web_mobile.png'), full_page=True)
        browser.close()
    assert not errors, errors
    report = {'passed': True, 'physical_webcam_tested': False,
              'source': 'prerecorded browser fake camera + actual V4 GPU inference',
              'live_responses': len(captured), 'camera_responses': len(camera),
              'browser_metrics_short_run': metrics, 'javascript_errors': errors,
              'floor_model_checks': floor_checks,
              'tested': ['video live V4','whole-video V4','four exercise selections',
                         'fake-camera live V4','reset','mobile layout']}
    (RUNTIME/'browser_smoke.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
