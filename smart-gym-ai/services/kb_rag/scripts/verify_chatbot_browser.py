"""Real browser checks for chat, fresh video session and exported IN/OUT."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/chatbot/browser';OUT.mkdir(parents=True,exist_ok=True)
video=ROOT.parents[2]/'SmartGym-Model/smart_gym_test_rtmpose_v4/test_videos_benchmark/squats/BACK_ROUNDING_00001672.mp4'
errors=[];turns=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe')
    context=browser.new_context(viewport={'width':1440,'height':1100},accept_downloads=True)
    context.add_init_script("window.__cameraRequests=0;if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{window.__cameraRequests++;return Promise.reject(new Error('No camera'));};")
    page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://localhost:8080',wait_until='networkidle');page.get_by_text('Server AI đã sẵn sàng',exact=True).wait_for(timeout=30000)
    def ask(task,message):
        page.locator('#chat-task').select_option(task);page.locator('#chat-input').fill(message)
        with page.expect_response(lambda r:'/api/chatbot' in r.url,timeout=300000) as response:
            page.locator('#chat-send').click()
        out=response.value;assert out.status==200,out.text();body=out.json();turns.append(body)
        page.wait_for_function("!document.querySelector('#chat-send').disabled",timeout=15000)
        assert page.locator('.chat-bubble.assistant').last.inner_text().startswith('SmartGym')
        return body
    qa=ask('knowledge','Gập bụng ngược có cần nâng hông khỏi thảm không?')
    assert 'cuộn xương chậu' in qa['reply'];assert qa['citations']
    assert page.locator('.chat-bubble.assistant a').count()>0
    page.locator('#video-file').set_input_files(str(video));page.locator('#use-coach').uncheck()
    page.locator('#analyze-whole:not([disabled])').wait_for()
    with page.expect_response(lambda r:'/api/analyze-video' in r.url,timeout=180000):page.locator('#analyze-whole').click()
    page.wait_for_function("!document.querySelector('#analyze-whole').disabled")
    page.locator('#chat-add-video').click();assert '1 video' in page.locator('#chat-session').inner_text()
    page.locator('#chat-add-video').click();assert 'đã có' in page.locator('#chat-status').inner_text()
    summary=ask('summary','Tóm tắt buổi tập của tôi.');assert len(summary['session']['units'])==1
    assert summary['session']['units'][0]['simulated'] is False
    assert summary['citations'];assert summary['generation_mode']=='claim_selection'
    score=ask('score','Vì sao tôi bị trừ điểm?');assert score['session']['penalty_total'] is None
    page.locator('.chatbot-card details').first.locator('summary').click()
    page.locator('#chat-rules').fill(json.dumps({'policy':'DEMO browser test, chưa kiểm định','rules':[{'exercise_code':'SQUAT','label_key':'back_not_straight','points':5}]},ensure_ascii=False))
    scored=ask('score','Giải thích điểm trừ theo quy tắc demo.');assert scored['session']['penalty_total']==5
    practice=ask('practice','Gợi ý luyện lại kỹ thuật.');assert 'Chưa đủ' in practice['reply']
    page.locator('.chatbot-card').screenshot(path=str(OUT/'desktop.png'))
    with page.expect_download() as downloaded:page.locator('#chat-export').click()
    downloaded.value.save_as(str(OUT/'exported_in_out.json'))
    exported=json.loads((OUT/'exported_in_out.json').read_text(encoding='utf-8'));assert len(exported['turns'])==5
    page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.locator('.chatbot-card').screenshot(path=str(OUT/'mobile.png'))
    assert page.evaluate('window.__cameraRequests')==0;assert not errors,errors
    report={'passed':True,'actual_fresh_video':True,'camera_requests':0,'chat_turns':len(turns),'javascript_errors':errors,
            'checks':['knowledge source links','fresh video session','duplicate suppression','summary citations','missing score policy','explicit demo penalty ledger','practice without invented habit','JSON export','mobile overflow'],
            'kb_version':qa['kb_version']}
    (OUT/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False,indent=2));browser.close()
