"""Check the compact HTML sample fits the usable area of one A4 page."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/chatbot'
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe')
    page=browser.new_page(viewport={'width':794,'height':1123});page.goto((OUT/'kb_one_page.html').as_uri())
    page.emulate_media(media='print')
    height=page.locator('body').bounding_box()['height'];usable=267*96/25.4
    assert height<=usable,(height,usable)
    assert page.locator('tr').count()==5
    page.screenshot(path=str(OUT/'kb_one_page.png'),full_page=True)
    (OUT/'kb_sample_layout.json').write_text(json.dumps({'passed':True,'body_height_px':height,'A4_usable_height_px':usable,'exercise_rows':4},indent=2),encoding='utf-8')
    print('KB sample fits A4 usable area:',round(height),'<',round(usable));browser.close()
