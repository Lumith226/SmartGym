"""Capture actual Neo4j Graph and Table for an explicitly replayed HTTP trace."""
from pathlib import Path
import argparse,json,os
from datetime import datetime,timezone
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--run',type=Path,required=True);args=p.parse_args()
version='kb_ddae6f149e7b9f57'
out=ROOT/'artifacts/six_exercises_20261117/releases'/version/'neo4j_trace'/args.run.name
metadata=json.loads((out/'trace_verification.json').read_text(encoding='utf-8'))
assert metadata['neo4j_applied'] and all(r['all_input_output_properties_and_edge_targets_match'] for r in metadata['roundtrips'])
suite=metadata['suite'];identity='PUSHUP_K08'
graph=f"MATCH (q:SmartGymTrace:ChatInput {{suite:'{suite}',case:'{identity}'}})-[p:PRODUCED]->(a) OPTIONAL MATCH (q)-[r:RETRIEVED]->(c) OPTIONAL MATCH (a)-[s:CITES]->(d) RETURN q,p,a,r,c,s,d"
table=f"MATCH (q:SmartGymTrace:ChatInput {{suite:'{suite}',case:'{identity}'}})-[:PRODUCED]->(a) RETURN q.message AS input,a.reply AS output,q.evidence_origin AS origin,q.synthetic_model_records AS synthetic_model_records,a.kb_version AS kb_version,a.runtime_revision AS runtime"
(out/'SCREENSHOT_GRAPH.cypher').write_text(graph+';\n',encoding='utf-8')
(out/'SCREENSHOT_TABLE.cypher').write_text(table+';\n',encoding='utf-8')
env={}
for line in (ROOT/'.env').read_text(encoding='utf-8-sig').splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        key,value=line.split('=',1);env[key.strip()]=value.strip().strip('"').strip("'")
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe')
    page=browser.new_page(viewport={'width':1920,'height':1450},device_scale_factor=1.5,accept_downloads=True)
    page.goto('http://localhost:7474/browser/',wait_until='networkidle')
    if page.locator('input[name="password"]').count():
        page.locator('input[name="username"]').fill(env.get('NEO4J_USER','neo4j'))
        page.locator('input[name="password"]').fill(env.get('NEO4J_PASSWORD','neo4j123'))
        page.get_by_role('button',name='Connect',exact=True).click()
        page.locator('input[name="password"]').wait_for(state='hidden',timeout=30000)
    if page.get_by_role('button',name='Dismiss',exact=True).count():page.get_by_role('button',name='Dismiss',exact=True).click()
    page.wait_for_timeout(1500)
    def run(query,wait=1600):
        editor=page.locator('[contenteditable=true]').first;editor.fill(query);editor.press('Escape');editor.press('Control+Enter');page.wait_for_timeout(wait)
    run(':use neo4j');run(':clear',300);run(graph,7000)
    collapse=page.get_by_title('Collapse Sidebar',exact=True)
    if collapse.count():collapse.click()
    import re
    for kind,prop in [('ChatInput','case'),('ChatOutput','status'),('Chunk','section')]:
        page.get_by_text(re.compile(r'^'+kind+r' \(\d+\)$')).click()
        page.get_by_text(prop,exact=True).last.click();page.keyboard.press('Escape');page.wait_for_timeout(300)
    page.get_by_role('button',name='Zoom to fit',exact=True).click();page.wait_for_timeout(3000)
    page.get_by_role('button',name='Zoom out',exact=True).click();page.wait_for_timeout(700)
    page.mouse.move(1900,1400)
    body=page.locator('body').inner_text();assert 'PRODUCED' in body and 'RETRIEVED' in body and 'CITES' in body
    (out/'browser_graph.txt').write_text(body,encoding='utf-8')
    page.screenshot(path=str(out/'neo4j_trace_graph_browser.png'))
    canvases=page.locator('canvas');canvases.first.screenshot(path=str(out/'neo4j_trace_graph.png'))
    run(':clear',300);run(table,3000)
    tab=page.get_by_role('button',name='Table',exact=True)
    if tab.count():tab.click();page.wait_for_timeout(1200)
    text=page.locator('body').inner_text()
    assert 'replay_import_of_recorded_live_http' in text and version in text and metadata['runtime_revision'] in text
    (out/'browser_table.txt').write_text(text,encoding='utf-8')
    page.screenshot(path=str(out/'neo4j_input_output_table.png'),full_page=True)
    browser.close()
record={'captured_at':datetime.now(timezone.utc).isoformat(),'source':'Actual Neo4j Browser Graph and Table',
        'suite':suite,'case':identity,'kb_version':version,'runtime_revision':metadata['runtime_revision'],
        'evidence_origin':'replay_import_of_recorded_live_http; no fresh inference during capture',
        'model_records_for_this_case':False,'database_modified_by_capture':False}
(out/'browser_capture.json').write_text(json.dumps(record,indent=2),encoding='utf-8');print(json.dumps(record))
