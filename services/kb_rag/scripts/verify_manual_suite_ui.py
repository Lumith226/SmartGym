"""UI checks with real video inference and replayed, labeled chat responses.

Does not call Ollama or interrupt the API suite. Responses are replayed only to
test browser presentation/payloads, never counted as new LLM generations.
"""
import json,argparse
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];WORKSPACE=ROOT.parents[2]
parser=argparse.ArgumentParser();parser.add_argument('--out-dir',default='artifacts/manual_suite_20261107');args=parser.parse_args()
OUT=ROOT/args.out_dir;BROWSER=OUT/'browser';BROWSER.mkdir(exist_ok=True)
rows=json.loads((OUT/'results.json').read_text(encoding='utf-8'));latest={r['case_id']:r for r in rows}
video=WORKSPACE/'SmartGym-Model/smart_gym_test_rtmpose_v4/test_videos_benchmark/squats/BACK_ROUNDING_00001672.mp4'
checks=[];captures=[];live_state=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe')
    page=browser.new_page(viewport={'width':1280,'height':1050});errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.add_init_script("window.__cameraRequests=0;if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{window.__cameraRequests++;throw Error('No camera');};")
    page.goto('http://localhost:8080',wait_until='networkidle')
    page.wait_for_function("document.querySelector('#connection-status').textContent.includes('sẵn sàng')")
    fixture=latest['VD01']['output']
    use_live=True
    def respond(route):
        body=route.request.post_data_json;captures.append(body)
        if use_live:
            response=route.fetch()
            live_state.append({'input':body,'output':response.json(),'http_status':response.status})
            route.fulfill(response=response)
        else:route.fulfill(status=200,json=fixture)
    page.route('**/api/chatbot',respond)
    page.locator('#video-file').set_input_files(str(video))
    def ask(message):
        page.locator('#chat-input').fill(message);page.locator('#chat-send').click()
        page.wait_for_function("!document.querySelector('#chat-send').disabled")
    ask(latest['VD01']['input']['message']);assert captures[-1]['records']==[]
    assert captures[-1]['video_context']['state']=='selected'
    assert 'Phân tích video' in live_state[-1]['output']['reply']
    checks.append({'case':'VD01 UI','result':'Đạt','detail':'Selected file does not silently attach observations.'})
    page.locator('#use-coach').uncheck()
    with page.expect_response(lambda r:'/api/analyze-video' in r.url,timeout=120000) as result:
        page.locator('#analyze-whole').click()
    assert result.value.status==200,result.value.text()
    inference=result.value.json()
    (BROWSER/'actual_video_analysis.json').write_text(json.dumps(inference,ensure_ascii=False,indent=2),encoding='utf-8')
    page.wait_for_function("!document.querySelector('#analyze-whole').disabled")
    fixture=latest['VD02']['output'];ask(latest['VD02']['input']['message']);assert captures[-1]['records']==[]
    assert captures[-1]['video_context']['state']=='analyzed'
    assert 'Thêm kết quả video hiện tại' in live_state[-1]['output']['reply']
    (BROWSER/'live_video_state_chat.json').write_text(json.dumps(live_state,ensure_ascii=False,indent=2),encoding='utf-8')
    checks.append({'case':'VD02 UI','result':'Đạt','detail':'Real API receives analyzed state with no records and explains the missing attach step.'})
    use_live=False
    page.locator('#chat-add-video').click()
    fixture=latest['VD03']['output'];ask(latest['VD03']['input']['message'])
    assert len(captures[-1]['records'])==1
    assert captures[-1]['records'][0]['source_id']==inference['result']['source']['video_sha256']
    assert captures[-1]['records'][0]['simulated'] is False
    assert captures[-1]['video_context']['state']=='attached'
    page.locator('#chat-add-video').click()
    assert 'đã có' in page.locator('#chat-status').inner_text()
    checks.append({'case':'BT03 UI','result':'Đạt','detail':'Duplicate file rejected; one actual video attached, matching hash.'})
    page.locator('#chat-input').fill('   ')
    before=len(captures);page.locator('#chat-send').click();page.wait_for_timeout(100)
    assert len(captures)==before
    checks.append({'case':'Empty message','result':'Đạt','detail':'No chat request for whitespace.'})
    page.unroute('**/api/chatbot',respond)
    pending=[]
    def delay(route):pending.append(route)
    page.route('**/api/chatbot',delay)
    page.locator('#chat-input').fill('Kiểm tra thao tác gửi trùng.')
    page.locator('#chat-send').click();page.wait_for_timeout(100)
    page.locator('#chat-form').evaluate('(e)=>e.dispatchEvent(new Event("submit",{cancelable:true,bubbles:true}))')
    page.wait_for_timeout(100);assert len(pending)==1
    pending[0].fulfill(status=503,json={'detail':'Dịch vụ chatbot tạm chưa sẵn sàng. Vui lòng thử lại.'})
    page.wait_for_function("!document.querySelector('#chat-send').disabled")
    assert 'chưa sẵn sàng' in page.locator('#chat-status').inner_text()
    checks.append({'case':'Double submit + HTTP503 fixture','result':'Đạt','detail':'One pending request; useful error and submit button restored. Real services were not stopped.'})
    page.unroute('**/api/chatbot',delay)
    (BROWSER/'captured_inputs.json').write_text(json.dumps(captures,ensure_ascii=False,indent=2),encoding='utf-8')
    # Render actual saved outputs, with no new generation; check every response.
    display=page.evaluate('''async (outputs)=>{
      const {createChatBubble}=await import('/chat-view.js?v=20261107-1');
      const log=document.querySelector('#chat-messages');log.replaceChildren();
      return outputs.map(({case_id,output})=>{
        const box=createChatBubble('assistant',output.reply,output);log.append(box);
        const visible=box.innerText;
        return {case_id,opaqueIdVisible:/\\[[^\\]\\n]+_[a-f0-9]{16}\\]/.test(visible),
          internalWarningVisible:visible.includes('Kiểm tra ngữ nghĩa bằng LLM')||visible.includes('Bản nháp chưa vượt qua'),
          citations:box.querySelectorAll('.chat-citation').length};
      });
    }''',[{'case_id':r['case_id'],'output':r['output']} for r in latest.values() if r.get('output',{}).get('reply')])
    assert not any(r['opaqueIdVisible'] or r['internalWarningVisible'] for r in display)
    checks.append({'case':'All saved responses presentation','result':'Đạt','detail':f'{len(display)} saved HTTP outputs replayed into real DOM; no opaque IDs/debug warnings visible by default.'})
    # Present a focused knowledge answer in screenshots.
    page.evaluate('''async (output)=>{const {createChatBubble}=await import('/chat-view.js?v=20261107-1');const log=document.querySelector('#chat-messages');log.replaceChildren(createChatBubble('user','Khi chống đẩy, đầu mình nên giữ thế nào?'),createChatBubble('assistant',output.reply,output));}''',latest['XG06']['output'])
    page.locator('#chat-input').fill('')
    page.locator('#chat-status').evaluate("e=>e.textContent='Đang xem lại câu trả lời đã lưu để kiểm tra hiển thị.'")
    page.locator('.chat-citation').first.click()
    assert page.locator('.chat-sources details').first.evaluate('(e)=>e.open')
    page.locator('.chatbot-card').screenshot(path=str(BROWSER/'focused_answer_desktop.png'))
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.locator('.chatbot-card').screenshot(path=str(BROWSER/'focused_answer_mobile.png'))
    checks.append({'case':'Mobile + source links','result':'Đạt','detail':'390px width; source index opens exact passage; no horizontal overflow.'})
    assert page.evaluate('window.__cameraRequests')==0
    assert not errors,errors
    report={'passed':True,'checks':checks,'presentation_checks':display,'camera_requests':0,'javascript_errors':errors,
            'method':'Real browser and model API for video; VD01/VD02 chat hit real API; other saved chat outputs replayed only for presentation tests.'}
    (BROWSER/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2));browser.close()
