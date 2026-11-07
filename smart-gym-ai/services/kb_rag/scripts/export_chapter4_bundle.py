"""Build a small printable KB sample and a transparent developer review record."""
from html import escape
import json
from kb_service.config import ROOT,Settings

out=ROOT/'artifacts/chatbot';snap=json.loads((Settings.from_env().index_dir/'snapshot.json').read_text(encoding='utf-8'))
claims={c['id']:c for c in snap['claims']};chunks={c['chunk_id']:c for c in snap['chunks']}
rows=[]
for cid in ['squat_back_flat','pushup_hip_control','jack_sync','crunch_pelvis']:
    c=claims[cid];e=chunks[c['chunk_ids'][0]]
    rows.append('<tr><td>'+escape(c['exercise_code'])+'</td><td>'+escape(c['text_vi'])+'</td><td>'+escape(cid)+'<br><a href="'+escape(e['url'],quote=True)+'">'+escape(e['publisher'])+'</a><br>'+escape(e['chunk_id'])+'</td></tr>')
sources='<br>'.join('<a href="'+escape(s['url'],quote=True)+'">'+escape(s['publisher']+' — '+s['title'])+'</a>' for s in snap['sources'])
html='''<!doctype html><html lang="vi"><meta charset="utf-8"><title>Mẫu KB SmartGym</title><style>
@page{size:A4;margin:15mm}*{box-sizing:border-box}body{font:12px/1.55 Arial,sans-serif;color:#173d3d;margin:20px auto;max-width:180mm}h1{font-size:22px}h2{font-size:15px;margin:14px 0 6px}table{border-collapse:collapse;width:100%;font-size:11px}td,th{border:1px solid #b7cbc4;padding:8px;text-align:left;overflow-wrap:anywhere}a{color:#205e50}p{margin:8px 0}.note{font-size:10px;color:#555}@media print{body{margin:0}}
</style><h1>SmartGym — Mẫu đầu ra kho tri thức</h1>'''
html+='<p>Phiên bản <b>'+escape(snap['version'])+'</b> · 7 tài liệu / 4 đơn vị xuất bản · 194 đoạn · 23 tiêu chí · 83 nhãn</p>'
html+='<h2>Tiêu chí có nguồn cho bốn bài</h2><table><tr><th>Bài tập</th><th>Nội dung KB</th><th>Khóa và bằng chứng</th></tr>'+''.join(rows)+'</table>'
html+='<h2>Cách đọc đồ thị</h2><p>Exercise → ModelLabel → TechniqueCriterion → Chunk ← Source<br>Quan hệ chỉ sự liên quan để truy xuất và bằng chứng nguồn, không khẳng định nguyên nhân lỗi.</p>'
html+='<h2>Các tài liệu đã xử lý</h2><p>'+sources+'</p>'
html+='<h2>Vai trò sách PDF</h2><p>OpenStax Anatomy and Physiology 2e: 84 trang được chọn trong file 1.347 trang, tạo 171 đoạn. Ví dụ định nghĩa chủ vận/đối kháng/hiệp đồng được đối chiếu với đoạn sách; mỗi citation giữ thứ tự trang trong file.</p>'
html+='<p class="note">Access for free at openstax.org. Giấy phép sách: CC BY-NC-SA 4.0; đối chiếu manifest nguồn. Liên kết lỗi: 8 trực tiếp, 13 một phần, 2 chưa có; chưa được duyệt chuyên môn. Mẫu này thể hiện cấu trúc KB, không phải kết quả đánh giá độ chính xác DL.</p></html>'
(out/'kb_one_page.html').write_text(html,encoding='utf-8')
review={'method':'Developer manual reading of actual outputs plus structural automated checks; no independent raters or user study.',
        'before_fix':'LLM freely generated incorrect knee-pushup comparison and reverse-crunch starting description; source presence alone did not prevent semantic errors.',
        'changes':['Canonical source-checked criteria for exercise technique','Focused comparison/yes-no answer views','Textbook definition views validated against actual retrieved anchors','Fixed session retrieval domain gate','Shorter session summary and explicit practice suggestions'],
        'after_fix':{'readability':'Clear Vietnamese, concise exercise Q&A; session answers still templated.',
                     'scope':'Four exercise techniques and selected textbook definitions; not exhaustive fitness QA.',
                     'faithfulness':'Reviewed demo cases trace to source criteria; generic free-text branch is not guaranteed by citation validation.',
                     'missing_context':'No invented score, rep total, long-term habit or personalized accessory routine.'},
        'unit_tests':{'kb':55,'web':26},'http_cases':10,'browser_chat_turns':5,'physical_camera_used':False,
        'neo4j':'Actual database, imported demo traces and Browser graph verified.',
        'review_status':'Professional review and independent naturalness evaluation pending.'}
(out/'quality_review.json').write_text(json.dumps(review,ensure_ascii=False,indent=2),encoding='utf-8')
print('Exported kb_one_page.html and quality_review.json')
