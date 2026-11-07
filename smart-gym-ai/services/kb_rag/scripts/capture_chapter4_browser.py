"""Capture actual Neo4j Browser results. Run with the vision Playwright runtime."""
from pathlib import Path
import json
import os
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT.parents[2]/'CHUONG_4_BAO_CAO'


def main():
    env = {}
    for line in (ROOT/'.env').read_text(encoding='utf-8-sig').splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            k,v = line.split('=',1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    queries = {
        'neo4j_kb_graph': "MATCH p=(e:SmartGymKB:Exercise {node_id:'SQUAT'})-[:HAS_LABEL]->(l:ModelLabel {label_key:'back_not_straight'})-[:RETRIEVES_CRITERION]->(t:TechniqueCriterion)-[:SUPPORTED_BY]->(c:Chunk)<-[:HAS_CHUNK]-(s:Source) WHERE e.kb_version='kb_a3a9fc4465797bf3' RETURN p",
        'neo4j_trace_graph': "MATCH p=(q:SmartGymTrace:ChatInput)-[:PRODUCED]->(a:ChatOutput)-[:CITES]->(c:SmartGymKB:Chunk)<-[:HAS_CHUNK]-(s:Source) WHERE q.suite='smartgym-chapter4-20261107' AND q.case='VD03' RETURN p",
        'neo4j_input_output': "MATCH (q:SmartGymTrace:ChatInput)-[:PRODUCED]->(a:ChatOutput) WHERE q.suite='smartgym-chapter4-20261107' AND q.case IN ['LIVE_PDF','VD03','DI02','BT02','BT04'] RETURN q.case AS case_id,q.message AS input,a.reply AS output,q.evidence_origin AS origin ORDER BY case_id",
    }
    folder = OUT/'figures'
    folder.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True,executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe')
        page = browser.new_page(viewport={'width':1800,'height':1200},device_scale_factor=1.5)
        page.goto('http://localhost:7474/browser/',wait_until='networkidle')
        if page.locator('input[name="password"]').count():
            page.locator('input[name="username"]').fill(env.get('NEO4J_USER',os.getenv('NEO4J_USER','neo4j')))
            page.locator('input[name="password"]').fill(env.get('NEO4J_PASSWORD',os.getenv('NEO4J_PASSWORD','neo4j123')))
            page.get_by_role('button',name='Connect',exact=True).click()
            page.locator('input[name="password"]').wait_for(state='hidden',timeout=30000)
        if page.get_by_role('button',name='Dismiss',exact=True).count():
            page.get_by_role('button',name='Dismiss',exact=True).click()
        page.locator('[contenteditable=true]').first.wait_for(timeout=30000)
        # Connection authentication finishes before the database selector is ready.
        # Set it explicitly; otherwise the first frame can be MissingDatabaseError.
        page.wait_for_timeout(2500)
        editor = page.locator('[contenteditable=true]').first
        editor.fill(':use neo4j')
        editor.press('Escape')
        editor.press('Control+Enter')
        page.wait_for_timeout(2500)
        for name,query in queries.items():
            editor = page.locator('[contenteditable=true]').first
            editor.fill(':clear')
            editor.press('Escape')
            editor.press('Control+Enter')
            page.wait_for_timeout(300)
            editor.fill(query)
            editor.press('Escape')
            editor.press('Control+Enter')
            page.wait_for_timeout(3500)
            body = page.locator('body').inner_text()
            assert 'MissingDatabaseError' not in body, body[-1500:]
            assert 'Statement.SyntaxError' not in body, body[-1500:]
            assert 'no records' not in body.lower(), body[-1500:]
            if name == 'neo4j_input_output':
                table = page.get_by_text('Table',exact=True)
                if table.count(): table.first.click()
            page.screenshot(path=str(folder/(name+'.png')))
            (OUT/'evidence'/(name+'_browser.txt')).write_text(page.locator('body').inner_text(),encoding='utf-8')
            print(name, 'captured', flush=True)
        browser.close()
    (OUT/'evidence/browser_queries.json').write_text(json.dumps(queries,ensure_ascii=False,indent=2),encoding='utf-8')


if __name__ == '__main__':
    main()
