"""Browser-only regression: four ready models become six without losing the selection."""
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
import json
import sys
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
APP=ROOT/'smart_gym_test_rtmpose_v4'
sys.path.insert(0,str(APP))
import highknees_schema,buttkickers_schema


def main():
    output=ROOT/'smart_gym_web_v4/runtime/running_v4_ui';output.mkdir(exist_ok=True)
    fixtures=[]
    for key,stem,name,schema in [
        ('squat','squat','Squat',None),('push_up','pushup','Chống đẩy',None),
        ('jump_jack','jumpjack','Jumping jacks',None),('situp','crunch','Gập bụng ngược',None),
        ('high_knees','highknees','High knees',highknees_schema),
        ('butt_kickers','buttkickers','Butt kickers',buttkickers_schema)]:
        contract=schema.default_contract() if schema else json.loads((APP/f'weights/{stem}_v4_contract.json').read_text(encoding='utf-8'))
        fixtures.append({'id':key,'name':name,'subtitle':'Kiểm tra giao diện','version':'V4',
                         'label_count':len(contract['labels']),'labels':contract['labels']})
    state={'count':4};errors=[]
    class QuietHandler(SimpleHTTPRequestHandler):
        def log_message(self,*args):pass
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT/'smart_gym_web_v4/web')))
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:
        with sync_playwright() as p:
            installed=Path.home()/'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'
            browser=p.chromium.launch(headless=True,executable_path=str(installed))
            page=browser.new_page(viewport={'width':1440,'height':1100})
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.add_init_script("""window.WebSocket=class {
                static OPEN=1;
                constructor(){this.readyState=1;setTimeout(()=>this.onopen?.(),40);}
                send(text){const c=JSON.parse(text);if(c.type==='configure')setTimeout(()=>this.onmessage?.({data:JSON.stringify({type:'ready',generation:c.generation})}),0);}
                close(){this.readyState=3;}
            };""")
            page.route('**/api/health',lambda route:route.fulfill(json={'ready':True,'runtime':{'device':'cpu','pose_providers':['CPUExecutionProvider']}}))
            page.route('**/api/exercises',lambda route:route.fulfill(json={'exercises':fixtures[:state['count']]}))
            page.goto(f'http://127.0.0.1:{server.server_port}',wait_until='domcontentloaded')
            page.get_by_text('Server AI đã sẵn sàng',exact=True).wait_for(timeout=15000)
            assert page.locator('#exercise-tabs button').count()==6
            assert page.locator('[data-exercise="high_knees"]').is_disabled()
            assert page.locator('[data-exercise="butt_kickers"]').is_disabled()
            page.keyboard.press('2');assert 'Chống đẩy' in page.locator('#selected-name').inner_text()
            page.screenshot(path=str(output/'web_pending_models.png'),full_page=True)
            state['count']=6
            page.locator('[data-exercise="high_knees"]:not([disabled])').wait_for(timeout=15000)
            assert 'Chống đẩy' in page.locator('#selected-name').inner_text()
            page.keyboard.press('5');assert page.locator('#label-rows tr').count()==31
            page.keyboard.press('6');assert page.locator('#label-rows tr').count()==14
            assert 'ƯỚC LƯỢNG' in page.locator('#rep-count-label').inner_text()
            page.screenshot(path=str(output/'web_six_models_ready.png'),full_page=True)
            assert not errors,errors
            browser.close()
        (output/'catalog_check.json').write_text(json.dumps({'passed':True,'page_errors':errors,
            'mode':'mock API catalog and socket; no pose or model accuracy measured',
            'checks':['four ready plus two locked','catalog refresh unlocks new exercises',
                      'current selection survives refresh','keys 5/6 show 31/14 label rows']},ensure_ascii=False,indent=2),encoding='utf-8')
        print('RUNNING_CATALOG_BROWSER_PASSED')
    finally:
        server.shutdown();server.server_close()


if __name__=='__main__':main()
