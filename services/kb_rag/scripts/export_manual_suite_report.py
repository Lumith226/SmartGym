"""Export actual test outputs plus explicit developer review, no LLM grading."""
import json,re,html,statistics,argparse
from pathlib import Path
from collections import Counter,defaultdict
from datetime import datetime,timezone,timedelta
ROOT=Path(__file__).resolve().parents[1];WORKSPACE=ROOT.parents[2]
parser=argparse.ArgumentParser();parser.add_argument('--out-dir',default='artifacts/manual_suite_20261107');parser.add_argument('--report-stem',default='KET_QUA_TEST_CHATBOT_2026-11-07');parser.add_argument('--single-run',action='store_true');parser.add_argument('--kb-tests',type=int,default=78);parser.add_argument('--web-tests',type=int,default=26);args=parser.parse_args()
OUT=ROOT/args.out_dir
all_rows=json.loads((OUT/'results.json').read_text(encoding='utf-8'))
last_run=all_rows[-1]['run_id']
latest={r['case_id']:r for r in all_rows}
final=list(latest.values())
if args.single_run:
    final=[r for r in all_rows if r['run_id']==last_run]
    assert len({r.get('runtime_revision') for r in final})==1
    assert final[0].get('runtime_revision'),'Missing runtime version'
    marker=json.loads((OUT/f'run_complete_{last_run.replace(":","-")}.json').read_text(encoding='utf-8'))
    assert marker['complete'] and marker['only'] is None,'Not a complete final run'
assert len(final)==44 and len({r['parent_id'] for r in final})==40,'Final full run not complete'
reviews=json.loads((OUT/'manual_review.json').read_text(encoding='utf-8'))
assert set(reviews)=={r['case_id'] for r in final},'Every case needs explicit review'
for r in final:
    r['review']=reviews[r['case_id']]
    out=r.get('output',{});evidence={e['chunk_id']:e for e in out.get('evidence',[])}
    citations=out.get('citations',[])
    clean=lambda s:re.sub(r'\s+',' ',s).strip().casefold()
    supports=out.get('retrieval',{}).get('support_quotes',[])
    r['structural_checks']={'http_200':r.get('http_status')==200,
        'citations_exist':all(cid in evidence for cid in citations),
        'quotes_exist':all(p['chunk_id'] in evidence and clean(p['quote']) in clean(evidence[p['chunk_id']]['text']) for p in supports)}
    if not all(r['structural_checks'].values()):r['review']={'status':'Lỗi','note':'Lỗi kiểm tra HTTP/citation/quote. '+r['review']['note']}
(OUT/'final_results.json').write_text(json.dumps(final,ensure_ascii=False,indent=2),encoding='utf-8')
counts=Counter(r['review']['status'] for r in final)
parents=defaultdict(list)
for r in final:parents[r['parent_id']].append(r)
priority={'Đạt':0,'Chưa đủ căn cứ':1,'Lỗi':2}
parent_status={key:max((r['review']['status'] for r in rows),key=lambda s:priority[s]) for key,rows in parents.items()}
parent_counts=Counter(parent_status.values())
first=json.loads((OUT/'results_first_pass.json').read_text(encoding='utf-8'))
paired=[]
for a in first:
    b=next((r for r in final if r['case_id']==a['case_id']),None)
    if b and a['case_id'].startswith(('KT','HT','XG')) and a.get('output',{}).get('generation_mode')=='grounded_synthesis' and b.get('output',{}).get('generation_mode')=='grounded_synthesis':
        before=len(a['output']['reply'].split());after=len(b['output']['reply'].split())
        paired.append({'id':a['case_id'],'before_words':before,'after_words':after,'before_seconds':a['seconds'],'after_seconds':b['seconds']})
timings={}
for name,predicate in [('social',lambda r:r['output'].get('generation_mode')=='social'),('grounded_synthesis',lambda r:r['output'].get('generation_mode')=='grounded_synthesis'),('all',lambda r:True)]:
    values=[r['seconds'] for r in final if predicate(r)]
    if values:timings[name]={'n':len(values),'median_seconds':round(statistics.median(values),3),'min_seconds':min(values),'max_seconds':max(values)}
summary={'date':'07/11/2026','final_run_id':last_run,'parent_cases':40,'executions':44,'all_attempts':len(all_rows),
         'execution_statuses':dict(counts),'parent_statuses':dict(parent_counts),'timings':timings,'paired':paired,
         'warning':'Developer behavioral/trace review, not expert assessment, scientific accuracy, general coverage or a robust latency benchmark.'}
(OUT/'report_summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')

def friendly(output):
    text=output.get('reply','')
    for i,cid in enumerate(dict.fromkeys(output.get('citations',[])),1):text=text.replace('['+cid+']',f'[{i}]')
    return text

title='Kết quả kiểm thử chatbot SmartGym'+(' — vòng cuối' if args.single_run else '')+' — 07/11/2026'
md=[f'# {title}','',
    ('**Phạm vi:** sửa năm ca KT01, KT02, VD02, VD03, VD04 và chạy lại toàn bộ bộ kịch bản thủ công.' if args.single_run else '**Phạm vi:** sửa lặp/thừa ý và chạy lại toàn bộ bộ kịch bản thủ công.')+' Đánh giá do trợ lý phát triển thực hiện theo tiêu chí, không phải thẩm định chuyên môn thể hình.','',
    (f'**Vòng cuối thống nhất:** đủ 44 lượt trong một run_id, một runtime_revision `{final[0].get("runtime_revision")}`; không ghép ca đạt từ các vòng khác. Mọi lượt thử sơ bộ vẫn giữ trong results.json.' if args.single_run else '**Chọn kết quả cuối:** đã chạy các vòng đầy đủ và thử lại ca chịu ảnh hưởng sau sửa. Mỗi ID bên dưới lấy lần thực thi mới nhất; run_id và mọi lần trước đều giữ trong JSON. Đây không phải một lần đo đồng nhất dùng để công bố benchmark.'),'',
    f'**40 kịch bản gốc, 44 lượt trong vòng cuối:** {counts["Đạt"]} Đạt; {counts["Lỗi"]} Lỗi; {counts["Chưa đủ căn cứ"]} Chưa đủ căn cứ. Có {len(all_rows)} lượt HTTP được lưu qua các vòng sửa/thử lại. Không dùng số này để kết luận độ chính xác hoặc độ phủ toàn bộ chatbot.','',
    f'**Tính theo 40 kịch bản gốc:** {parent_counts["Đạt"]} Đạt; {parent_counts["Lỗi"]} Lỗi; {parent_counts["Chưa đủ căn cứ"]} Chưa đủ căn cứ. Một ca có nhiều lượt nhận trạng thái nghiêm ngặt nhất trong các lượt đó.','',
    ('**Đọc đúng kết quả:** Đạt bao gồm cả việc hỏi thêm hoặc nêu đúng giới hạn khi thiếu căn cứ. Riêng VD04 chống đẩy/reverse crunch, bản sửa ngừng diễn giải sai và báo đúng nhãn/giới hạn; KB vẫn chưa có ngưỡng quá sâu cá nhân hoặc số đo góc đã kiểm chứng. Không coi 40/40 là đã biết mọi câu hỏi hay đã giải thích đầy đủ mọi nhãn.' if args.single_run else ''),'',
    'Đạt = đáp ứng tiêu chí hành vi/nội dung đã rà trong ca này; Lỗi = còn vi phạm cụ thể; Chưa đủ căn cứ = đầu ra an toàn nhưng chưa đủ để xác nhận yêu cầu, hoặc cần thẩm định thêm. Không lấy supported=true của LLM để tự chấm đạt.','',
    '## Những phần đã sửa','',
    '- Planner xác định trọng tâm và số ý cần trả; câu hỏi một chi tiết không bị buộc nhận ba ý. Reviewer chọn tập ý nhỏ nhất và có thể bỏ vế cuối thừa, giữ nguồn gốc và điều kiện áp dụng. Không thêm bảng đáp án vào KB/prompt.',
    '- Giữ lịch sử để hiểu tham chiếu; tách xã giao, thiếu tên bài, thiếu quan sát, nguồn trích dẫn và câu hỏi kỹ thuật. Giới hạn KB được nêu trước khi truy xuất gần nghĩa sai.',
    '- Kết quả video thật được kiểm tra schema và dùng để truy xuất theo nhãn; tách nhãn dự đoán khỏi lời khuyên KB. Chặn nhận xét kỹ thuật cá nhân khi video chưa đủ khớp.',
    '- Phần điểm chỉ hiển thị tiêu chí liên quan khoản trừ có chính sách; thiếu quy tắc thì trả ngắn và không chèn danh sách hướng dẫn không được hỏi.',
    '- Nguồn vẫn hiển thị [1], [2] và mở được đoạn trích. JSON giữ ID, quote, trace, bản nháp, quyết định chọn ý và những lần thất bại.','',
    ('- Sửa KT01/KT02 bằng span nhiều câu hoặc các span bổ sung trong cùng tài liệu đã truy xuất; kiểm tra thuật ngữ cơ thể còn thiếu rồi review ý nghĩa/pha/biến thể. Không chỉ kiểm tra ID tồn tại. VD02 gửi trạng thái video qua API. VD03 dùng yêu cầu/nhãn thật làm trọng tâm thay cho tiền đề tần suất trong rewrite, giữ bộ chặn nhận định ngoài nguồn và giữ quan sát hợp lệ khi cần fallback. VD04 phân biệt liên kết direct/partial/none và thuộc tính/quan sát; không dùng cue gần chủ đề để giả vờ giải thích đúng nhãn.' if args.single_run else ''),'',
    '## Dữ liệu và cách chạy','',
    '- Câu hỏi/tiêu chí lấy nguyên từ BO_KICH_BAN_TEST_CHATBOT_THU_CONG.md. VD04 mở rộng thành ba bài; MT03 có câu bổ sung; DI03 thử cả hai chế độ, tổng cộng 44 lượt.',
    '- HTTP thực: web API 8001 → KB/RAG 8010 → Ollama qwen3:8b; embedding qwen3-embedding:0.6b; KB kb_a3a9fc4465797bf3; Neo4j. Cấu hình/version runtime lưu trong bộ minh chứng.',
    ('- Ngữ cảnh cuối dùng năm video người tập được suy luận mới trên CPU: hai squat, một chống đẩy, một jumping jack và một reverse crunch. Chọn clip quan sát được để kiểm tra tích hợp; đây không phải tập đánh giá độ chính xác DL. Không sửa nhãn/ngưỡng để ép kết quả.' if args.single_run else '- Ngữ cảnh cuối dùng năm video người tập được suy luận mới trên CPU: hai squat, một chống đẩy, một jumping jack và một reverse crunch. Ngoài năm video này, ban đầu còn hai video nằm sàn thiếu khớp; giữ lại kết quả đó và thử video khác có quan sát được. Không sửa nhãn/ngưỡng để ép kết quả.'),
    '- VD06 dùng video đen tổng hợp không có người để kiểm tra lỗi quan sát; model chạy thật trên video tổng hợp, không gọi đó là buổi tập thật.',
    ('- Kiểm tra UI riêng dùng Chrome thật, phân tích video thật và gọi chat API thật cho VD01/VD02 để kiểm tra trạng thái/thao tác gắn. Các output đã lưu khác được phát lại chỉ để kiểm tra hiển thị/payload, không tính là lượt LLM mới. Lỗi 503 được giả lập bằng route trình duyệt; không dừng dịch vụ người dùng.' if args.single_run else '- Kiểm tra UI riêng dùng Chrome thật, phân tích video thật, phát lại các output HTTP đã lưu để kiểm tra hiển thị/payload. Các lượt phát lại không được tính là lượt LLM mới. Lỗi 503 được giả lập bằng route trình duyệt; không dừng dịch vụ người dùng.'),
    '- Không huấn luyện model, không thu thập thêm tri thức, không tạo chính sách chấm điểm thật và không coi nhãn model là ground truth.','',
    '## Tổng hợp theo kịch bản','',
    '| ID | Kết quả | Ghi chú |','|---|---|---|']
for cid,rows in parents.items():
    notes='; '.join(dict.fromkeys(r['review']['note'] for r in rows))
    md.append(f'| {cid} | {parent_status[cid]} | {notes.replace("|","/")} |')
md+=['','## Thời gian đo được','', '| Nhóm | Số lượt | Trung vị (giây) | Khoảng min–max |','|---|---:|---:|---:|']
for key,t in timings.items():md.append(f'| {key} | {t["n"]} | {t["median_seconds"]} | {t["min_seconds"]}–{t["max_seconds"]} |')
md+=['','Thời gian trên là một vòng chức năng với nhiều câu khác nhau, đã có các lượt chạy trước; không giả định lượt đầu là nguội. Không phải benchmark P50/P95 lặp nhiều lần trên tập độc lập. Inference video đo riêng trong manifest.','',
    '## Các lỗi hoặc phần chưa đủ căn cứ còn lại','']
for r in final:
    if r['review']['status']!='Đạt':md.append(f'- **{r["case_id"]} — {r["review"]["status"]}:** {r["review"]["note"]}')
if args.single_run and all(r['review']['status']=='Đạt' for r in final):
    md+=['Không còn ca lỗi theo tiêu chí của bộ kiểm thử phát triển này. Vẫn cần mở rộng/duyệt quan hệ nhãn–tri thức, đánh giá tập câu hỏi độc lập, kiểm chứng chuyên môn và benchmark nóng/nguội. Bộ kiểm tra thuật ngữ chỉ hỗ trợ phát hiện thiếu span, không tự chứng minh diễn giải đúng.']
md+=['','## Chi tiết 44 lượt trong vòng cuối','']
for r in final:
    o=r.get('output',{});md += [f'### {r["case_id"]} — {r["review"]["status"]}','',f'**Câu hỏi:** {r["input"]["message"]}','',
        f'**Chế độ:** {r["input"]["task"]}; **quan sát:** {len(r["input"]["records"])}; **thời gian:** {r["seconds"]} giây; **HTTP:** {r.get("http_status")}; **mode:** {o.get("generation_mode")}.','',
        '**Câu trả lời thực tế** (đổi ID thành số nguồn cho dễ đọc; bản gốc ở JSON):','', '```text',friendly(o),'```','',
        f'**Nhận xét:** {r["review"]["note"]}','']
    for i,e in enumerate([next(e for e in o.get('evidence',[]) if e['chunk_id']==cid) for cid in dict.fromkeys(o.get('citations',[]))],1):
        md.append(f'- [{i}] [{e["title"]}]({e["url"]}) — {e["publisher"]}'+(f'; trang file PDF {e["pdf_page"]}' if e.get('pdf_page') else '; nguồn web'))
    if o.get('retrieval',{}).get('support_quotes'):
        md+=['','<details><summary>Đoạn trích đã dùng để đối chiếu</summary>','']
        md += ['> '+p['quote'].replace('\n',' ') for p in o['retrieval']['support_quotes']]
        md+=['','</details>','']
md += ['','## File minh chứng','',
    '- Thư mục: smart-gym-ai/services/kb_rag/'+args.out_dir+'/.',
    '- final_results.json: vòng cuối đủ 44 lượt và nhận xét; results.json: toàn bộ các vòng, giữ cả lỗi.',
    '- scenario_manifest.json: 40 ca/tiêu chí và SHA256 của bộ gốc. manual_review.json: nhận xét riêng từng lượt.',
    '- video_*.json và các manifest: kết quả suy luận mới, hash, video ban đầu thiếu khớp và video thay thế.',
    '- browser/verification.json và ảnh desktop/mobile: kiểm tra UI; captured_inputs.json và actual_video_analysis.json: request/video thật.',
    f'- Các file runtime_*.json: model/KB/runtime revision theo vòng. {args.kb_tests} unit test KB và {args.web_tests} test web/API đạt; không quy số unit test thành độ chính xác khoa học.',
    '- Chưa nhập các hội thoại mới của vòng này vào Neo4j. UI/JSON đúng không tự chứng minh trace demo mới đã có trong Neo4j.']
graph_path=OUT/'graph_verification.json'
graph=json.loads(graph_path.read_text(encoding='utf-8')) if graph_path.exists() else {}
md+=['- graph_verification.json: kiểm tra đọc Neo4j thật'+(f', {graph["kb_nodes"]} nút cùng version; {graph["unique_cited_chunks"]} chunk được trích đều tồn tại' if graph else '')+'. Đây là kiểm tra nhất quán ID, không chứng minh mọi câu diễn giải đúng.']
report_md=WORKSPACE/(args.report_stem+'.md');report_md.write_text('\n'.join(md)+'\n',encoding='utf-8')

esc=html.escape
cards=[]
for r in final:
    o=r['output'];review=r['review'];proof=''
    for p in o.get('retrieval',{}).get('support_quotes',[]):proof+='<blockquote>'+esc(p['quote'])+'</blockquote>'
    refs=''.join('<li>'+esc(e['title'])+' · '+esc(e['publisher'])+(f' · trang file {e["pdf_page"]}' if e.get('pdf_page') else ' · Web')+' — <a target="_blank" rel="noopener noreferrer" href="'+esc(e['url'],quote=True)+'">Mở nguồn</a></li>' for e in o.get('evidence',[]) if e['chunk_id'] in o.get('citations',[]))
    cards.append(f'<article data-status="{esc(review["status"])}" data-group="{r["parent_id"][:2]}"><h2>{r["case_id"]} <span>{esc(review["status"])}</span></h2><p class="q">{esc(r["input"]["message"])}</p><p class="meta">{esc(r["input"]["task"])} · {r["seconds"]} giây · {len(r["input"]["records"])} quan sát · {esc(o.get("generation_mode",""))}</p><pre>{esc(friendly(o))}</pre><p><strong>Rà soát:</strong> {esc(review["note"])}</p><details><summary>Nguồn và đoạn trích</summary><ul>{refs}</ul>{proof}</details></article>')
doc='''<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SmartGym — Kết quả test</title><style>
body{font:16px/1.65 system-ui,sans-serif;max-width:1100px;margin:32px auto;padding:0 20px;background:#f4f7f4;color:#163e37}h1{line-height:1.25}article,.intro{background:white;padding:22px;border:1px solid #d6e3da;border-radius:14px;margin:20px 0}h2{font-size:20px;margin:0 0 12px}h2 span{font-size:14px;float:right;color:#785524}.q{font-weight:650}.meta{font-size:13px;color:#526d61}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;background:#edf5eb;border-radius:8px;padding:16px}blockquote{border-left:3px solid #a9c3a3;padding-left:16px;margin-left:0;color:#536657}a{color:#216b54}summary{cursor:pointer}nav{position:sticky;top:0;background:#e7efe7;padding:12px;border-radius:10px;display:flex;flex-wrap:wrap;gap:12px;z-index:1}input,select{font:inherit;padding:7px;max-width:100%;border:1px solid #b9cbbd;border-radius:6px}input{flex:1;min-width:160px}[hidden]{display:none!important}@media print{nav{display:none}article{break-inside:avoid}body{margin:0;max-width:none}}
</style><h1>'''+esc(title)+'''</h1><section class="intro"><p><strong>40 kịch bản · 44 lượt trong vòng cuối</strong></p><p>'''+f'{counts["Đạt"]} Đạt · {counts["Lỗi"]} Lỗi · {counts["Chưa đủ căn cứ"]} Chưa đủ căn cứ'+'''</p><p>Rà soát bởi trợ lý phát triển theo tiêu chí của từng ca. Không phải thẩm định chuyên môn hoặc độ chính xác trên mọi câu hỏi. Bản Markdown và JSON chứa phương pháp, thời gian, phiên bản và các lần lỗi trước sửa.</p><p>Video: suy luận mới trên năm video người tập; video đen tổng hợp dùng riêng để kiểm tra thiếu quan sát. UI có kiểm thử thật và phát lại output, ghi rõ trong báo cáo.</p></section><nav><input id="search" type="search" placeholder="Tìm câu hỏi, ID hoặc nội dung"><select id="status"><option value="">Mọi kết quả</option><option>Đạt</option><option>Lỗi</option><option>Chưa đủ căn cứ</option></select><select id="group"><option value="">Mọi bộ</option>'''+''.join(f'<option value="{g}">{g}</option>' for g in ['XG','KT','HT','MT','VD','DI','BT','GH','TC'])+'''</select><span id="count"></span></nav>'''+''.join(cards)+'''<script>const els=[...document.querySelectorAll('article')];function filter(){const q=document.querySelector('#search').value.toLocaleLowerCase('vi');const status=document.querySelector('#status').value,group=document.querySelector('#group').value;let n=0;for(const e of els){e.hidden=!!((q&&!e.textContent.toLocaleLowerCase('vi').includes(q))||(status&&e.dataset.status!==status)||(group&&e.dataset.group!==group));if(!e.hidden)n++;}document.querySelector('#count').textContent=n+' / '+els.length+' lượt';}for(const id of ['search','status','group'])document.querySelector('#'+id).addEventListener('input',filter);filter();</script></html>'''
if args.single_run:
    doc=doc.replace('</section><nav>','<p><strong>Đạt bao gồm việc nêu đúng giới hạn.</strong> VD04 đã ngừng diễn giải sai; KB vẫn thiếu ngưỡng quá sâu cá nhân và số đo góc đã kiểm chứng. Không coi kết quả bộ test này là đã giải thích được mọi nhãn hoặc biết mọi câu hỏi.</p></section><nav>',1)
(WORKSPACE/(args.report_stem+'.html')).write_text(doc,encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False,indent=2))
