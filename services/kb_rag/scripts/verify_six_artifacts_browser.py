"""Read-only browser checks for delivered HTML; does not call the LLM."""
from pathlib import Path
from urllib.parse import unquote,urlsplit
import json
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1];WORKSPACE=ROOT.parents[2]
release=ROOT/'artifacts/six_exercises_20261117/releases/kb_ddae6f149e7b9f57'
out=release/'browser_qa';out.mkdir(parents=True,exist_ok=True)
browser_path=next(p for p in [Path('C:/Program Files/Google/Chrome/Application/chrome.exe'),
                            Path('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')] if p.exists())
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path=str(browser_path),args=['--disable-gpu'])
 page=browser.new_page(viewport={'width':1280,'height':1000});errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
 page.goto((release/'kb_one_page.html').as_uri(),wait_until='load')
 assert page.locator('tbody tr').count()==6
 page.screenshot(path=str(out/'kb_desktop.png'),full_page=True)
 page.emulate_media(media='print');page.set_viewport_size({'width':673,'height':1002})
 height=page.locator('main').bounding_box()['height'];page.screenshot(path=str(out/'kb_a4_content.png'),full_page=True)
 # CSS page is A4 with 16mm margins: 265mm ~=1002px of content height.
 assert height<=1002,f'KB preview exceeds A4 content height: {height}'
 page.emulate_media(media='screen');page.set_viewport_size({'width':1280,'height':1000})
 report=WORKSPACE/'KET_QUA_TEST_CHATBOT_6_TU_THE_2026-11-18.html'
 page.goto(report.as_uri(),wait_until='load');assert page.locator('article').count()==119
 page.locator('#exercise').select_option('HIGH_KNEES');assert page.locator('article:not([hidden])').count()==21
 page.locator('#exercise').select_option('');page.locator('#search').fill('SQUAT_K01')
 assert page.locator('article:not([hidden])').count()==1
 page.locator('#search').fill('');assert page.locator('article:not([hidden])').count()==119
 page.screenshot(path=str(out/'report_desktop.png'))
 page.set_viewport_size({'width':390,'height':844})
 assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Report overflows on mobile'
 page.screenshot(path=str(out/'report_mobile.png'));assert not errors
 page.set_viewport_size({'width':1280,'height':1000})
 gallery=WORKSPACE/'CHUONG_4_BAO_CAO_6_BAI/index.html'
 page.goto(gallery.as_uri(),wait_until='load')
 assert page.locator('#nodes tbody tr').count()==468
 assert page.locator('#edges tbody tr').count()==567
 assert page.locator('article').count()==7
 broken=[]
 for href in page.locator('[href],img[src]').evaluate_all('(items)=>items.map(e=>e.getAttribute("href")||e.getAttribute("src"))'):
  if href.startswith(('#','http:','https:')):continue
  target=(gallery.parent/unquote(urlsplit(href).path)).resolve()
  if not target.exists():broken.append(str(target))
 assert not broken,broken
 page.locator('img').evaluate_all('(items)=>items.forEach(e=>e.loading="eager")')
 page.wait_for_function('[...document.images].every(e=>e.complete&&e.naturalWidth>0)')
 page.locator('#search').fill('SUPPORTED_BY')
 assert page.locator('#edges tbody tr:not([hidden])').count()==39
 page.locator('#search').fill('')
 page.screenshot(path=str(out/'gallery_desktop.png'))
 page.locator('article#SQUAT').screenshot(path=str(out/'gallery_squat.png'))
 page.set_viewport_size({'width':390,'height':844})
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),'Gallery overflows mobile'
 page.screenshot(path=str(out/'gallery_mobile.png'));assert not errors
 record={'pass':True,'kb_rows':6,'kb_print_css_content_height_px':height,'css_a4_content_limit_px':1002,
         'not_a_native_pdf_pagination_check':True,'report_cards':119,'high_knees_filter_cards':21,
         'search_and_reset':True,'mobile_no_horizontal_overflow':True,'javascript_errors':errors,
         'gallery_nodes':468,'gallery_edges':567,'gallery_articles':7,'gallery_links_and_images_exist':True,
         'gallery_supported_by_filter':39,'gallery_mobile_no_horizontal_overflow':True}
 (out/'verification.json').write_text(json.dumps(record,indent=2),encoding='utf-8');print(json.dumps(record))
 browser.close()
