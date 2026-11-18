"""Live browser smoke after restart; no camera or replayed answer is used."""
from pathlib import Path
import json,re
import httpx
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
out=ROOT/'artifacts/six_exercises_20261117/releases/kb_ddae6f149e7b9f57/browser_qa'
out.mkdir(parents=True,exist_ok=True)
exe=next(p for p in [Path('C:/Program Files/Google/Chrome/Application/chrome.exe'),
                     Path('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')] if p.exists())
health_before=httpx.get('http://127.0.0.1:8010/health',timeout=10).json()
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path=str(exe),args=['--disable-gpu'])
 context=browser.new_context(viewport={'width':1280,'height':1000},accept_downloads=True)
 context.add_init_script("window.__cameraRequests=0;if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{window.__cameraRequests++;return Promise.reject(new Error('No camera in this check'));};")
 page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)));page.goto('http://localhost:8080',wait_until='networkidle')
 page.locator('#chat-input').wait_for();turns=[]
 def ask(message):
  page.locator('#chat-input').fill(message)
  with page.expect_response(lambda r:'/api/chatbot' in r.url,timeout=240000) as result:page.locator('#chat-send').click()
  response=result.value;data=response.json();turns.append({'input':message,'http_status':response.status,'output':data})
  (out/'live_web_turns.json').write_text(json.dumps({'origin':'new_wording_live_browser; no video or simulated model record attached','turns':turns},ensure_ascii=False,indent=2),encoding='utf-8')
  assert response.status==200;page.wait_for_function("!document.querySelector('#chat-send').disabled")
  return data
 answer=ask('Tôi đang học bài đá gót về mông; hai tay có nhất thiết phải đánh như lúc chạy không?')
 assert answer['kb_version']=='kb_ddae6f149e7b9f57' and answer.get('citations'),answer.get('reply')
 card=page.locator('.chat-bubble.assistant').last
 visible=card.locator('.chat-answer').inner_text()
 assert not re.search(r'\[(?:ace_|nasm_|ohio_|smartgym_)',visible)
 assert card.locator('.chat-citation').count()>=1
 assert not card.locator('.chat-technical').evaluate('(e)=>e.open')
 card.locator('.chat-citation').first.click();assert card.locator('.chat-sources').evaluate('(e)=>e.open')
 page.locator('.chatbot-card').screenshot(path=str(out/'live_chat_desktop.png'))
 thanks=ask('Cảm ơn bạn, mình hiểu rồi!');assert thanks['status']=='conversational' and not thanks.get('evidence')
 with page.expect_download() as download:page.locator('#chat-export').click()
 download.value.save_as(str(out/'live_web_export.json'))
 page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.locator('.chatbot-card').screenshot(path=str(out/'live_chat_mobile.png'))
 assert not errors and page.evaluate('window.__cameraRequests')==0
 record={'pass':True,'kb_version':answer['kb_version'],'model':answer.get('model_version'),'camera_requests':0,
         'live_turns':2,'source_link_expansion':True,'opaque_ids_absent_from_normal_reply':True,
         'technical_details_collapsed':True,'json_export':True,'social_skips_retrieval':True,'javascript_errors':errors,
         'runtime_revision':health_before['runtime_revision'],'llm_model':health_before['llm_model']}
 assert health_before==httpx.get('http://127.0.0.1:8010/health',timeout=10).json()
 (out/'live_verification.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(record,ensure_ascii=False))
 browser.close()
