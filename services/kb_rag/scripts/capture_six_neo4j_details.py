"""Read-only exercise subgraphs from Neo4j, then native Browser PNG exports."""
from pathlib import Path
from datetime import datetime,timezone
import argparse,json,sys,hashlib,os
import shutil

ROOT=Path(__file__).resolve().parents[1]
VERSION='kb_ddae6f149e7b9f57'
OUT=ROOT/'artifacts/six_exercises_20261117/releases'/VERSION/'neo4j_browser/details'
OUT.mkdir(parents=True,exist_ok=True)
p=argparse.ArgumentParser();p.add_argument('--prepare',action='store_true');p.add_argument('--probe-style',action='store_true');p.add_argument('--probe-caption',action='store_true');p.add_argument('--probe-size',action='store_true');p.add_argument('--exercise');args=p.parse_args()
codes=['SQUAT','PUSHUP','JUMPING_JACK','REVERSE_CRUNCH','HIGH_KNEES','BUTT_KICKERS']
def query(code):
    return f"""MATCH (e:SmartGymKB:Exercise {{kb_version:'{VERSION}',node_id:'{code}'}})
OPTIONAL MATCH (e)-[r1]->(n:SmartGymKB {{kb_version:'{VERSION}'}})
OPTIONAL MATCH (n:TechniqueCriterion)-[r2:SUPPORTED_BY]->(c:SmartGymKB:Chunk {{kb_version:'{VERSION}'}})
OPTIONAL MATCH (s:SmartGymKB:Source {{kb_version:'{VERSION}'}})-[r3:HAS_CHUNK]->(c)
WITH collect(DISTINCT e)+collect(DISTINCT n)+collect(DISTINCT c)+collect(DISTINCT s) AS selected
UNWIND selected AS a
OPTIONAL MATCH (a)-[r]->(b) WHERE b IN selected
RETURN a,r,b"""

if args.prepare:
    history=OUT/'hierarchical_view';history.mkdir(exist_ok=True)
    for old in list(OUT.glob('*.png'))+list(OUT.glob('*.cypher'))+[OUT/'expected_subgraphs.json',OUT/'capture_verification.json']:
        if old.exists() and not (history/old.name).exists():shutil.copy2(old,history/old.name)
    sys.path.insert(0,str(ROOT))
    from kb_service.graph import connection
    rows=[]
    with connection() as driver:
        with driver.session() as session:
            for code in codes:
                cypher=query(code);graph=session.run(cypher).graph()
                nodes=list(graph.nodes);edges=list(graph.relationships)
                assert nodes and edges and all(n.get('kb_version')==VERSION for n in nodes)
                rows.append({'exercise':code,'nodes':len(nodes),'relationships':len(edges),
                             'node_keys':sorted(n['key'] for n in nodes),'query':cypher})
                (OUT/(code+'.cypher')).write_text(cypher+';\n',encoding='utf-8')
    (OUT/'expected_subgraphs.json').write_text(json.dumps({'kb_version':VERSION,'origin':'actual read-only Neo4j queries','subgraphs':rows},indent=2),encoding='utf-8')
    print(json.dumps([{'exercise':r['exercise'],'nodes':r['nodes'],'relationships':r['relationships']} for r in rows]))
    raise SystemExit(0)

from playwright.sync_api import sync_playwright
expected=json.loads((OUT/'expected_subgraphs.json').read_text(encoding='utf-8'))
if args.exercise:expected['subgraphs']=[r for r in expected['subgraphs'] if r['exercise']==args.exercise]
env={}
for line in (ROOT/'.env').read_text(encoding='utf-8-sig').splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        key,value=line.split('=',1);env[key.strip()]=value.strip().strip('"').strip("'")
records=[]
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe')
    page=browser.new_page(viewport={'width':1920,'height':1800},device_scale_factor=1.5,accept_downloads=True)
    page.goto('http://localhost:7474/browser/',wait_until='networkidle')
    if page.locator('input[name="password"]').count():
        page.locator('input[name="username"]').fill(env.get('NEO4J_USER',os.getenv('NEO4J_USER','neo4j')))
        page.locator('input[name="password"]').fill(env.get('NEO4J_PASSWORD',os.getenv('NEO4J_PASSWORD','neo4j123')))
        page.get_by_role('button',name='Connect',exact=True).click()
        page.locator('input[name="password"]').wait_for(state='hidden',timeout=30000)
    if page.get_by_role('button',name='Dismiss',exact=True).count():page.get_by_role('button',name='Dismiss',exact=True).click()
    page.wait_for_timeout(1500)
    def run(cypher,wait=1200):
        editor=page.locator('[contenteditable=true]').first
        editor.fill(cypher);editor.press('Escape');editor.press('Control+Enter');page.wait_for_timeout(wait)
    run(':use neo4j')
    grass='''node.ModelLabel { color: #d4ddff; size: 42px; caption: "{name_vi}"; }
node.TechniqueCriterion { color: #ff6f5e; size: 48px; caption: "{id}"; }
node.Exercise { color: #7fa7c3; size: 60px; caption: "{node_id}"; }
node.Source { color: #c1d1ff; size: 46px; caption: "{publisher}"; }
node.Chunk { color: #ffb9f8; size: 40px; caption: "{section}"; }
'''
    style_path=OUT/'smartgym_six.grass';style_path.write_text(grass,encoding='utf-8')
    run(':style',1200)
    inputs=page.locator('input[type="file"]')
    if args.probe_style:
        print('FILE_INPUTS',inputs.evaluate_all('(items)=>items.map(e=>({accept:e.accept,html:e.outerHTML}))'))
        print('STYLE_UI',page.locator('body').inner_text()[-3500:])
        browser.close();raise SystemExit(0)
    grass_input=page.locator('input[type="file"][accept*=".grass"]')
    assert grass_input.count()==1,'Inspect Browser style upload controls before applying captions'
    grass_input.set_input_files(str(style_path));page.wait_for_timeout(1500)
    # Keep the earlier exports for traceability; only Browser caption styling
    # changes. No property in the database is edited for a screenshot.
    raw=OUT/'raw_default_caption';raw.mkdir(exist_ok=True)
    for existing in list(OUT.glob('*_graph.png'))+list(OUT.glob('*_browser.png'))+list(OUT.glob('capture_verification.json')):
        if not (raw/existing.name).exists():shutil.copy2(existing,raw/existing.name)
    for index,row in enumerate(expected['subgraphs']):
        run(':clear',250);run(row['query'],4500)
        collapse=page.get_by_title('Collapse Sidebar',exact=True)
        if collapse.count():collapse.click()
        if index==0:
            page.get_by_role('button',name='Update styling priority',exact=True).click()
            handles=page.get_by_role('button',name='Pick up',exact=True)
            handles.first.wait_for(state='visible',timeout=5000)
            if handles.count()>=6:
                first=handles.first.bounding_box();last=handles.last.bounding_box()
                page.mouse.move(first['x']+first['width']/2,first['y']+first['height']/2);page.mouse.down()
                page.mouse.move(last['x']+last['width']/2,last['y']+last['height']/2,steps=25);page.mouse.up()
            page.wait_for_timeout(350)
            if handles.count():page.get_by_role('button',name='Update styling priority',exact=True).click()
            page.wait_for_timeout(350)
            for kind,property_name in [('ModelLabel','name_vi'),('TechniqueCriterion','id'),('Exercise','node_id'),('Source','publisher'),('Chunk','section')]:
                page.get_by_text(__import__('re').compile(r'^'+kind+r' \(\d+\)$')).click()
                page.get_by_text(property_name,exact=True).last.click()
                page.keyboard.press('Escape');page.wait_for_timeout(200)
        if args.probe_caption:
            label_count=sum(1 for key in row['node_keys'] if ':label:' in key)
            pills=page.get_by_text(__import__('re').compile(r'^ModelLabel \(\d+\)$'))
            print('LABEL_PILLS',pills.count())
            pills.first.click();page.wait_for_timeout(600)
            print('CAPTION_UI',page.locator('body').inner_text()[-7000:])
            print('SELECTS',page.locator('select').evaluate_all('(items)=>items.map(e=>e.outerHTML)'))
            browser.close();raise SystemExit(0)
        if args.probe_size:
            print(json.dumps(page.locator('canvas').first.evaluate('''e=>{let a=[];for(let i=0;e&&i<9;i++,e=e.parentElement)a.push({tag:e.tagName,cls:e.className,style:e.getAttribute('style'),rect:{w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}});return a;}''')))
            page.get_by_role('button',name='More options',exact=True).last.click()
            print(page.locator('body').inner_text()[-2500:])
            browser.close();raise SystemExit(0)
        # The Browser stream view constrains two ancestors to 500px. Resize
        # those view elements together so NVL receives the real canvas bounds.
        # This changes presentation only, never node/relationship properties.
        page.locator('.ndl-graph-visualization-container').evaluate('''e=>{
            e.style.setProperty('height','1000px','important');
            for(let p=e.parentElement,i=0;p&&i<5;p=p.parentElement,i++){
                if(String(p.className).includes('500px'))for(const k of ['height','min-height','max-height'])p.style.setProperty(k,'1000px','important');
            }
            window.dispatchEvent(new Event('resize'));
        }''')
        # Let the force layout settle before the final fit. During animation
        # NVL suppresses captions and nodes can drift beyond the fitted area.
        page.wait_for_timeout(8000)
        page.get_by_role('button',name='Zoom to fit',exact=True).click();page.wait_for_timeout(6000)
        page.get_by_role('button',name='Zoom out',exact=True).click();page.wait_for_timeout(1000)
        page.mouse.move(1900,1750);page.wait_for_timeout(1000)
        body=page.locator('body').inner_text()
        assert f"Nodes ({row['nodes']})" in body and f"Relationships ({row['relationships']})" in body
        assert 'MissingDatabaseError' not in body
        (OUT/(row['exercise']+'_browser.txt')).write_text(body,encoding='utf-8')
        # Capture before native export: this Browser changes its canvas
        # transform while exporting and does not reliably restore it.
        page.screenshot(path=str(OUT/(row['exercise']+'_browser.png')))
        canvases=page.locator('canvas')
        boxes=canvases.evaluate_all('(items)=>items.map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}))')
        if boxes:
            largest=max(range(len(boxes)),key=lambda i:boxes[i]['w']*boxes[i]['h'])
            canvases.nth(largest).screenshot(path=str(OUT/(row['exercise']+'_browser_graph.png')))
        with page.expect_download(timeout=20000) as pending:page.get_by_role('button',name='Download as PNG',exact=True).click()
        native=OUT/(row['exercise']+'_graph.png');pending.value.save_as(str(native))
        records.append({'exercise':row['exercise'],'browser_nodes':row['nodes'],'browser_relationships':row['relationships'],
                        'graph_png':native.name,'sha256':hashlib.sha256(native.read_bytes()).hexdigest(),
                        'canvas_boxes':boxes,'browser_graph_screenshot':row['exercise']+'_browser_graph.png' if boxes else None,
                        'source':'actual Neo4j Browser, native Download as PNG','database_modified':False})
        print(row['exercise'],'captured',row['nodes'],row['relationships'],flush=True)
    browser.close()
(OUT/'capture_verification.json').write_text(json.dumps({'kb_version':VERSION,'captured_at_utc':datetime.now(timezone.utc).isoformat(),
    'caption_style':'Native Browser Customize Style > Caption UI; name_vi/id/node_id/publisher/section. GraSS alone did not change captions in this Browser version.',
    'presentation_only':'1000px graph region (all constrained ancestors resized together), fit followed by one native Zoom out for boundary margins; database unchanged.',
    'style_documentation':'https://neo4j.com/docs/browser/operations/browser-styling/',
    'records':records},indent=2),encoding='utf-8')
