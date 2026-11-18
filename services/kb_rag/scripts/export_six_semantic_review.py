"""Publish explicit development judgments, separate from immutable KB data."""
from pathlib import Path
from collections import Counter
import json,hashlib

ROOT=Path(__file__).resolve().parents[1];WORKSPACE=ROOT.parents[2]
path=ROOT/'data/releases/six_exercises_20261118_r3/snapshot.json'
snapshot=json.loads(path.read_text(encoding='utf-8'))
# These notes were authored after reading each claim and its original excerpt.
# A source-span match is NOT an expert endorsement of the source or technique.
notes={
 'squat_bracing':('instruction','Siết cơ lõi để ổn định cột sống khớp Step 2; không suy ra cơ người dùng yếu.'),
 'squat_knee_tracking':('instruction','Giữ gối theo ngón thứ hai khớp Step 4; chỉ áp trong hướng dẫn/biến thể này.'),
 'squat_range':('mixed_scope','Mốc gót/thân có trong nguồn. Phần không suy ra góc chung là giới hạn ứng dụng, không phải một ngưỡng do ACE công bố.'),
 'pushup_hip_control':('instruction','Hai đoạn Step 3/4 đều nêu không võng lưng hay nhô hông; phạm vi hai pha có chứng cứ riêng.'),
 'pushup_hands':('instruction','Rộng bằng vai, điều chỉnh duỗi thân và đầu thẳng cột sống có trong Step 2; giữ thứ tự chuẩn bị.'),
 'crunch_pelvis':('instruction','Step 2 mô tả nâng hông khỏi thảm, cuộn cột sống và hông/chậu về lồng ngực; không đổi thành xoay trục.'),
 'crunch_control':('instruction','Step 3 hạ cột sống có kiểm soát, đùi/gối trở về trên hông. Không biến câu này thành phép đo video.'),
 'jack_coordination':('legacy','Bản ghi chú hiện có chứa mở chân/nâng tay/trở về, nhưng không phải HTML gốc Queensland. Cần thu lại nguồn gốc hoặc chuyển tiêu chí sang nguồn gốc tương đương đã rà.'),
 'jack_landing':('legacy','Cụm soft knees có trong ghi chú trích ngắn; chưa xác minh lại toàn văn Queensland. NASM có cảnh báo gối thẳng nhưng đó là nguồn khác, cần cập nhật provenance có version nếu đổi.'),
 'squat_start_feet':('instruction','Hơi rộng hơn hông và mũi chân xoay nhẹ ra ngoài có trong Step 1; không đổi thành rộng bằng vai.'),
 'squat_back_flat':('instruction','Maintain tension/attempt to keep back flat khớp pha hạ; giữ tính hướng dẫn và từ attempt.'),
 'squat_rise_together':('instruction','Step 6 nêu hông/thân nâng cùng, gót trên sàn và gối theo ngón thứ hai; không thêm hông lên trước ngực.'),
 'pushup_alignment':('instruction','Step 2 nêu không gập hông/gối, siết thân và đầu thẳng cột sống; đây là chuẩn bị chống đẩy chuẩn.'),
 'pushup_depth_control':('mixed_scope','ACE có mốc ngực hoặc cằm chạm thảm/sàn. Giới hạn quá sâu/góc cá nhân là giới hạn của ứng dụng; không dùng mốc này để xác nhận too_deep hoặc bảo người đang bị gắn quá sâu hạ thêm.'),
 'pushup_extension':('instruction','Step 4 tiếp tục đẩy tới khi khuỷu duỗi hết, giữ thân; không dịch press thành nhấn mạnh.'),
 'pushup_knee_variant':('mixed_scope','Duỗi thân từ gối và không gập hông có trong nguồn riêng bent-knee. Xác nhận biến thể trước khi diễn giải nhãn là quy tắc tích hợp, không chẩn đoán từ tài liệu.'),
 'crunch_start':('mixed_scope','90 độ và gối trên hông thuộc Step 1. Phần không xác nhận góc 3D là giới hạn quan sát; không mở rộng tư thế chuẩn bị thành toàn bộ quá trình tập.'),
 'crunch_knee_stability':('instruction','Avoid any change in angle of knees đúng phạm vi roll-up; không tự đặt dung sai góc.'),
 'jack_start':('instruction','NASM Step 1: feet together/arms at sides; không thay bằng tư thế đang mở.'),
 'jack_sync':('instruction','NASM Step 3 nêu đồng thời mở chân/nâng tay. Land ở pha này không có nghĩa trở về tư thế khởi đầu.'),
 'jack_return':('instruction','NASM Step 4 nêu khép chân và hạ tay khi tiếp đất; tách khỏi pha mở.'),
 'jack_upright':('instruction','Upright posture/body awareness throughout exercise có trong Step 2; giữ thuật ngữ tư thế tự nhiên.'),
 'jack_step_variant':('mixed_scope','Step-out thay nhảy là lựa chọn cho beginner trong FAQ; phải tách việc có biến thể với việc model đang chấm biến thể nào.'),
 'jack_speed_control':('mixed_scope','Không đánh đổi form để lấy tốc độ/số lần có trong Common Mistakes. Chưa có cadence chung trong phần đã thu thập không chứng minh không tồn tại khuyến nghị ở mọi tài liệu.'),
 'jack_interval_context':('mixed_scope','30–60 seconds là work interval rồi brief rest. Phân biệt giây/lượt với lần/phút là ngữ nghĩa đơn vị, không suy ra liều tập cá nhân.'),
 'highknees_forward':('refine_wording','Nguồn liệt kê toes, knees, hips, shoulders, nose hướng trước. Bản Việt khái quát từ bàn chân tới đầu; nên ghi đúng từng bộ phận, toes là ngón chân và nose là mũi, tránh biến thành mọi khớp phải duỗi thẳng.'),
 'highknees_alternate':('mixed_scope','Luân phiên nâng leg về phía ngực rồi hạ có trong Ohio. Không thu hẹp leg thành đùi hoặc bắt buộc chạm ngực; điều kiện biến thể là giới hạn tích hợp.'),
 'highknees_arms':('mixed_scope','Nguồn nói tay có thể mimic chuyển động đi/chạy. Không có quy tắc mọi trường hợp tay hạ đều sai; đây là thiếu căn cứ cho kết luận phổ quát, không phải nguồn cho phép mọi kiểu tay.'),
 'highknees_variants':('mixed_scope','Walking/running pace là các biến thể được nêu. Nó không xác lập một cadence hay chứng minh mọi video bước chân đều đúng.'),
 'buttkickers_forward':('instruction','Danh sách bộ phận hướng trước và hands by sides khớp câu chuẩn bị Ohio; tách tùy chọn tay ở pha vận động.'),
 'buttkickers_heel_back':('mixed_scope','Bending knee, heel towards butt, back to ground có trong Ohio. towards không bắt buộc chạm; giới hạn góc cá nhân thuộc ứng dụng.'),
 'buttkickers_arms':('mixed_scope','Ohio cho arms stay by side hoặc mimic đi/chạy. Không coi tay hạ là lỗi tự động; vẫn cần đúng biến thể/dữ liệu quan sát.'),
 'buttkickers_variants':('mixed_scope','Có walking/running pace. Phần không tự kết luận sai là giới hạn suy luận, không phải chứng nhận video đúng.'),
 'squat_teaching_progression':('instruction','NSCA nêu sample progressions không comprehensive/universally applicable và ví dụ người đã thạo có thể bỏ box/free squat; không áp cả chuỗi cho mọi người.'),
 'pushup_elevated_variant':('instruction','Figure 3 có elevated surface, palms under shoulders và plank-like form; không nhầm nâng tay với chống đẩy gối.'),
 'squat_target_regions':('mixed_scope','Metadata ACE liệt kê Abs/Butt-Hips/Calves-Shins/Thighs. Không phải phép đo EMG hoặc chứng minh cơ yếu; phần giới hạn là ngữ nghĩa loại dữ liệu.'),
 'pushup_target_regions':('mixed_scope','Metadata ACE Arms/Chest/Shoulders; không dùng danh mục vùng cơ thể như kết quả hoạt hóa cơ ở người dùng.'),
 'squat_progression_example':('instruction','Figure 1 có touch-and-go box/free/goblet squat. Giới hạn không áp cho tất cả cần dẫn thêm đoạn sample progressions của cùng NSCA khi công bố lời đáp.'),
}
assert set(notes)=={c['id'] for c in snapshot['claims']}
chunks={c['chunk_id']:c for c in snapshot['chunks']};rows=[]
for claim in snapshot['claims']:
    category,note=notes[claim['id']]
    rows.append({'claim_id':claim['id'],'exercise_code':claim['exercise_code'],
                 'category':category,'development_note':note,'claim_text_vi':claim['text_vi'],
                 'source_id':claim['source_id'],'anchor':claim['anchor'],
                 'source_excerpts':[chunks[cid] for cid in claim['chunk_ids']],
                 'expert_approved':False})
out=ROOT/'artifacts/six_exercises_20261117/releases'/snapshot['version']
record={'kb_version':snapshot['version'],'snapshot_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
        'reviewer':'Codex development review of all 38 claim/excerpt pairs; not domain expert approval',
        'method':'Read every claim and surrounding original excerpt. Categorize source instruction, combined application limits, legacy provenance, and wording needing refinement. No binary clinical accuracy score.',
        'counts':dict(Counter(r['category'] for r in rows)),'rows':rows,'snapshot_modified':False}
(out/'kb_semantic_development_review.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
names={'instruction':'Hướng dẫn khớp đoạn nguồn','mixed_scope':'Hướng dẫn + giới hạn ứng dụng','legacy':'Nguồn ghi chú cũ cần thu lại','refine_wording':'Cần trau chuốt diễn giải'}
lines=['# Rà độ phủ và nội dung KB SmartGym sáu bài','',
       f"Bản `{snapshot['version']}` · 38 cặp tiêu chí/đoạn được đọc · người rà: Codex trong quá trình phát triển. **Không phải đánh giá chuyên gia, không có điểm accuracy chuyên môn hoặc tuyên bố đúng 100%.**",'',
       '## Phân biệt các lớp đánh giá','',
       '- Hash/anchor/đồ thị/vector: kiểm tra dữ liệu và cấu trúc, không chứng minh toàn bộ diễn giải đúng.',
       '- Bản rà này: đối chiếu 38 tiêu chí với đoạn gốc, giữ riêng hướng dẫn và giới hạn do hệ thống đặt ra. Không thay đổi release đang kiểm thử.',
       '- Truy xuất: tập phát triển 30 câu gán nhãn đoạn, tách khỏi chấm lời đáp; sáu câu khởi động cùng một đoạn HHS.',
       '- Câu trả lời: bộ 119 tình huống thực thi với Ollama, cần đọc cả diễn giải/quote/độ đầy đủ, không lấy HTTP 200 làm đạt. Xem báo cáo hội thoại riêng.','',
       '## Phân bố tri thức','', '| Bài | Tiêu chí | Đoạn có gắn bài | Nhãn lỗi direct / partial / none |','|---|---:|---:|---|']
for code,spec in snapshot['label_catalog']['exercises'].items():
    count=Counter(l.get('coverage','unmapped') for l in spec['labels'] if l['kind']=='error')
    lines.append(f"| {code} | {sum(c['exercise_code']==code for c in snapshot['claims'])} | {sum(code in c.get('exercise_codes',[]) for c in snapshot['chunks'])} | {count['direct']} / {count['partial']} / {count['none']} |")
lines+=['','Một đoạn có thể gắn nhiều bài; các cột này không cộng thành số đoạn duy nhất. Đoạn nguyên tắc chung/sách chưa gắn riêng bài vẫn có thể được truy xuất. Direct là mức ánh xạ tiêu chí, không phải xác suất model dự đoán đúng.','',
        '## Kết quả rà phát triển','', '| Nhóm | Số tiêu chí |','|---|---:|']
for category,n in record['counts'].items():lines.append(f'| {names[category]} | {n} |')
lines+=['','| Tiêu chí | Nhóm | Nhận xét cụ thể |','|---|---|---|']
for row in rows:lines.append(f"| `{row['claim_id']}` | {names[row['category']]} | {row['development_note']} |")
lines+=['','## Khoảng trống và cách xử lý','',
        '1. Hai tiêu chí Queensland còn dựa ghi chú phát triển; cần thu lại bản gốc hoặc chuyển sang nguồn gốc tương đương đã kiểm tra trong một release mới. Không đổi citation âm thầm.',
        '2. Cần chỉnh diễn giải highknees_forward sát danh sách bộ phận; giữ hướng về trước khác duỗi khớp. Chưa sửa snapshot đang chạy để bảo toàn đối chiếu kết quả.',
        '3. Các tiêu chí trộn hướng dẫn và giới hạn tích hợp cần tách vai trò khi trình bày Chương 4: phần nguồn trích, phần quy ước quan sát/loại nhãn, phần chưa biết. Không gán một nguồn khoa học cho giới hạn nội bộ không nằm trong nguồn.',
        '4. Bản trích NASM hiện có 9 mục; phát biểu vận động toàn thân có trong ghi chú Queensland, chưa có trích đoạn NASM gốc tương ứng trong index. Không gán câu đó cho một quote NASM chỉ nói phối hợp tay/chân.',
        '5. Chưa có ngưỡng cá nhân, chẩn đoán cơ yếu, giáo án điều trị hay công thức calo cho từng người. Thiếu bằng chứng cần được công bố đúng; không tạo số để tăng độ phủ.',
        '6. Hai bài mới hiện có hướng dẫn Ohio và ánh xạ lỗi partial; cần minh chứng video/model độc lập để kiểm chứng nhãn, không dùng KB để chứng nhận dự đoán.',
        '7. KG hiện biểu diễn Exercise, TechniqueCriterion, ModelLabel, Source và Chunk. Sách giải phẫu chủ yếu nối Source–Chunk; chưa phải ontology đầy đủ các cơ/khớp và quan hệ cơ sinh học.',
        '8. Chưa có phát hiện/phân xử mâu thuẫn đa nguồn tự động hoặc hệ suy luận fuzzy. Đã giữ khác biệt pha/biến thể và giới hạn định tính, cần chuyên gia rà các bất đồng thật.','',
        '## Kiểm tra trực quan PDF nguồn','',
        'Đã dùng Poppler dựng và xem bốn trang gốc: HHS trang file 62/91 (số in 62/91), NSCA trang file 1/4 (số in 6/9). Vị trí mẫu khớp locator trong snapshot; không có việc sửa PDF hoặc nhận đã xem toàn bộ ba sách. Các ảnh chỉ là mẫu kiểm tra, chưa phải ảnh minh họa đưa vào bản in.',
        'Tại HHS trang file 62, muscle-strengthening bị ngắt qua dòng; trang 91 hiển thị adverse nguyên vẹn nhưng pypdf chế độ thường trích thành adver + xuống dòng + se. Đối chiếu read-only chế độ layout trên trang 91 cho lại adverse nguyên vẹn. Đây là lỗi trích xuất, không phải lỗi chữ của tài liệu. Runtime chỉ khôi phục whitespace sau dấu gạch nối về đúng span nguồn; chưa áp dụng bộ trích xuất layout cho cả release. Muốn đổi phải build bản mới, kiểm tra các cột/bảng/locator/vector/KG và đánh giá lại.',
        '- [Danh sách trang, hash gốc và ảnh mẫu](smart-gym-ai/services/kb_rag/artifacts/six_exercises_20261117/releases/kb_ddae6f149e7b9f57/pdf_source_visual_samples.json)',
        '- [Đối chiếu trích xuất thường/layout, chưa áp vào KB](smart-gym-ai/services/kb_rag/artifacts/six_exercises_20261117/releases/kb_ddae6f149e7b9f57/pdf_extraction_comparison.json)','',
        '## Minh chứng để mở','',
        '- [Bản rà đầy đủ và nguyên văn đoạn nguồn](smart-gym-ai/services/kb_rag/artifacts/six_exercises_20261117/releases/kb_ddae6f149e7b9f57/kb_semantic_development_review.json)',
        '- [Báo cáo hội thoại](KET_QUA_TEST_CHATBOT_6_TU_THE_2026-11-18.html)',
        '- [Mẫu KB một trang](smart-gym-ai/services/kb_rag/artifacts/six_exercises_20261117/releases/kb_ddae6f149e7b9f57/kb_one_page.html)',
        '- [Ảnh Neo4j Browser thật 468/567](smart-gym-ai/services/kb_rag/artifacts/six_exercises_20261117/releases/kb_ddae6f149e7b9f57/neo4j_browser/figures/neo4j_toan_bo_468_nut_567_canh.png)',
        '- [Quy tắc/tiến độ Chương 4](CHUONG_4_KG_RAG_RULES_PLAN.md)']
target=WORKSPACE/'DO_PHU_VA_RA_SOAT_KB_6_TU_THE_2026-11-18.md'
target.write_text('\n'.join(lines),encoding='utf-8');print(json.dumps({'report':str(target),'counts':record['counts'],'expert_approved':False},ensure_ascii=False))
