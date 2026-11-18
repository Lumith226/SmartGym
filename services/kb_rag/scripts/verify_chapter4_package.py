"""Visually prepare and structurally verify the report review HTML and figures.

Use the vision runtime (Playwright + Chrome). No LLM or model analysis is rerun.
"""
from pathlib import Path
import json
import math
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT.parents[2]/'CHUONG_4_BAO_CAO'
QA=OUT/'evidence/visual_qa'


def main():
    QA.mkdir(parents=True,exist_ok=True)
    report={'pages':{},'figures':[]}
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe')
        page=browser.new_page(viewport={'width':1440,'height':1100},device_scale_factor=1)
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        for path in sorted((OUT/'figures').glob('*.svg')):
            page.goto(path.as_uri())
            assert page.locator('svg').count()==1
            assert page.locator('text').count()>0
            # SVG bounds include every text line in the report figures.
            overflow=page.locator('svg').evaluate('''s=>{const v=s.viewBox.baseVal;return [...s.querySelectorAll('text')].filter(t=>{const b=t.getBBox();return b.x<0||b.y<0||b.x+b.width>v.width||b.y+b.height>v.height}).map(t=>t.textContent)}''')
            assert not overflow,(path.name,overflow)
            page.locator('svg').screenshot(path=str(path.with_suffix('.png')))
            report['figures'].append({'file':path.name,'text_within_viewbox':True})
        for name in ['index.html','CHUONG_4_NOI_DUNG.html','KB_MAU_MOT_TRANG.html','INPUT_OUTPUT.html','KG_CHI_TIET.html']:
            page.goto((OUT/name).as_uri())
            page.wait_for_timeout(150)
            assert page.locator('h1').count()>=1
            missing=page.locator('img').evaluate_all('(a)=>a.filter(x=>!x.complete||x.naturalWidth===0).map(x=>x.src)')
            assert not missing,(name,missing)
            links=page.locator('a[href]').evaluate_all('(a)=>a.map(x=>x.getAttribute("href"))')
            for link in links:
                if not link.startswith(('http:','https:','#')):
                    assert (OUT/link).exists(),(name,link)
            page.screenshot(path=str(QA/(Path(name).stem+'_desktop.png')))
            if name=='CHUONG_4_NOI_DUNG.html':
                assert page.locator('h2').count()>=9
                for i,h in enumerate(page.locator('h2').all()):
                    h.scroll_into_view_if_needed()
                    page.screenshot(path=str(QA/f'chapter_section_{i+1:02d}.png'))
            if name=='KG_CHI_TIET.html':
                assert page.locator('#node option').count()==311
                page.locator('#search').fill('back_not_straight')
                assert page.locator('#node option').count()>=1
                assert 'RETRIEVES_CRITERION' in page.locator('#edges').inner_text()
                assert 'model_sha256' in page.locator('#props').inner_text()
            page.set_viewport_size({'width':390,'height':844})
            page.screenshot(path=str(QA/(Path(name).stem+'_mobile.png')))
            overflow=page.evaluate('document.documentElement.scrollWidth>innerWidth')
            report['pages'][name]={'missing_images':missing,'mobile_horizontal_overflow':overflow}
            page.set_viewport_size({'width':1440,'height':1100})
        # Verify the one-page KB under A4 print media, without producing a delivery PDF.
        page.goto((OUT/'KB_MAU_MOT_TRANG.html').as_uri())
        page.emulate_media(media='print')
        page.add_style_tag(content='main{width:170mm} body{margin:0}')
        bounds=page.locator('main').bounding_box()
        limit=257*96/25.4
        report['kb_one_page']={'height_css_px':bounds['height'],'a4_usable_height_css_px':limit,'fits':bounds['height']<=limit}
        page.locator('main').screenshot(path=str(QA/'kb_one_page_print.png'))
        assert report['kb_one_page']['fits'],report['kb_one_page']
        browser.close()
    assert not errors, errors
    report['javascript_errors']=errors
    (OUT/'evidence/visual_verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))


if __name__=='__main__':main()
