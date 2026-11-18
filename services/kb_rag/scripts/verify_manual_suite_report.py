"""Render and verify the exported standalone HTML report."""
from pathlib import Path
import json,argparse
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];WORKSPACE=ROOT.parents[2]
parser=argparse.ArgumentParser();parser.add_argument('--out-dir',default='artifacts/manual_suite_20261107');parser.add_argument('--report-stem',default='KET_QUA_TEST_CHATBOT_2026-11-07');args=parser.parse_args()
OUT=ROOT/args.out_dir/'browser'
summary=json.loads((OUT.parent/'report_summary.json').read_text(encoding='utf-8'));error_count=summary['execution_statuses'].get('Lỗi',0)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe')
    page=browser.new_page(viewport={'width':1280,'height':1000})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto((WORKSPACE/(args.report_stem+'.html')).as_uri())
    assert page.locator('article').count()==44
    page.locator('#status').select_option('Lỗi');assert page.locator('article:visible').count()==error_count
    page.locator('#status').select_option('');page.locator('#search').fill('HT03')
    assert page.locator('article:visible').count()==1
    actual=json.loads((OUT.parent/'final_results.json').read_text(encoding='utf-8'))
    output=next(r['output'] for r in actual if r['case_id']=='HT03')
    expected=output['reply']
    for i,cid in enumerate(dict.fromkeys(output.get('citations',[])),1):expected=expected.replace('['+cid+']',f'[{i}]')
    assert page.locator('article:visible pre').inner_text()==expected
    page.locator('#search').fill('')
    page.screenshot(path=str(OUT/'report_desktop.png'))
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path=str(OUT/'report_mobile.png'))
    assert not errors
    (OUT/'report_verification.json').write_text(json.dumps({'passed':True,'articles':44,'error_filter':error_count,'search_filter':True,'mobile_width':390,'javascript_errors':errors},indent=2),encoding='utf-8')
    print('Report HTML verified: 44 records, status/search filters, mobile layout.');browser.close()
