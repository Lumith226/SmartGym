"""Real web/API social + source checks, with separate synthetic failure UI cases."""
import json
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/chat_presentation_20261107'
OUT.mkdir(parents=True,exist_ok=True)

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe')
    page=browser.new_page(viewport={'width':1280,'height':1000},accept_downloads=True)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://localhost:8080',wait_until='networkidle')
    turns=[]
    def ask(message):
        page.locator('#chat-input').fill(message)
        start=time.perf_counter()
        with page.expect_response(lambda r:'/api/chatbot' in r.url,timeout=300000) as item:
            page.locator('#chat-send').click()
        response=item.value
        assert response.status==200,response.text()
        output=response.json()
        page.wait_for_function("!document.querySelector('#chat-send').disabled")
        turns.append({'question':message,'seconds':round(time.perf_counter()-start,3),'output':output})
        (OUT/'live_turns.json').write_text(json.dumps(turns,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps({'question':message,'seconds':turns[-1]['seconds'],'mode':output['generation_mode'],'reply':output['reply']},ensure_ascii=False),flush=True)
        return output

    hello=ask('Chào bạn, hôm nay mình muốn tìm hiểu cách tập cho đúng')
    assert hello['status']=='needs_clarification',hello
    assert not hello['citations'] and not hello['retrieval'].get('evidence_review')
    answer=ask('khi chống đẩy, đầu mình nên giữ thế nào?')
    assert answer['generation_mode']=='grounded_synthesis',answer
    box=page.locator('.chat-bubble.assistant').last
    visible=box.inner_text()
    assert 'ace_pushup_' not in visible and 'Kiểm tra ngữ nghĩa bằng LLM' not in visible
    assert box.locator('.chat-citation').count()>0
    box.locator('.chat-citation').first.click()
    assert box.locator('.chat-sources').evaluate('(e)=>e.open')
    assert box.locator('.chat-sources details').first.evaluate('(e)=>e.open')
    assert box.locator('.chat-sources blockquote').first.inner_text()
    assert box.locator('.chat-sources a').first.get_attribute('href').startswith('https://')
    assert answer['references'] and answer['technical_details']['warnings']
    box.locator('.chat-sources > summary').click()
    page.locator('.chatbot-card').screenshot(path=str(OUT/'sources_desktop.png'))
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.locator('.chatbot-card').screenshot(path=str(OUT/'sources_mobile.png'))
    box.locator('.chat-technical > summary').click()
    assert 'Kiểm tra ngữ nghĩa bằng LLM' in box.locator('.chat-technical pre').inner_text()
    box.locator('.chat-technical > summary').click()
    page.set_viewport_size({'width':1280,'height':1000})
    for message in ['Cảm ơn nhé, mình hiểu rồi.', 'Ừ, vậy là rõ rồi.', 'Được rồi, mình dừng ở đây nha.']:
        output=ask(message)
        assert output['generation_mode']=='social' and output['retrieval']['llm_calls']==0,output
    mixed=ask('Cảm ơn bạn. Nhưng khi chống đẩy, mình đặt hai bàn tay rộng bao nhiêu?')
    assert mixed['generation_mode']=='grounded_synthesis' and mixed['citations'],mixed
    with page.expect_download() as download:page.locator('#chat-export').click()
    download.value.save_as(str(OUT/'exported_input_output.json'))
    exported=json.loads((OUT/'exported_input_output.json').read_text(encoding='utf-8'))
    assert exported['turns'][1]['output']['reply']==answer['reply']
    assert exported['turns'][1]['output']['references']==answer['references']

    # These are UI failure/security fixtures, NOT claims of real LLM outputs.
    fixture=page.evaluate('''async () => {
      const {createChatBubble}=await import('/chat-view.js?v=20261107-1');
      const output={status:'insufficient_evidence',reply:'Chưa đủ căn cứ để trả lời.',warnings:[
        'Bản nháp chưa vượt qua kiểm tra bằng chứng; chưa công bố lời khuyên.',
        'Video chưa đủ khớp để nhận xét.'
      ]};
      const box=createChatBubble('assistant',output.reply,output);document.querySelector('#chat-messages').append(box);
      const visible=box.innerText;
      const rejectHidden=!visible.includes('Bản nháp chưa vượt qua');
      const practicalVisible=visible.includes('Video chưa đủ khớp');
      const preserved=box.querySelector('.chat-technical pre').textContent.includes('Bản nháp chưa vượt qua');
      const unsafe=createChatBubble('assistant','<img src=x onerror=alert(1)> [fake_1234567890abcdef]',{
        citations:['fake_1234567890abcdef'],evidence:[{chunk_id:'fake_1234567890abcdef',title:'<script>bad</script>',url:'javascript:alert(1)',text:'source'}]});
      return {rejectHidden,practicalVisible,preserved,noHtmlInjection:unsafe.querySelectorAll('img,script').length===0,
        noUnsafeUrl:[...unsafe.querySelectorAll('a')].every(a=>!a.href.startsWith('javascript:'))};
    }''')
    assert all(fixture.values()),fixture
    assert not errors,errors
    report={'passed':True,'real_api_turns':len(turns),'model':answer['model_version'],
            'checks':['general greeting asks which exercise without retrieval','sourced push-up answer uses readable references',
                      'reference click opens cited passage','debug warning hidden by default, still inspectable',
                      'social after knowledge skips LLM and retrieval','mixed thanks + question still answered',
                      'JSON preserves original IDs and number mapping','mobile has no horizontal overflow'],
            'synthetic_ui_checks':fixture,'javascript_errors':errors,
            'limit':'Developer smoke checks, not an accuracy or P50/P95 benchmark.'}
    (OUT/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)
    browser.close()
