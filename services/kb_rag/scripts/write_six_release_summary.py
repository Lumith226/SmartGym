"""Summarize real release evidence and keep remaining failures visible."""
from pathlib import Path
import json,argparse
ROOT=Path(__file__).resolve().parents[1];WORKSPACE=ROOT.parents[2]
parser=argparse.ArgumentParser();parser.add_argument('--run',type=Path,default=ROOT/'artifacts/six_exercises_20261117/run_20261118T020916Z');args=parser.parse_args()
run=args.run.resolve()
metrics=json.loads((run/'report_metrics.json').read_text(encoding='utf-8'))
rows=json.loads((run/'results.json').read_text(encoding='utf-8'))
reviews=json.loads((run/'development_reviews.json').read_text(encoding='utf-8'))['reviews']
unit=json.loads((run/'unit_tests.json').read_text(encoding='utf-8'))
snapshot=json.loads((ROOT/'data/releases/six_exercises_20261118_r3/snapshot.json').read_text(encoding='utf-8'))
artifact=ROOT/'artifacts/six_exercises_20261117/releases'/snapshot['version']
manifest=json.loads((artifact/'manifest.json').read_text(encoding='utf-8'))
def rel(path):return path.relative_to(WORKSPACE).as_posix()
lines=['# Cập nhật KB + KG + RAG SmartGym — 18/11/2026','',
 '**Trạng thái: đã kích hoạt bản phát triển sáu bài; chưa nghiệm thu chatbot hoàn chỉnh.** Web đã khởi động lại tại http://localhost:8080. Kiểm thử qua giao diện thật xác nhận nguồn dạng số, mở đoạn trích, xuất JSON, xã giao và không yêu cầu camera.','',
 '## Bản đang phục vụ','',
 f"- KB `{snapshot['version']}`, runtime `{metrics['runtime_revision']}`, model `qwen3.5:9b`/Ollama; embedding `qwen3-embedding:0.6b`.",
 '- Sáu bài: squat, chống đẩy, jumping jack, reverse crunch, High Knees và Butt Kickers.',
 f"- {len(snapshot['sources'])} hồ sơ tài liệu; {len(snapshot['chunks'])} đoạn; {len(snapshot['claims'])} tiêu chí; {len(snapshot['graph']['nodes'])} nút/{len(snapshot['graph']['edges'])} cạnh; 128 nhãn, gồm 30 nhãn lỗi.",
 '- Liên kết nhãn lỗi: 8 direct / 20 partial / 2 none. Có anchor không đồng nghĩa nội dung đã được chuyên gia xác nhận.',
 '- Hai PDF mới đã xử lý: NSCA Progressive Strategies (5 trang được chọn) và Physical Activity Guidelines, 2nd edition (21 trang). Sách OpenStax dùng 84 trang đã chọn; không đưa toàn bộ sách vào index.',
 '- Nguồn có dữ liệu: ACE, NASM, Ohio University, CDC, OpenStax, NSCA, HHS; thêm ghi chú Queensland có đánh dấu và tài liệu hợp đồng phần mềm SmartGym. 12 hồ sơ không phải 12 nghiên cứu/tổ chức độc lập.','',
 '## Thay đổi đã thực hiện','',
 '- Nối sáu bài/128 nhãn qua schema, alias, catalog, adapter và API bridge. Hỏi kiến thức không cần camera, dataset train hoặc checkpoint vision.',
 '- RAG hiểu câu hỏi/lịch sử, truy xuất lexical + vector + KG, chọn trích đoạn rồi diễn giải và kiểm tra từng ý. Bộ câu hỏi chỉ ở evaluation/tài liệu test, không được đưa vào nguồn KB hoặc bảng đáp án.',
 '- Giữ đúng dấu tiếng Việt trong cổng mục đích; phân biệt nhắm/nhằm, gập/duỗi, hướng về/chạm vào, thời lượng/cadence và điểm nhãn/phép đo.',
 '- Tách nhãn dự đoán, tiêu chí nguồn và kết luận. Giữ thông báo dữ liệu giả lập, không xác nhận model đúng chỉ từ hướng dẫn chung. Thông báo thiếu năng lực lấy từ metadata phiên bản để tránh bịa khả năng chẩn đoán.',
 '- Cho đủ ba ý khi cần mô tả chu kỳ/tiến trình; báo phần chưa xác minh nếu so sánh còn thiếu một phía. Giữ nguồn hướng dẫn chung trong ngữ cảnh truy xuất.',
 '- R3 thêm diễn giải hợp đồng kỹ thuật về loại nhãn/điểm kích hoạt/phép đo trong file raw mới; giữ nguyên r2 và bản bốn bài. Có 283 vector tái dùng theo đúng văn bản/model và một vector mới.','',
 '## Kiểm tra đã chạy','',
 '| Lớp | Bằng chứng | Giới hạn |','|---|---|---|',
 f"| Code | {unit['tests']}/{unit['tests']} unit/API fixtures đạt trước lượt này | Không phải độ đúng ngôn ngữ hoặc thị giác |",
 '| Hợp đồng | 512/512 ca adapter/scope/ledger giả lập đạt | Không dùng ảnh, không đo accuracy vision |',
 '| Nguồn/KG | 10 kiểm tra hash/anchor/cấu trúc/vector; Cypher nhập hai lần khớp thuộc tính/cạnh | Anchor đúng chưa chứng minh diễn giải chuyên môn đúng |',
 '| Cập nhật | 7 ca thêm/sửa/rút nguồn, metadata, vector stale và dựng lại; API bản cũ khởi động riêng đúng 4 bài | Chưa chạy rollback production toàn luồng; không có hot reload |',
 '| Truy xuất | 30 câu gán nhãn đoạn phát triển, hybrid Recall@5=1.0/MRR=.7861; lexical=.7000, dense=.8000, graph=.6833 | Sáu câu khởi động cùng một đoạn HHS; không phải đánh giá mù/chuyên gia |',
 '| Hợp nhất nguồn | ACE-only Recall@5=.3333; ACE+NASM+Ohio=.6500; đầy đủ=1.0 | Cùng tập câu hỏi/top-k/kênh; chỉ đánh giá truy xuất đoạn |',
 f"| Hội thoại | {metrics['cases']} lượt HTTP thật tại `{rows[0]['chat_endpoint']}`, cùng runtime trước/sau | JSON model trong các ca OBS là giả lập; chính sách 2 điểm chỉ demo |",
 f"| Rà nội dung | {metrics['development_reviews']} | Codex phát triển; {metrics['cases']-metrics['reused_identical_output_reviews']} ca thay đổi được đọc lại, {metrics['reused_identical_output_reviews']} ca giống hệt kế thừa nhận xét cũ |",'',
 f"Kiểm tra cơ học API/citation đạt **{metrics['mechanical_pass']}/119**; không dùng tỷ lệ này làm accuracy. Độ trễ toàn bộ tập: trung vị **{metrics['latency_seconds']['median']} giây**, P95 **{metrics['latency_seconds']['p95']} giây**. Nhánh hỏi đáp có truy xuất: trung vị {metrics['latency_by_task']['knowledge_with_retrieval']['median']} giây, P95 {metrics['latency_by_task']['knowledge_with_retrieval']['p95']} giây. Chưa có thí nghiệm nguội riêng; mục tiêu tốc độ trong quy tắc chưa đạt đầy đủ.",'',
 'Đã giữ lượt trước sửa và các pilot, không trộn thành cùng một lượt. Các lần thay model đồng thời có thay code/prompt, không dùng làm bằng chứng ablation chỉ riêng kiến trúc model. Thử thinking trên 4 fixture không phù hợp về độ trễ/JSON; runtime hiện giữ chế độ nhanh đã kiểm tra.','',
 '## Các ca còn cần sửa','', '| Mã | Câu hỏi | Vấn đề quan sát thực tế |','|---|---|---|']
for row in rows:
 review=reviews[row['case']['id']]
 if review['verdict']=='cần sửa':
  lines.append('| '+' | '.join([row['case']['id'],row['case']['message'].replace('|','/'),review['note'].replace('|','/')])+' |')
lines +=['','Các ca trên gồm từ chối nhầm, thiếu ý, lặp/diễn đạt vụng, dẫn chứng chưa đủ và nhầm phạm vi pha/bộ phận. Còn phải rà chuyên môn 38 tiêu chí và nghĩa các nhãn chưa rõ; không giải quyết bằng cách tắt kiểm tra hay chèn đáp án mẫu. Chưa có ngưỡng cá nhân được kiểm chứng, giáo án bệnh lý hoặc công thức calo.','',
 '## Giao diện video và phạm vi nghiệm thu','',
 'Web phân tích video hiện vẫn là bản local bốn bài. KB/RAG và API nhận hợp đồng sáu bài; kết quả hai bài mới trong bộ test là JSON giả lập. High Knees/Butt Kickers chưa có đủ verification/manifest và kiểm tra video thật để bật gate ở web upstream. Không tạo passed=true để thay bằng chứng. Chưa đẩy GitHub hoặc sửa báo cáo Word trong đợt này.','',
 '## Tệp để xem và chạy lại','',
 '- [Báo cáo toàn bộ câu hỏi, lời đáp, nguồn và nhận xét](KET_QUA_TEST_CHATBOT_6_TU_THE_2026-11-18.html)',
 '- [Bộ 119 câu hỏi dùng thử](BO_KICH_BAN_TEST_CHATBOT_6_TU_THE.md)',
 '- [Độ phủ và rà nội dung 38 tiêu chí KB](DO_PHU_VA_RA_SOAT_KB_6_TU_THE_2026-11-18.md)',
 '- [Ảnh Neo4j tổng thể và sáu nhánh chi tiết](CHUONG_4_BAO_CAO_6_BAI/index.html)',
 '- [Hướng dẫn nguồn, code, cập nhật và rollback](smart-gym-ai/services/kb_rag/docs/KB_RAG_6_TU_THE.md)',
 f'- [Mẫu KB một trang]({rel(artifact/"kb_one_page.html")})',
 f'- [Cypher dựng lại KB]({rel(artifact/"smartgym_six_kb.cypher")})',
 f'- [Code thật gắn với luồng]({rel(artifact/"code_map.md")})',
 f'- [Input/output của 119 lượt]({rel(run/"results.json")})',
 f'- [Đối chiếu Neo4j]({rel(artifact/"neo4j_roundtrip.json")})',
 f'- [Ảnh Neo4j Browser đủ 468 nút/567 cạnh]({rel(artifact/"neo4j_browser/figures/neo4j_toan_bo_468_nut_567_canh.png")})',
 f'- [PNG đồ thị xuất trực tiếp từ Neo4j]({rel(artifact/"neo4j_browser/figures/neo4j_toan_bo_468_nut_567_canh_graph.png")})',
 f'- [Kiểm tra giao diện thật]({rel(artifact/"browser_qa/live_verification.json")})',
 f'- [Trạng thái sau restart](smart-gym-ai/services/kb_rag/artifacts/local_runtime/final_restart_health.json)','',
 f"Cypher SHA256: `{manifest['cypher_sha256']}`. Source zip của từng lượt giữ code đúng runtime và không chứa `.env`.",'',
 'Khởi động lại theo cấu hình đã kích hoạt, tại thư mục service:','',
 '```powershell',r'powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\restart_smartgym_project.ps1','```','',
 'Khôi phục pointer trước đó bằng `python scripts/activate_six_release.py --action rollback`, rồi chạy helper restart. Helper đọc đúng index/model/graph backend trong `.env`; không xóa dữ liệu Neo4j cũ. File quy tắc duy nhất vẫn là [CHUONG_4_KG_RAG_RULES_PLAN.md](CHUONG_4_KG_RAG_RULES_PLAN.md).']
target=WORKSPACE/'CAP_NHAT_KB_RAG_6_TU_THE_2026-11-18.md'
target.write_text('\n'.join(lines),encoding='utf-8');print(target)
