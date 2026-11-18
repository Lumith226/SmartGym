"""Readable coverage report, kept separate from retrieval/answer accuracy claims."""
import json
from collections import Counter
from kb_service.config import ROOT
out=ROOT/'artifacts/coverage_audit'
report=json.loads((out/'report.json').read_text(encoding='utf-8'));cases=json.loads((out/'cases.json').read_text(encoding='utf-8'))
positive=[c for c in cases if c['source_recall_at_5'] is not None]
e2e=[c for c in cases if 'output' in c];valid=sum(c['citation_ids_valid'] for c in e2e)
lines=['# Độ phủ KB và kiểm tra hội thoại SmartGym','',
 'Bộ 36 câu do người phát triển viết để kiểm thử: diễn đạt khác nhau, không dấu, nối tiếp hội thoại, đổi chủ đề, thiếu dữ liệu và thiếu kiến thức. Không phải tập huấn luyện, danh sách câu hỏi mẫu của chatbot hay benchmark độc lập.','',
 '## 1. Độ phủ nội dung hiện có','',
 f"KB `{report['kb_version']}` có 7 tài liệu từ 4 đơn vị xuất bản, 194 đoạn và 23 tiêu chí kỹ thuật. Model trả lời hiện dùng `{report['llm_model']}`.",
 '171/194 đoạn (88,1%) đến từ sách giải phẫu; chỉ 23 đoạn (11,9%) thuộc hướng dẫn bài tập. Nhiều đoạn sách không đồng nghĩa đã có đầy đủ kiến thức lập giáo án, dinh dưỡng hoặc sửa lỗi cá nhân hóa.','',
 '| Nguồn | Số đoạn |','|---|---|']
for source,n in report['chunk_distribution'].items():lines.append(f'| {source} | {n} |')
lines+=['','## 2. Độ phủ liên kết nhãn lỗi','',
 '| Bài | Tổng nhãn | Nhãn lỗi | Trực tiếp | Một phần | Chưa có |','|---|---:|---:|---:|---:|---:|']
for e in report['model_label_coverage']['exercises']:
    c=e['error_coverage'];lines.append(f"| {e['exercise_code']} | {e['labels']} | {e['errors']} | {c.get('direct',0)} | {c.get('partial',0)} | {c.get('none',0)} |")
lines+=['','Tổng 23 nhãn lỗi: 8 trực tiếp (34,8%), 13 một phần (56,5%), 2 chưa có (8,7%). Không cộng trực tiếp + một phần để tuyên bố phủ đầy đủ. 83 là tổng tất cả nhãn, gồm thuộc tính/trạng thái/khả năng quan sát, không phải 83 lỗi. Các liên kết vẫn chờ duyệt chuyên môn.','',
 '## 3. Kiểm tra truy xuất khi đổi cách hỏi','',
 f"Trên {len(positive)} câu đã gán tài liệu nguồn kỳ vọng, trung bình Source Recall@5: bộ lọc cũ {report['baseline_mean_source_recall_at_5']:.1%}; đường truy xuất ngữ nghĩa mới {report['semantic_mean_source_recall_at_5']:.1%}.",
 f"Có ít nhất một nguồn kỳ vọng ở top 5: {sum(c['source_recall_at_5']>0 for c in positive)}/{len(positive)} câu. Có đủ mọi nguồn kỳ vọng: {sum(c['source_recall_at_5']==1 for c in positive)}/{len(positive)} câu.",
 'Đây là chỉ số tìm nguồn, chưa đo đoạn cụ thể có trả lời đúng câu hỏi, chưa đo độ tự nhiên và chưa đo toàn bộ tri thức thể hình. Các câu so sánh có thể cần hai nguồn nên tìm một nguồn chỉ được tính một phần.','',
 '| Nhóm câu hỏi | Số câu | Bộ lọc cũ | Ngữ nghĩa mới |','|---|---:|---:|---:|']
for group,g in report['groups'].items():lines.append(f"| {group} | {g['queries']} | {g['baseline_source_recall_at_5']:.1%} | {g['semantic_source_recall_at_5']:.1%} |")
lines+=['','### Phân biệt thiếu ngữ cảnh và ngoài phạm vi','', '| Câu | Hành vi kỳ vọng | Thực tế |','|---|---|---|']
for c in report['action_cases']:lines.append(f"| {c['id']} | {c['expected']} | {c['actual']} |")
lines+=['','## 4. Câu trả lời chạy thật','',
 f"Đã gọi API và Ollama thật cho {len(e2e)} trường hợp trong bộ kiểm tra. {valid}/{len(e2e)} output có danh sách citation chỉ chứa ID đã truy xuất. Điều này chỉ kiểm tra cấu trúc, không chứng minh mọi diễn giải đều đúng.",
 'Mỗi câu trả lời kiến thức có đoạn trích đối chiếu nguyên văn và bước LLM kiểm tra bản nháp. Bộ kiểm tra LLM có thể sai; không gọi đây là thẩm định độc lập. Bản nháp không đạt được chặn và thử sửa một lần.','',
 '| Câu | Trạng thái | Cách trả lời | Citation |','|---|---|---|---:|']
for c in e2e:
    a=c['output'];lines.append(f"| {c['id']} | {a['status']} | {a['generation_mode']} | {len(a['citations'])} |")
lines+=['','**Nhận xét thủ công:** chatbot đã hỏi thêm đúng với câu thiếu ngữ cảnh, hiểu được câu nối tiếp và đổi chủ đề. Tuy nhiên, một số output còn thêm ý ngoài câu hỏi, hoặc một citation chưa chứng minh trọn mọi vế của câu ghép (cần lưu ý các ví dụ reverse crunch). Bộ kiểm tra LLM có thể bỏ sót những lỗi này. Chưa có tỷ lệ chính xác ngữ nghĩa hoặc điểm độ tự nhiên độc lập. Xem `manual_review.json` và tự đối chiếu các output bên dưới.']
lines+=['','## 5. Khoảng trống chưa được giải quyết bằng đổi chatbot','']
for gap in report['open_gaps']:lines.append('- '+gap['gap'])
lines+=['- Chưa có dữ liệu đủ để xác lập thói quen qua nhiều ngày hay tiến bộ dài hạn.',
 '- Chưa có bộ tài liệu và quan hệ được duyệt để kê bài bổ trợ theo nguyên nhân lỗi.',
 '- Hai nhãn child_pose_cheat và puppet_dance chưa có tiêu chí kỹ thuật được liên kết. Các thang ROM và knees_over_toes còn cần đối chiếu mô tả gốc.','',
 '## 6. Output cụ thể và giới hạn chất lượng','']
for c in e2e:lines+=['### '+c['id'],'','**Câu hỏi:** '+c['question'],'','**Output thực tế:**',c['output']['reply'],'']
lines+=['Kết luận: đã bỏ các nhánh FAQ/BOOK_VIEWS và ghép tiêu chí làm đáp án hỏi đáp. Câu hỏi mới được hiểu theo ngữ nghĩa và lịch sử, truy xuất nguồn, rồi LLM tự tổng hợp lời trả lời. Độ phủ nội dung vẫn hữu hạn; không nên ghi KB/RAG đạt 100% hoặc trả lời được mọi câu thể hình.']
(out/'DO_PHU_KB_RAG.md').write_text('\n'.join(lines),encoding='utf-8')
print('Exported',out/'DO_PHU_KB_RAG.md')
