"""Capture the complete current KB in the actual Neo4j Browser, without DB writes.

Run with the vision Python runtime for Playwright. Browser visualization settings
only affect this disposable browser profile. Never draw a substitute graph.
"""
from datetime import datetime, timezone
from pathlib import Path
import json
import os
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT.parents[2]/'CHUONG_4_BAO_CAO'
VERSION='kb_a3a9fc4465797bf3'
QUERY=f"MATCH (n:SmartGymKB {{kb_version:'{VERSION}'}}) OPTIONAL MATCH (n)-[r]->(m:SmartGymKB {{kb_version:'{VERSION}'}}) RETURN n,r,m"


def main():
    env={}
    for line in (ROOT/'.env').read_text(encoding='utf-8-sig').splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            k,v=line.split('=',1)
            env[k.strip()]=v.strip().strip('"').strip("'")
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe')
        page=browser.new_page(viewport={'width':2560,'height':1700},device_scale_factor=2,accept_downloads=True)
        page.goto('http://localhost:7474/browser/',wait_until='networkidle')
        if page.locator('input[name="password"]').count():
            page.locator('input[name="username"]').fill(env.get('NEO4J_USER',os.getenv('NEO4J_USER','neo4j')))
            page.locator('input[name="password"]').fill(env.get('NEO4J_PASSWORD',os.getenv('NEO4J_PASSWORD','neo4j123')))
            page.get_by_role('button',name='Connect',exact=True).click()
            page.locator('input[name="password"]').wait_for(state='hidden',timeout=30000)
        if page.get_by_role('button',name='Dismiss',exact=True).count():
            page.get_by_role('button',name='Dismiss',exact=True).click()
        page.wait_for_timeout(2500)
        def run(query,wait=1000):
            editor=page.locator('[contenteditable=true]').first
            editor.fill(query);editor.press('Escape');editor.press('Control+Enter')
            page.wait_for_timeout(wait)
        run(':use neo4j',2000)
        run(':config initialNodeDisplay: 1000',1000)
        run(':clear',300)
        run(QUERY,12000)
        page.get_by_title('Collapse Sidebar',exact=True).click()
        page.get_by_role('button',name='Update styling priority',exact=True).click()
        handles=page.get_by_role('button',name='Pick up',exact=True)
        assert handles.count()>=6
        # Move the common namespace label behind specific labels using the UI.
        first=handles.first.bounding_box();last=handles.last.bounding_box()
        page.mouse.move(first['x']+first['width']/2,first['y']+first['height']/2)
        page.mouse.down()
        page.mouse.move(last['x']+last['width']/2,last['y']+last['height']/2,steps=35)
        page.mouse.up()
        page.wait_for_timeout(1000)
        print('PRIORITY',page.locator('body').inner_text()[-1800:])
        page.get_by_role('button',name='Update styling priority',exact=True).click()
        page.wait_for_timeout(1000)
        # Enlarge only Browser's visualization panel for its native PNG export.
        # Restore it before the screenshot so Browser's detail panel is visible.
        page.locator('.ndl-graph-visualization-container').evaluate("e=>e.parentElement.style.height='1250px'")
        page.wait_for_timeout(1000)
        page.get_by_role('button',name='Zoom to fit',exact=True).click()
        page.wait_for_timeout(2500)
        body=page.locator('body').inner_text()
        assert 'Nodes (311)' in body and 'Relationships (380)' in body
        assert 'MissingDatabaseError' not in body
        (OUT/'evidence/neo4j_full_graph_browser.txt').write_text(body,encoding='utf-8')
        with page.expect_download(timeout=30000) as pending:
            page.get_by_role('button',name='Download as PNG',exact=True).click()
        download=pending.value
        download.save_as(str(OUT/'figures/neo4j_toan_bo_311_nut_380_canh_graph.png'))
        page.locator('.ndl-graph-visualization-container').evaluate("e=>e.parentElement.style.height=''")
        page.wait_for_timeout(1000)
        page.get_by_role('button',name='Zoom to fit',exact=True).click()
        page.mouse.move(10,790)
        page.wait_for_timeout(2500)
        node_stats=page.get_by_text('Nodes (311)',exact=True).bounding_box()
        rel_stats=page.get_by_text('Relationships (380)',exact=True).bounding_box()
        assert node_stats and rel_stats
        print('STAT_BOUNDS',node_stats,rel_stats)
        assert max(node_stats['y']+node_stats['height'],rel_stats['y']+rel_stats['height'])<800
        page.screenshot(path=str(OUT/'figures/neo4j_toan_bo_311_nut_380_canh.png'),clip={'x':0,'y':0,'width':2560,'height':800})
        info=page.evaluate('''()=>({svg:[...document.querySelectorAll('svg')].map(s=>({cls:s.getAttribute('class'),nodes:s.querySelectorAll('.node').length,relationships:s.querySelectorAll('.relationship').length,viewBox:s.getAttribute('viewBox')})).filter(x=>x.nodes||x.relationships),buttons:[...document.querySelectorAll('button')].map(x=>({text:x.innerText,label:x.getAttribute('aria-label'),title:x.getAttribute('title')}))})''')
        (OUT/'evidence/neo4j_full_graph_ui_probe.json').write_text(json.dumps(info,ensure_ascii=False,indent=2),encoding='utf-8')
        (OUT/'evidence/neo4j_full_graph_capture.json').write_text(json.dumps({'captured_at_utc':datetime.now(timezone.utc).isoformat(),'kb_version':VERSION,'query':QUERY,'browser_nodes':311,'browser_relationships':380,'source':'actual Neo4j Browser graph view and native Download as PNG','graph_panel_height_css_px':1250,'viewport':{'width':2560,'height':1700},'device_scale_factor':2,'database_modified':False},ensure_ascii=False,indent=2),encoding='utf-8')
        print(body[-1600:])
        print('Native PNG exported; screenshot contains original Browser counts.')
        browser.close()


if __name__=='__main__':main()
