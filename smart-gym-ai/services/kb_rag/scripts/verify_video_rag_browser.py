"""Real browser + real model/KB HTTP services, without camera access."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
WORKSPACE=ROOT.parents[2]
OUT=ROOT/'artifacts/v4_browser';OUT.mkdir(exist_ok=True)
video=WORKSPACE/'SmartGym-Model/smart_gym_test_rtmpose_v4/test_videos_benchmark/squats/BACK_ROUNDING_00001672.mp4'
errors=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe')
    context=browser.new_context(viewport={'width':1440,'height':1100},accept_downloads=True)
    context.add_init_script("""window.__cameraRequests=0;
        if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{window.__cameraRequests++;return Promise.reject(new Error('No camera is used in this test'));};""")
    page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto('http://localhost:8080',wait_until='networkidle')
    page.get_by_text('Server AI đã sẵn sàng',exact=True).wait_for(timeout=30000)
    assert page.locator('#file-options').is_visible()
    assert not page.locator('#camera-options').is_visible()
    page.locator('#video-file').set_input_files(str(video))
    page.locator('#analyze-whole:not([disabled])').wait_for()
    page.locator('#coach-question').fill('Giải thích các nhãn và tiêu chí kỹ thuật trong video.')
    with page.expect_response(lambda response:'/api/analyze-video' in response.url,timeout=180000) as response_info:
        page.locator('#analyze-whole').click()
    response=response_info.value;assert response.status==200
    body=response.json();assert body['coach']['generation_mode']=='claim_selection'
    assert body['coach']['observation']['simulated'] is False
    page.wait_for_function("document.querySelector('#coach-answer').textContent.includes('Tiêu chí tham khảo')",timeout=10000)
    assert page.locator('#coach-sources a').count()>0
    page.screenshot(path=str(OUT/'desktop.png'),full_page=True)
    with page.expect_download() as download_info:page.locator('#export-json').click()
    download_info.value.save_as(str(OUT/'exported_in_out.json'))
    exported=json.loads((OUT/'exported_in_out.json').read_text(encoding='utf-8'))
    assert exported['coach']['kb_version']==body['coach']['kb_version']
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(OUT/'mobile.png'),full_page=True)
    page.keyboard.press('3')
    assert not page.locator('#coach-answer').inner_text()
    assert page.locator('#label-rows tr').count()==29
    page.keyboard.press('1')
    camera_requests=page.evaluate('window.__cameraRequests')
    assert camera_requests==0
    assert not errors,errors
    report={'passed':True,'physical_camera_used':False,'camera_requests':camera_requests,
        'model_inference':'real CPU video inference','rag_generation_mode':body['coach']['generation_mode'],
        'rag_generation_used':body['coach']['generation_used'],'kb_version':body['coach']['kb_version'],
        'source_links':len(body['coach']['citations']),'javascript_errors':errors,
        'checks':['default video input','real video + RAG','source links','export model + RAG JSON',
                  'clear old coaching on exercise change','mobile no horizontal overflow','no camera access']}
    (OUT/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
    browser.close()
