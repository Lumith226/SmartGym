"""Build a local inspection gallery from versioned Neo4j evidence and snapshot."""
from pathlib import Path
import json,html,os,collections

ROOT=Path(__file__).resolve().parents[1];WORKSPACE=ROOT.parents[2]
snapshot=json.loads((ROOT/'data/releases/six_exercises_20261118_r3/snapshot.json').read_text(encoding='utf-8'))
release=ROOT/'artifacts/six_exercises_20261117/releases'/snapshot['version']
out=WORKSPACE/'CHUONG_4_BAO_CAO_6_BAI';out.mkdir(exist_ok=True)
details=release/'neo4j_browser/details'
captures=json.loads((details/'capture_verification.json').read_text(encoding='utf-8'))
names={'SQUAT':'Squat','PUSHUP':'Chống đẩy','JUMPING_JACK':'Jumping jack',
       'REVERSE_CRUNCH':'Reverse crunch','HIGH_KNEES':'High Knees – nâng cao gối','BUTT_KICKERS':'Butt Kickers – gót hướng về mông'}
def link(path):return html.escape(os.path.relpath(path,out).replace('\\','/'),quote=True)
def esc(value):return html.escape(str(value))
def a(path,label):return f'<a href="{link(path)}">{esc(label)}</a>'
cards=[]
for row in captures['records']:
    code=row['exercise']
    cards.append(f'''<article id="{code}"><h2>{esc(names[code])}</h2>
<p>{row['browser_nodes']} nút · {row['browser_relationships']} cạnh, truy vấn đồ thị con từ Neo4j thật.</p>
<a href="{link(details/(code+'_browser_graph.png'))}"><img loading="lazy" src="{link(details/(code+'_browser_graph.png'))}" alt="Đồ thị Neo4j {esc(names[code])}"></a>
<p>{a(details/(code+'_browser.png'),'Ảnh giao diện + số đếm')} · {a(details/(code+'_graph.png'),'PNG xuất bằng Neo4j')} · {a(details/(code+'.cypher'),'Truy vấn Cypher')}</p></article>''')
node_rows=[]
for n in snapshot['graph']['nodes']:
    node_rows.append('<tr><td>'+esc(n['type'])+'</td><td><code>'+esc(n['id'])+'</code></td><td><pre>'+esc(json.dumps(n,ensure_ascii=False,indent=2))+'</pre></td></tr>')
edge_rows=['<tr><td><code>'+esc(e['from'])+'</code></td><td>'+esc(e['type'])+'</td><td><code>'+esc(e['to'])+'</code></td></tr>' for e in snapshot['graph']['edges']]
figures=release/'neo4j_browser/figures'
page='''<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SmartGym · KB/KG sáu bài</title>
<style>:root{font:16px/1.65 system-ui,sans-serif;color:#193c38;background:#f4f6f4}*{box-sizing:border-box}body{margin:0}main{max-width:1240px;margin:auto;padding:28px}h1{font-size:clamp(26px,4vw,42px);line-height:1.2}h2{line-height:1.3}.muted{color:#536b66}.box,article{background:white;border:1px solid #cbd9d2;border-radius:12px;padding:22px;margin:22px 0}a{color:#145e50;text-underline-offset:3px}img{width:100%;height:auto;background:#fff;border:1px solid #dae3de}nav{display:flex;flex-wrap:wrap;gap:10px}nav a{padding:6px 14px;background:#e0ebe4;border-radius:20px}code,pre{font-size:12px;overflow-wrap:anywhere;white-space:pre-wrap}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #c8d6d0;padding:10px;vertical-align:top;text-align:left}th{background:#e5eee8}.tablewrap{overflow:auto}input{width:100%;padding:12px;font:inherit;border:1px solid #a9bdb4;border-radius:7px}summary{cursor:pointer;font-weight:600}#edges td:first-child,#edges td:last-child{max-width:310px}footer{margin:30px 0}@media(max-width:600px){main{padding:14px}.box,article{padding:14px}table{min-width:650px}}</style>
<main><h1>SmartGym · Kho tri thức và đồ thị sáu bài</h1><p class="muted">Minh chứng kỹ thuật ngày 18/11/2026. Ảnh Neo4j thật được tách rõ với bảng tra cứu do script xuất.</p>'''
page+=f'''<section class="box"><strong>{esc(snapshot['version'])}</strong><p>12 hồ sơ tài liệu · 284 đoạn · 38 tiêu chí · <b>468 nút / 567 cạnh</b> · 128 nhãn model, trong đó 30 nhãn lỗi.</p>
<p>Hỏi đáp sáu bài đã có trên KB/RAG. Web nhận diện video hiện vẫn bốn bài; hai bài mới chưa nghiệm thu bằng video thật. Các ca có JSON model trong bộ test dùng quan sát giả lập có gắn nhãn. Chatbot vẫn còn các ca trả lời chưa đạt; xem báo cáo từng câu.</p>
<p>{a(WORKSPACE/'KET_QUA_TEST_CHATBOT_6_TU_THE_2026-11-18.html','Kết quả 119 câu hỏi')} · {a(WORKSPACE/'DO_PHU_VA_RA_SOAT_KB_6_TU_THE_2026-11-18.md','Rà độ phủ và nội dung KB')} · {a(release/'kb_one_page.html','Mẫu KB một trang')} · {a(release/'code_map.md','Luồng gắn code thật')}</p>
<p>{a(release/'smartgym_six_kb.cypher','Cypher dựng lại KB')} · {a(release/'manifest.json','Manifest/hash')} · {a(release/'neo4j_roundtrip.json','Kiểm chứng nhập hai lần')}</p></section>
<p>{a(release/'pdf_source_pages/manifest.json','Năm trang PDF nguồn đã kiểm tra')} · {a(release/'pdf_source_pages/openstax_anatomy_file_page_426.png','Trang sách dùng trong mẫu KB: file 426 / in 410')}</p>
<nav>{''.join(f'<a href="#{c}">{esc(n)}</a>' for c,n in names.items())}<a href="#tables">Tra nút/cạnh</a></nav>
<article><h2>Toàn bộ KB trong Neo4j</h2><p>Ảnh giao diện Browser chứa truy vấn và số đếm <b>468 nút, 567 cạnh</b>. Truy vấn toàn phiên bản, không LIMIT. Bấm ảnh để xem kích thước gốc.</p>
<a href="{link(figures/'neo4j_toan_bo_468_nut_567_canh.png')}"><img src="{link(figures/'neo4j_toan_bo_468_nut_567_canh.png')}" alt="Neo4j Browser toàn bộ 468 nút và 567 cạnh"></a>
<p>{a(figures/'neo4j_toan_bo_468_nut_567_canh_graph.png','PNG đồ thị xuất trực tiếp từ Neo4j')} · {a(WORKSPACE/'CHUONG_4_BAO_CAO/index.html','Hồ sơ bốn bài 311/380 trước đây')}</p>
<p>Toàn cảnh thể hiện cấu trúc; chữ từng nút nhỏ. Dùng các nhánh bên dưới, ảnh giao diện và bảng dữ liệu để đọc chi tiết. Không cộng số nút các nhánh thành toàn KB vì các nguồn/đoạn có thể dùng chung và sách hướng dẫn chung không nằm hết trong mỗi nhánh.</p></article>
<section class="box"><h2>Đọc các nút và cạnh</h2><p>Trong các ảnh chi tiết: <b>xanh đậm</b> là Exercise; <b>xanh nhạt</b> là ModelLabel/Source (đọc caption và loại nút trong Browser); <b>đỏ</b> là TechniqueCriterion; <b>hồng</b> là Chunk. Tên tiêu chí là khóa kỹ thuật; tên nhãn được hiển thị tiếng Việt. Caption trên ảnh có thể rút gọn theo mức zoom; bảng dưới giữ ID đầy đủ.</p>
<p>Exercise → HAS_LABEL → ModelLabel; ModelLabel → RETRIEVES_CRITERION → TechniqueCriterion → SUPPORTED_BY → Chunk ← HAS_CHUNK ← Source. Exercise còn có HAS_CRITERION; Chunk → MENTIONS → Exercise là liên kết nội dung.</p>
<p><b>RETRIEVES_CRITERION</b> phục vụ tìm hướng dẫn liên quan, không chứng minh model dự đoán đúng. Trong 30 nhãn lỗi, 8 direct / 20 partial / 2 none; direct vẫn cần đối chiếu quan sát thực. Nhãn tốc độ/góc là nhãn chú thích, không tự trở thành tốc độ tối ưu hay góc khớp đo được.</p></section>
{''.join(cards)}
<section class="box" id="tables"><h2>Tra cứu đủ nút và cạnh</h2><p>Hai bảng sau do script xuất từ snapshot cùng phiên bản đã đối chiếu Neo4j; <b>không phải ảnh giao diện Neo4j</b>. Thuộc tính graph cơ bản ở bảng nút; đầy đủ văn bản, provenance, trang/mục nằm trong Cypher và mẫu KB. Chỉ mục tìm kiếm lọc văn bản trong mỗi bảng.</p>
<label for="search">Tìm ID, loại nút hoặc quan hệ</label><input id="search" placeholder="Ví dụ: highknees_arms, SUPPORTED_BY, ModelLabel"><p id="counts"></p>
<details open><summary>468 nút</summary><div class="tablewrap"><table id="nodes"><thead><tr><th>Loại</th><th>ID</th><th>Thuộc tính graph</th></tr></thead><tbody>{''.join(node_rows)}</tbody></table></div></details>
<details><summary>567 cạnh</summary><div class="tablewrap"><table id="edges"><thead><tr><th>Từ</th><th>Quan hệ</th><th>Đến</th></tr></thead><tbody>{''.join(edge_rows)}</tbody></table></div></details></section>
<footer>KB hiện có nhiều nguồn và ba PDF đã xử lý theo trang chọn; 12 hồ sơ không phải 12 tổ chức độc lập. Bản dịch, hướng dẫn và liên kết còn cần rà chuyên môn. Các ảnh chỉ thay bố cục/caption trong Browser, không sửa dữ liệu DB để làm hình.</footer></main>
<script>const ns=[...document.querySelectorAll('#nodes tbody tr')],es=[...document.querySelectorAll('#edges tbody tr')];function filter(){{const q=document.querySelector('#search').value.toLocaleLowerCase('vi');for(const r of [...ns,...es])r.hidden=!r.textContent.toLocaleLowerCase('vi').includes(q);document.querySelector('#counts').textContent=`Đang hiển thị ${{ns.filter(r=>!r.hidden).length}}/468 nút và ${{es.filter(r=>!r.hidden).length}}/567 cạnh`;}}document.querySelector('#search').addEventListener('input',filter);filter();</script></html>'''
(out/'index.html').write_text(page,encoding='utf-8')
(out/'gallery_manifest.json').write_text(json.dumps({'kb_version':snapshot['version'],'origin':'Actual Browser screenshots; custom snapshot lookup tables explicitly labelled','nodes':468,'edges':567,'detail_counts':captures['records']},ensure_ascii=False,indent=2),encoding='utf-8')
print(out/'index.html')
