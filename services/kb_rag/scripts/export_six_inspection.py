"""Export a compact KB preview and real, line-linked method excerpts."""
from pathlib import Path
import json,html,ast
ROOT=Path(__file__).resolve().parents[1]
index=ROOT/'data/releases/six_exercises_20261118_r3'
snap=json.loads((index/'snapshot.json').read_text(encoding='utf-8'))
n_sources=len(snap['sources']);n_chunks=len(snap['chunks']);n_claims=len(snap['claims'])
n_nodes=len(snap['graph']['nodes']);n_edges=len(snap['graph']['edges'])
out=ROOT/'artifacts/six_exercises_20261117/releases'/snap['version']
claims={c['id']:c for c in snap['claims']};chunks={c['chunk_id']:c for c in snap['chunks']}
chosen=['squat_bracing','pushup_alignment','jack_sync','crunch_pelvis','highknees_alternate','buttkickers_heel_back']
rows=[]
for identity in chosen:
 c=claims[identity];chunk=chunks[c['chunk_ids'][0]]
 rows.append('<tr><td>'+html.escape(c['exercise_code'])+'<br><code>'+html.escape(identity)+'</code></td><td>'+html.escape(c['text_vi'])+'</td><td><a href="'+html.escape(chunk['url'],quote=True)+'">'+html.escape(chunk['title'])+'</a><br>'+html.escape(chunk['section'] or '')+(f"; PDF p.{chunk['pdf_page']}" if chunk['pdf_page'] else '')+'</td></tr>')
book=chunks['openstax_anatomy_2e2d111a51695430']
book_start=book['text'].index('Although a number of muscles')
book_end=book['text'].index('agonist.',book_start)+len('agonist.')
book_excerpt=book['text'][book_start:book_end]
page=f'''<!doctype html><html lang="vi"><meta charset="utf-8"><title>Mẫu KB sáu bài SmartGym</title><style>@page{{size:A4;margin:16mm}}body{{font:12px/1.4 Arial,sans-serif;color:#193e3b;max-width:760px;margin:26px auto}}h1{{font-size:23px;margin:0 0 8px}}h2{{font-size:15px;margin:13px 0 6px}}table{{width:100%;border-collapse:collapse}}td,th{{border:1px solid #b8ccc5;padding:8px;text-align:left;vertical-align:top}}th{{background:#e4eee9}}code{{font-size:10px;overflow-wrap:anywhere}}a{{color:#267366}}.box{{background:#edf3ef;padding:10px;border-radius:6px}}small{{color:#526962}}@media print{{body{{margin:0;max-width:none}}a{{text-decoration:none}}}}</style><main><h1>SmartGym · Mẫu KB sáu bài</h1><div class="box"><b>{snap['version']}</b> · {n_sources} hồ sơ nguồn · {n_chunks} đoạn · {n_claims} tiêu chí · {n_nodes} nút / {n_edges} cạnh · 128 nhãn.<br>Xuất từ snapshot đã đối chiếu Neo4j; đây là bản xem dữ liệu, không phải ảnh Neo4j Browser.</div><h2>Ví dụ tiêu chí có nguồn</h2><table><thead><tr><th>Bài / khóa</th><th>Diễn giải lưu trong KB</th><th>Vị trí nguồn</th></tr></thead><tbody>{''.join(rows)}</tbody></table><h2>Một đoạn sách PDF đã lập chỉ mục</h2><p><code>{book['chunk_id']}</code> · <b>{html.escape(book['title'])}</b> · trang PDF {book['pdf_page']} · {html.escape(book['section'] or '')}</p><blockquote>{html.escape(book_excerpt)}…</blockquote><small>Đoạn minh họa định vị dữ liệu, không được dùng phần trích ngắn này thay toàn bộ ngữ cảnh. OpenStax: Access for free at openstax.org.</small><h2>Đọc các trường và quan hệ</h2><p><code>source_id</code>: hồ sơ nguồn; <code>chunk_id</code>: đoạn + định vị; <code>anchor</code>: cụm gốc đối chiếu; <code>text_vi</code>: diễn giải; <code>review_status</code>: tình trạng duyệt. Source → HAS_CHUNK → Chunk ← SUPPORTED_BY ← Criterion ← HAS_CRITERION ← Exercise → HAS_LABEL → ModelLabel.</p><p><b>Nguồn:</b> ACE, NASM, Ohio University, CDC, sách OpenStax, PDF NSCA, PDF HHS; một ghi chú Queensland cũ có đánh dấu và một hồ sơ quy ước phần mềm SmartGym. 12 hồ sơ không phải 12 tổ chức độc lập.</p><p><b>Độ phủ nhãn lỗi:</b> 8 direct, 20 partial, 2 none. Có anchor không đồng nghĩa đã được chuyên gia xác nhận. Bản dịch và điều kiện áp dụng còn cần rà chuyên môn.</p><p><a href="smartgym_six_kb.cypher">Cypher dựng lại KB</a> · <a href="quality_audit.json">Kiểm tra nguồn/cấu trúc</a> · <a href="neo4j_roundtrip.json">Đối chiếu Neo4j</a></p></main></html>'''
(out/'kb_one_page.html').write_text(page,encoding='utf-8')
specs=[('kb_service/ingest.py','def build_index','Thu thập, hash và dựng bản ứng viên'),
 ('kb_service/retrieval.py','def search','Truy xuất nhiều kênh'),
 ('kb_service/knowledge.py','def plan_question','Hiểu yêu cầu và ngữ cảnh'),
 ('kb_service/knowledge.py','source_review=','Cổng kiểm tra bằng chứng, không nhận câu hỏi'),
 ('kb_service/knowledge.py','review=Review.model_validate','Cổng trọng tâm, chỉ nhận các ý đã kiểm chứng'),
 ('kb_service/observation_chat.py','def require_source_instruction_only','Tách cue kỹ thuật có nguồn khỏi nhãn dự đoán'),
 ('kb_service/chatbot.py','def answer_chatbot','Bốn chức năng và quan sát model'),
 ('scripts/export_six_kb.py','def properties','Xuất thuộc tính/provenance sang Cypher')]
lines=['# Code thật gắn với luồng KB + RAG','',f"Snapshot: `{snap['version']}`. Trích đúng file trên ổ đĩa lúc xuất; cần đối chiếu runtime_revision của lượt test khi code thay đổi.",'']
for relative,anchor,title in specs:
 path=ROOT/relative;content=path.read_text(encoding='utf-8').splitlines();start=next(i for i,line in enumerate(content) if anchor in line)
 lines +=[f'## {title}','',f'File `{path.relative_to(ROOT.parents[2]).as_posix()}`, dòng {start+1}.','', '```python','\n'.join(content[start:start+10]),'```','']
(out/'code_map.md').write_text('\n'.join(lines),encoding='utf-8')
print(json.dumps({'preview':str(out/'kb_one_page.html'),'code_map':str(out/'code_map.md')}))
