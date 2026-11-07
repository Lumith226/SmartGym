"""No-camera browser regression for the user's ambiguous question and follow-ups."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/coverage_audit/browser';OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe')
    context=browser.new_context(viewport={'width':1280,'height':1000},accept_downloads=True)
    context.add_init_script("window.__cameraRequests=0;if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{window.__cameraRequests++;return Promise.reject(new Error('No camera'));};")
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://localhost:8080',wait_until='networkidle');page.get_by_text('Server AI đã sẵn sàng',exact=True).wait_for(timeout=30000)
    outputs=[]
    def ask(text):
        page.locator('#chat-input').fill(text)
        with page.expect_response(lambda r:'/api/chatbot' in r.url,timeout=300000) as item:page.locator('#chat-send').click()
        r=item.value;assert r.status==200,r.text();o=r.json();outputs.append(o)
        page.wait_for_function("!document.querySelector('#chat-send').disabled")
        return o
    ambiguous=ask('tôi nên chú ý gì trong buổi tập này')
    assert ambiguous['status']=='needs_clarification',ambiguous['reply']
    assert not ambiguous['citations']
    clarified=ask('Tôi đang tìm hiểu chống đẩy. Khi hạ người nên giữ hông thế nào?')
    assert clarified['generation_mode']=='grounded_synthesis',clarified['reply']
    assert clarified['citations']
    followup=ask('Còn vị trí hai bàn tay thì sao?')
    assert followup['generation_mode']=='grounded_synthesis',followup['reply']
    assert followup['retrieval']['planner']['exercise']=='PUSHUP'
    page.locator('#chat-messages').evaluate('(e)=>{e.scrollTop=e.scrollHeight}')
    page.locator('.chatbot-card').screenshot(path=str(OUT/'desktop.png'))
    with page.expect_download() as item:page.locator('#chat-export').click()
    item.value.save_as(str(OUT/'input_output.json'))
    page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.locator('#chat-messages').evaluate('(e)=>{e.scrollTop=e.scrollHeight}')
    page.locator('.chatbot-card').screenshot(path=str(OUT/'mobile.png'))
    assert page.evaluate('window.__cameraRequests')==0;assert not errors
    report={'passed':True,'camera_requests':0,'turns':3,'modes':[o['generation_mode'] for o in outputs],
            'checks':['original user question asks for context','free synthesis after clarification','role history resolves follow-up','source links','JSON export','mobile width'],
            'javascript_errors':errors,'model':clarified['model_version']}
    (OUT/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False,indent=2))
    browser.close()
