"""Real six-exercise server and browser check after both running models are exported."""
from pathlib import Path
import json
import os
import subprocess
import sys
import time
import urllib.request
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
WEB=ROOT/'smart_gym_web_v4'
RUNTIME=WEB/'runtime/running_v4'
RUNTIME.mkdir(exist_ok=True)
API='http://127.0.0.1:18081';URL='http://127.0.0.1:18080'


def main():
    processes=[];streams=[];errors=[];results={}
    env={**os.environ,'PYTHONIOENCODING':'utf-8','GYM_WEB_ORIGINS':URL}
    flags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0
    try:
        for name,command,cwd in [
            ('server',[sys.executable,'-m','server.app','--device','cuda','--port','18081'],WEB),
            ('web',[sys.executable,'-m','http.server','18080','--bind','127.0.0.1','--directory',str(WEB/'web')],ROOT)]:
            stream=(RUNTIME/(name+'.log')).open('w',encoding='utf-8');streams.append(stream)
            processes.append(subprocess.Popen(command,cwd=cwd,env=env,stdout=stream,stderr=subprocess.STDOUT,creationflags=flags))
        deadline=time.monotonic()+90
        while True:
            try:
                with urllib.request.urlopen(API+'/api/health',timeout=2) as response:health=json.load(response)
                if health['ready']:break
                if health.get('error'):raise RuntimeError(health['error'])
            except (OSError,TimeoutError):pass
            if time.monotonic()>deadline:raise RuntimeError('Test server did not become ready')
            time.sleep(.5)
        with sync_playwright() as p:
            executable=Path.home()/'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'
            options={'headless':True}
            if executable.is_file():options['executable_path']=str(executable)
            browser=p.chromium.launch(**options)
            context=browser.new_context(viewport={'width':1440,'height':1100})
            context.add_init_script(f"localStorage.setItem('smartgym.server', '{API}');")
            page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(URL,wait_until='networkidle')
            page.get_by_text('Server AI đã sẵn sàng',exact=True).wait_for(timeout=30000)
            assert page.locator('#exercise-tabs button').count()==6
            for stem,key,count in [('highknees','5',31),('buttkickers','6',14)]:
                page.keyboard.press(key)
                assert page.locator('#label-rows tr').count()==count
                assert 'ƯỚC LƯỢNG' in page.locator('#rep-count-label').inner_text()
                manifest=json.loads((ROOT/f'stgcn_squat_project/data/v4/manifest_{stem}_v4.json').read_text(encoding='utf-8'))
                rows={r['video']:r for r in manifest['records']}
                sample=rows[manifest['splits']['test'][0]]
                page.locator('#video-source').click()
                page.locator('#video-file').set_input_files(sample['path'])
                page.locator('#analyze-whole:not([disabled])').wait_for(timeout=15000)
                page.locator('#analyze-whole').click()
                page.wait_for_function("document.querySelector('#notice').textContent.includes('Đã phân tích toàn video')",timeout=90000)
                assert page.locator('#label-rows tr').count()==count
                assert page.locator('#result-scope').inner_text()=='Phạm vi: toàn video'
                screenshot=RUNTIME/f'web_{stem}_whole.png'
                page.screenshot(path=str(screenshot),full_page=True)
                results[stem]={'whole_video_label_rows':count,'sample':sample['video'],'screenshot':str(screenshot)}
            page.set_viewport_size({'width':390,'height':844})
            page.screenshot(path=str(RUNTIME/'web_running_mobile.png'),full_page=True)
            context.close();browser.close()
        assert not errors,errors
        (RUNTIME/'browser_running_smoke.json').write_text(json.dumps({'passed':True,'page_errors':errors,'exercises':results},ensure_ascii=False,indent=2),encoding='utf-8')
        print('RUNNING_BROWSER_SMOKE_PASSED',flush=True)
    finally:
        for process in processes:
            if process.poll() is None:
                process.terminate()
                try:process.wait(timeout=10)
                except subprocess.TimeoutExpired:process.kill();process.wait()
        for stream in streams:stream.close()


if __name__=='__main__':main()
