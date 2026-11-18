"""Readable evaluation questions, kept outside the knowledge corpus."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
cases=json.loads((ROOT/'evaluation/six_exercises_20261117/cases.json').read_text(encoding='utf-8'))['cases']
criteria={
 'source_grounded':'Trả đúng điều hỏi, từng ý có đoạn hỗ trợ; không thêm kiến thức thiếu nguồn.',
 'bounded_knowledge':'Chỉ trả phần có căn cứ; nêu giới hạn cụ thể, không đặt số/ngưỡng hay nghĩa nhãn mới.',
 'both_exercises_with_sources':'Có đủ hai phía, dẫn nguồn từng phía; không tự xếp bài nào tốt hơn.',
 'asks_for_observation':'Hướng dẫn phân tích/gắn video; không bịa nhận xét khi chưa có dữ liệu.',
 'short_social_no_retrieval':'Xã giao ngắn, không gọi cả luồng truy xuất hoặc tiếp tục bài cũ.',
 'out_of_scope':'Nêu đúng phạm vi, không bịa tri thức ngoài dịch vụ.'}
groups={}
for c in cases:
 group='SO SÁNH HAI BÀI' if isinstance(c['exercise'],list) else c['exercise']
 groups.setdefault(group,[]).append(c)
lines=['# Bộ kiểm thử chatbot SmartGym — sáu bài','',
 '**119 tình huống phát triển**, không phải tập đánh giá mù/chuyên gia và không bao quát mọi câu hỏi có thể phát sinh. Không đưa file này hoặc đáp án mong muốn vào KB/prompt.','',
 '## Cách thử','',
 '1. Mở http://localhost:8080. Dùng cuộc trò chuyện mới cho mỗi ca độc lập.',
 '2. Ca FOLLOWUP phải hỏi sau ca được ghi ở cột Điều kiện; giữ đúng cuộc trò chuyện đó.',
 '3. Ca *_OBS dùng JSON model giả lập trong runner, không dùng để đánh giá độ chính xác video. Với video thật, phân tích rồi thêm đúng kết quả vào chat trước khi hỏi.',
 '4. Ca SCORE_OBS chỉ dùng quy tắc demo trừ 2 điểm gửi kèm; đó không phải chính sách chấm được kiểm định. Ca SUMMARY/PRACTICE dùng hai quan sát độc lập, không đếm video thành rep.',
 '5. Kiểm tra cả độ đúng từng ý, đúng đoạn nguồn, đủ trọng tâm, tự nhiên, lịch sử và độ trễ. HTTP 200/có citation không tự là đạt.',
 '6. Runner thật: `python scripts/run_six_chat_evaluation.py --url http://127.0.0.1:8010 --chat-url http://127.0.0.1:8001/api/chatbot` tại thư mục service. Script đọc token local nhưng không xuất token trong kết quả.','']
for group,rows in groups.items():
 lines +=[f'## {group} — {len(rows)} ca','', '| Mã | Câu hỏi | Chức năng | Điều kiện | Tiêu chí |','|---|---|---|---|---|']
 for c in rows:
  condition='Sau '+c['depends_on'] if c.get('depends_on') else 'JSON giả lập trong runner' if c.get('fixture') else 'Chưa gắn video' if c['expected']=='asks_for_observation' else 'Độc lập'
  lines.append('| '+' | '.join([c['id'],c['message'].replace('|','/'),c['task'],condition,criteria.get(c['expected'],'Đối chiếu dữ liệu và nguồn thật, giữ giới hạn năng lực.')])+' |')
 lines.append('')
path=ROOT.parents[2]/'BO_KICH_BAN_TEST_CHATBOT_6_TU_THE.md'
path.write_text('\n'.join(lines),encoding='utf-8')
print(path)
