"""Human-readable transcript, with mechanical and development review separated."""
from pathlib import Path
from collections import Counter,defaultdict
import argparse,json,re,html,statistics
ROOT=Path(__file__).resolve().parents[1];WORKSPACE=ROOT.parents[2]

def main():
    p=argparse.ArgumentParser();p.add_argument('run',type=Path);p.add_argument('--reviews',type=Path);a=p.parse_args();a.run=a.run.resolve()
    rows=json.loads((a.run/'results.json').read_text(encoding='utf-8'))
    summary=json.loads((a.run/'summary.json').read_text(encoding='utf-8'))
    reviews=json.loads(a.reviews.read_text(encoding='utf-8')) if a.reviews else {}
    if 'reviews' in reviews:reviews=reviews['reviews']
    version=summary['health_before']['kb_version'];index=ROOT/'data/releases/six_exercises_20261118_r3'
    snap=json.loads((index/'snapshot.json').read_text(encoding='utf-8'))
    if snap['version']!=version:raise ValueError('Report snapshot differs from tested release')
    by_source={s['id']:s for s in snap['sources']};chunks={c['chunk_id']:c for c in snap['chunks']}
    verdicts=Counter(reviews.get(r['case']['id'],{}).get('verdict','chưa đọc') for r in rows)
    reused=sum(reviews.get(r['case']['id'],{}).get('review_origin','').startswith('reused_') for r in rows)
    review_note=f'{reused} ca kế thừa nhận xét phát triển trước vì toàn bộ input, trạng thái, lời đáp, citation và đoạn trích giữ nguyên trong cùng KB. Ca thay đổi có nhận xét riêng; đây không phải lượt đánh giá mới bởi chuyên gia độc lập.'
    lat=[r['seconds'] for r in rows];lat_sorted=sorted(lat)
    p95=lat_sorted[min(len(lat_sorted)-1,__import__('math').ceil(.95*len(lat_sorted))-1)]
    report_metrics={'cases':len(rows),'mechanical_pass':sum(r['mechanical_checks_pass'] for r in rows),'development_reviews':dict(verdicts),
                    'latency_seconds':{'median':round(statistics.median(lat),3),'p95':p95,'maximum':max(lat),'first_request':lat[0]},
                    'run_id':summary['run_id'],'kb_version':version,'runtime_revision':summary['health_before']['runtime_revision'],
                    'same_runtime':summary['same_runtime'],'reused_identical_output_reviews':reused,'no_exhaustive_or_expert_accuracy_claim':True}
    groups=defaultdict(list)
    for row in rows:
        exercise=row['case']['exercise'];groups['COMPARE' if isinstance(exercise,list) else exercise].append(row)
    report_metrics['by_exercise']={code:{'n':len(group),'mechanical_pass':sum(r['mechanical_checks_pass'] for r in group),
        'content_verdicts':dict(Counter(reviews.get(r['case']['id'],{}).get('verdict','chưa đọc') for r in group))} for code,group in groups.items()}
    latency_groups={'knowledge_with_retrieval':[r['seconds'] for r in rows if r['case']['task']=='knowledge' and r.get('output',{}).get('evidence')],
                    'social':[r['seconds'] for r in rows if r.get('output',{}).get('status')=='conversational'],
                    'score_summary_practice':[r['seconds'] for r in rows if r['case']['task']!='knowledge']}
    report_metrics['latency_by_task']={name:{'n':len(values),'median':round(statistics.median(values),3),
        'p95':sorted(values)[min(len(values)-1,__import__('math').ceil(.95*len(values))-1)]} for name,values in latency_groups.items() if values}
    (a.run/'report_metrics.json').write_text(json.dumps(report_metrics,ensure_ascii=False,indent=2),encoding='utf-8')
    def visible_reply(row):
        data=row.get('output',{});cids=data.get('citations',[]);numbers={cid:i+1 for i,cid in enumerate(cids)}
        reply=data.get('reply',row.get('error',''))
        for cid,number in numbers.items():reply=reply.replace('['+cid+']','['+str(number)+']')
        return reply
    lines=['# Kết quả kiểm thử chatbot SmartGym — sáu bài','',
     f"Lượt chạy: `{summary['run_id']}`; KB `{version}`; runtime `{report_metrics['runtime_revision']}`; model `{summary['health_before']['llm_model']}`.",'',
     '**Phân biệt kết quả:** kiểm tra API/citation tự động không phải độ chính xác nội dung. Cột nhận xét là rà phát triển bởi Codex đối chiếu nguồn, chưa có chuyên gia độc lập. Bộ câu hỏi đã được dùng trong quá trình sửa lỗi, không phải bộ đánh giá mù. Không kiểm chứng được mọi cách hỏi có thể phát sinh.','',
     f"- Số lượt: {len(rows)}; kiểm tra cơ học đạt: {report_metrics['mechanical_pass']}/{len(rows)}.",
     f"- Rà nội dung: {dict(verdicts)}.",
     f"- Độ trễ: trung vị {report_metrics['latency_seconds']['median']} giây; P95 {p95} giây; lớn nhất {max(lat)} giây. Lượt đầu {lat[0]} giây; chưa có thí nghiệm cold-start riêng.",
     '- Các ca có JSON model dùng dữ liệu giả lập có nhãn rõ. Quy tắc trừ 2 điểm chỉ là chính sách demo. Không dùng chúng để công bố độ chính xác video hoặc bảng điểm chính thức.','',
     '## Phân bố kết quả theo bài','', '| Bài/nhóm | Số lượt | Kiểm tra cơ học đạt | Rà nội dung |','|---|---:|---:|---|']
    for code,metrics in report_metrics['by_exercise'].items():lines.append(f"| {code} | {metrics['n']} | {metrics['mechanical_pass']} | {metrics['content_verdicts']} |")
    lines+=['','## Kết quả từng câu','', '| Mã | Phạm vi | Trạng thái | Rà nội dung | Giây | Nhận xét |','|---|---|---|---|---|---|']
    cards=[]
    for row in rows:
        c=row['case'];o=row.get('output',{});review=reviews.get(c['id'],{});verdict=review.get('verdict','chưa đọc');note=review.get('note','Chưa rà nội dung.')
        exercise=', '.join(c['exercise']) if isinstance(c['exercise'],list) else c['exercise']
        lines.append(f"| {c['id']} | {exercise} | {o.get('status','error')} | {verdict} | {row['seconds']} | {note.replace('|','/')} |")
        refs=[]
        for i,cid in enumerate(o.get('citations',[]),1):
            chunk=chunks.get(cid,{})
            refs.append(f'<li>[{i}] <a href="{html.escape(chunk.get("url",""),quote=True)}">{html.escape(chunk.get("title",cid))}</a> — {html.escape(str(chunk.get("section") or ""))}'+(f'; trang PDF {chunk["pdf_page"]}' if chunk.get('pdf_page') else '')+'</li>')
        raw=json.dumps({'input':row['input'],'output':o,'checks':row.get('checks',{}),'review':review},ensure_ascii=False,indent=2)
        css='pass' if verdict=='đạt' else 'limit' if verdict=='giới hạn hợp lệ' else 'fail' if verdict=='cần sửa' else 'pending'
        cards.append(f'''<article class="{css}" data-exercise="{html.escape(exercise)}" data-verdict="{html.escape(verdict)}"><h3>{html.escape(c['id'])} <span>{html.escape(verdict)}</span></h3><p class="meta">{html.escape(exercise)} · {html.escape(c['task'])} · {html.escape(o.get('status','error'))} · {row['seconds']} giây</p><div class="question">{html.escape(c['message'])}</div><div class="answer">{html.escape(visible_reply(row))}</div><ol class="refs">{''.join(refs)}</ol><p class="note">{html.escape(note)}</p><details><summary>Input/output JSON, nguồn truy xuất và kiểm tra</summary><pre>{html.escape(raw)}</pre></details></article>''')
    lines+=['',review_note,'','## Toàn văn câu hỏi và lời đáp','']
    for row in rows:
        c=row['case'];lines +=[f"### {c['id']}",'', '**Hỏi:** '+c['message'],'','**Trả lời thực tế:**','',visible_reply(row),'', '**Rà phát triển:** '+reviews.get(c['id'],{}).get('note','Chưa rà.'),'']
    lines+=['## Nguồn có trong bản KB','', '| Nguồn | Tài liệu | Số đoạn | Vai trò/phạm vi |','|---|---|---|---|']
    for s in snap['sources']:lines.append(f"| {s['id']} | [{s['title']}]({s['url']}) | {s['chunks']} | {s.get('source_role',s.get('review_scope','Hướng dẫn/giải phẫu có nguồn'))} |")
    lines+=['','## Phạm vi chưa được nghiệm thu','',
     '- Chưa xác nhận chính xác chuyên môn toàn bộ 38 tiêu chí; anchor tồn tại không đồng nghĩa mọi diễn giải đã đúng.',
     '- Trong 30 nhãn lỗi: 8 direct, 20 partial, 2 none. Hai bài mới chưa có video thật trong lượt đánh giá này.',
     '- Không có ngưỡng góc/cadence cá nhân được kiểm chứng, công thức calo hay giáo án điều trị cá nhân.',
     '- Không lấy tỷ lệ đạt của tập này làm cam kết chatbot trả đúng mọi câu hỏi về sáu bài.',
     '- Những ca “cần sửa” được giữ nguyên, không đổi thành đạt khi chỉ chuyển sang thông báo thiếu căn cứ.','',
     '## Dữ liệu để kiểm tra lại','',f"- [Input/output đầy đủ]({a.run.relative_to(WORKSPACE).as_posix()}/results.json)",
     f"- [Tóm tắt lượt chạy]({a.run.relative_to(WORKSPACE).as_posix()}/summary.json)",
     f"- [Chỉ số báo cáo]({a.run.relative_to(WORKSPACE).as_posix()}/report_metrics.json)"]
    base=WORKSPACE/'KET_QUA_TEST_CHATBOT_6_TU_THE_2026-11-18'
    base.with_suffix('.md').write_text('\n'.join(lines),encoding='utf-8')
    options=''.join(f'<option>{html.escape(code)}</option>' for code in snap['label_catalog']['exercises'])
    page=f'''<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kết quả test chatbot SmartGym sáu bài</title><style>
body{{font:16px/1.6 system-ui,sans-serif;color:#173e40;background:#f3f6f5;margin:0}}main{{max-width:1050px;margin:32px auto;padding:0 20px}}h1{{line-height:1.25}}.intro,article{{background:white;padding:22px;border-radius:12px;margin:18px 0;border:1px solid #dce6e2}}article.pass{{border-left:5px solid #20705b}}article.limit{{border-left:5px solid #b58a29}}article.fail{{border-left:5px solid #ba4747}}article.pending{{border-left:5px solid #7a8585}}h3{{margin:0 0 6px}}h3 span{{font-size:13px;float:right;padding:2px 9px;background:#edf2ef;border-radius:8px}}.meta,.refs{{font-size:13px;color:#516563}}.question{{background:#e4eddb;padding:14px;border-radius:9px;margin:12px 0}}.answer{{white-space:pre-wrap;background:#eff5f2;padding:14px;border-radius:9px}}.note{{font-size:14px}}pre{{overflow:auto;max-height:500px;white-space:pre-wrap;overflow-wrap:anywhere;background:#eef2f3;padding:14px;font-size:12px}}select,input{{font:inherit;padding:8px;margin:5px;border:1px solid #acbeb7;border-radius:6px}}.filters{{position:sticky;top:0;background:#f3f6f5;padding:10px 0}}a{{color:#246c65}}summary{{cursor:pointer}}@media print{{.filters,details{{display:none}}article{{break-inside:avoid}}}}
</style><main><h1>SmartGym · Kiểm thử chatbot sáu bài</h1><section class="intro"><p><b>{len(rows)} tình huống</b> · {report_metrics['mechanical_pass']}/{len(rows)} kiểm tra cơ học đạt.</p><p>Rà nội dung: {html.escape(str(dict(verdicts)))}.</p><p>KB <code>{version}</code> · runtime <code>{report_metrics['runtime_revision']}</code> · {html.escape(summary['health_before']['llm_model'])}/Ollama. Trung vị {report_metrics['latency_seconds']['median']} giây; P95 {p95} giây.</p><p>Đây là đánh giá phát triển, chưa được chuyên gia độc lập nghiệm thu. Các ca model và bảng trừ 2 điểm là giả lập. Bộ test đại diện không chứng minh mọi câu hỏi đều được trả lời đúng.</p><p><a href="{a.run.relative_to(WORKSPACE).as_posix()}/results.json">Tải toàn bộ input/output JSON</a></p></section><div class="filters"><select id="exercise"><option value="">Tất cả bài</option>{options}<option>GENERAL</option></select><select id="verdict"><option value="">Tất cả kết quả</option><option>đạt</option><option>giới hạn hợp lệ</option><option>cần sửa</option><option>chưa đọc</option></select><input id="search" placeholder="Tìm câu hỏi, mã test hoặc nội dung"><span id="count"></span></div>{''.join(cards)}</main><script>
const controls=['exercise','verdict','search'].map(x=>document.getElementById(x));function filter(){{let n=0;document.querySelectorAll('article').forEach(a=>{{const ok=(!controls[0].value||a.dataset.exercise.includes(controls[0].value))&&(!controls[1].value||a.dataset.verdict===controls[1].value)&&a.innerText.toLowerCase().includes(controls[2].value.toLowerCase());a.hidden=!ok;if(ok)n++;}});document.getElementById('count').textContent=n+' tình huống';}}controls.forEach(x=>x.addEventListener('input',filter));filter();
</script></html>'''
    page=page.replace('<div class="filters">','<p class="note">'+html.escape(review_note)+'</p><div class="filters">',1)
    base.with_suffix('.html').write_text(page,encoding='utf-8')
    print(json.dumps({'report':str(base),'metrics':report_metrics},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
