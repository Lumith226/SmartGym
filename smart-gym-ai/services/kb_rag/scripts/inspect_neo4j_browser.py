"""Small local UI inspection helper; no credentials are printed."""
from playwright.sync_api import sync_playwright
from pathlib import Path
import os
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe')
    page=browser.new_page(viewport={'width':1440,'height':1100})
    page.goto('http://localhost:7474/browser/',wait_until='networkidle')
    page.locator('input[name="username"]').fill(os.getenv('NEO4J_USER','neo4j'))
    page.locator('input[name="password"]').fill(os.getenv('NEO4J_PASSWORD','neo4j123'))
    page.get_by_role('button',name='Connect',exact=True).click()
    page.get_by_text('Connection details',exact=True).wait_for(state='hidden',timeout=5000) if page.get_by_text('Connection details',exact=True).count() else None
    page.locator('input[name="password"]').wait_for(state='hidden',timeout=30000)
    page.get_by_text('neo4j',exact=True).first.wait_for(timeout=30000)
    if page.get_by_role('button',name='Dismiss',exact=True).count():page.get_by_role('button',name='Dismiss',exact=True).click()
    query="MATCH p=(q:SmartGymTrace:ChatInput)-[:PRODUCED]->(a:ChatOutput)-[:CITES]->(c:SmartGymKB:Chunk)<-[:HAS_CHUNK]-(s:Source) WHERE q.suite='smartgym-chatbot-v1' AND q.case='score_explicit_demo_policy' RETURN p LIMIT 12"
    editor=page.locator('[contenteditable=true]').first
    editor.fill(query);editor.press('Control+Enter')
    page.get_by_text('Graph',exact=True).first.wait_for(timeout=30000)
    page.screenshot(path=str(ROOT/'artifacts/chatbot/browser/neo4j_graph.png'))
    print(page.locator('body').inner_text()[-2200:])
    browser.close()
