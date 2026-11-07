# KB và RAG kết nối model V4 qua video

**Bản bổ sung 06/11/2026:** chatbot bốn chức năng và Neo4j đã được chạy/kiểm chứng. Xem [hướng dẫn Chương 4 mới](CHUONG_4_CHATBOT_KG_RAG.md). Các giới hạn Neo4j chưa chạy trong bản ghi V4 cũ được thay thế bằng hồ sơ kiểm chứng mới; phạm vi chuyên môn, thang điểm và liên kết nhãn vẫn cần lưu ý.

Bản cập nhật hỗ trợ bốn bài mà không cần camera. Web nhận video, service thị giác chạy YOLOX-M, RTMPose-M và ST-GCN++ V4, rồi gửi kết quả có schema và hash trọng số sang service KB + RAG.

## Dùng thử

1. Mở `http://localhost:8080`; nguồn mặc định là Tệp video.
2. Chọn đúng bài, chọn video, giữ bật Giải thích nhãn sau khi phân tích toàn video.
3. Bấm Phân tích video. Xem bảng nhãn và phần Giải thích từ kho kiến thức phía dưới.
4. Bấm Lưu JSON để xuất cả kết quả model và giải thích có nguồn. Đổi bài/video sẽ xóa giải thích cũ.

Nếu service đã dừng, khởi động riêng ba phần:

```powershell
# PowerShell thứ nhất: KB + RAG
powershell -ExecutionPolicy Bypass -File 'D:\Đồ án\smart-gym-ai\services\kb_rag\scripts\run.ps1'

# Hai cửa sổ khác: server model và giao diện
& 'D:\Đồ án\SmartGym-Model\smart_gym_web_v4\run_server.bat'
& 'D:\Đồ án\SmartGym-Model\smart_gym_web_v4\run_web.bat'
```

Mỗi lệnh server giữ một cửa sổ đang chạy; mở cửa sổ khác cho lệnh tiếp theo. Kiểm tra API tại `http://127.0.0.1:8010/docs` và `http://127.0.0.1:8001/docs`.

## Kiến thức và nhãn

KB hiện có 7 nguồn, 194 đoạn và 23 tiêu chí được đối chiếu anchor. Nguồn gồm ba hướng dẫn ACE ban đầu, ACE Bent Knee Push-up mới, NASM Jumping Jacks mới, ghi chú có dẫn nguồn Queensland và sách OpenStax. Sách vẫn xử lý 84 trang liên quan, tạo 171 đoạn có vị trí trang PDF. NSCA chỉ là mục tùy chọn, chưa có file và không được tính là nguồn đã xử lý.

Danh mục V4 có 83 nhãn gồm 23 lỗi, 47 thuộc tính, 8 trạng thái, 4 nhãn quan sát và 1 nhận xét gốc. Đây không phải 83 lỗi.

| Bài | Nhãn | Nhãn lỗi | Liên kết trực tiếp | Liên kết một phần | Chưa có |
|---|---:|---:|---:|---:|---:|
| Squat | 14 | 3 | 1 | 2 | 0 |
| Chống đẩy | 21 | 11 | 2 | 8 | 1 |
| Jumping Jack | 29 | 6 | 4 | 1 | 1 |
| Reverse crunch | 19 | 3 | 1 | 2 | 0 |

Đây là phân loại liên kết kiến thức do người phát triển thiết lập, chưa được chuyên gia duyệt. Một phần không được tính như giải thích đầy đủ. Hai lỗi chưa có tiêu chí đủ rõ là `child_pose_cheat` và `puppet_dance`. `knees_over_toes` được giữ là nhãn thuộc tính có mô tả gốc mâu thuẫn; các thang ROM/height không được tự chuyển thành góc khớp hoặc mức đạt chuẩn.

Xem đầy đủ tại [bảng độ phủ](../artifacts/v4_coverage.md). Danh mục được tạo từ bốn contract sau khi kiểm tra hash trọng số; KB không cần import PyTorch hoặc chạy model hình ảnh để đọc các metadata này.

## Hai cách trả lời

- `/v1/chat`: hỏi kiến thức chung từ tài liệu, có thể dùng Qwen sinh câu trả lời tự do trong phạm vi bằng chứng. Cần duyệt nội dung, vì model nhỏ từng dịch sai hoặc thêm nhận định ngoài nguồn.
- `/v1/chat/from-model`: nhận đầy đủ bảng nhãn V4. Service đối chiếu schema, tên/loại nhãn, ngưỡng, hash model nếu được cung cấp; tính lại nhãn hoạt động từ điểm thay vì tin trường `detected` do client ghi.

Với nhãn V4, `generation_mode=claim_selection` nghĩa là Qwen chỉ lựa chọn và sắp xếp ID tiêu chí đã truy xuất. Câu hướng dẫn hiển thị lấy từ nội dung tiêu chí KB có nguồn, không phải lời khuyên mới do LLM viết. `generation_used=true` chỉ khi lệnh gọi LLM thật thành công. Nếu LLM lỗi hoặc tắt sinh, service trả tiêu chí có nguồn với `grounded_guidance`, `generation_used=false`. Nếu nhãn chưa có kiến thức, trả `insufficient_evidence`; nếu không đủ quan sát, trả `insufficient_observation`.

Service không đưa nhãn ground truth trong `comparison` hoặc câu feedback sẵn của model vào prompt. Nhãn thuộc tính, trạng thái và mức quan sát không bị tự đổi thành lỗi. Nhãn model vẫn có thể sai; RAG không xác minh lại nội dung video.

## Bằng chứng Chương 4

Luồng đã chạy thật qua HTTP trên bốn video bài tập và một video Fit3D; xem [tổng hợp](../artifacts/v4_live/summary.json). Mỗi file ca thử chứa đường dẫn video, đầu ra model, quan sát đã chuẩn hóa, bằng chứng truy xuất, câu trả lời, KB version và chế độ LLM. Đây là ví dụ kiểm tra luồng, không phải benchmark độc lập về độ chính xác.

- [Squat](../artifacts/v4_live/squat.json)
- [Chống đẩy](../artifacts/v4_live/push_up.json)
- [Jumping Jack](../artifacts/v4_live/jump_jack.json)
- [Reverse crunch](../artifacts/v4_live/situp.json)
- [Video Fit3D test](../artifacts/v4_live/fit3d_test_squat.json)
- [Kiểm tra trình duyệt không dùng camera](../artifacts/v4_browser/verification.json)
- [JSON xuất từ giao diện](../artifacts/v4_browser/exported_in_out.json)
- [Kiểm tra thiếu kiến thức, thiếu quan sát, hash model sai và phát lại đầu ra model đã bỏ sót nhãn](../artifacts/v4_behavior_checks.json). Các trường hợp chỉnh điểm nhãn/quality được đánh dấu giả lập; trường hợp phát lại là đầu ra thật đã lưu, không phải suy luận mới.

Để show IN–OUT: trình bày video đầu vào, bảng nhãn model, các đoạn nguồn được truy xuất và phần giải thích tương ứng. Chỉ ra `server/coach.py`, `kb_service/v4.py`, `Retriever.search`, `Generator.select_claims`, `Engine.answer_v4`. Đồ thị: `Exercise → ModelLabel → TechniqueCriterion → Chunk ← Source`. Graph hiện chạy từ snapshot cục bộ; có mã xuất Neo4j nhưng chưa kiểm chứng máy chủ Neo4j trong lượt này.

## Vai trò Fit3D

Đã kiểm kê `fit3d_train/train`: 1.504 video, 8 người, có joints3d_25 và rep_ann. `fit3d_test/test`: 141 video, 3 người, trong bản được cung cấp chưa có tọa độ 3D/mốc rep. Hai danh sách người không trùng nhau. Xem [kiểm kê](../artifacts/fit3d_inventory.json).

Fit3D phục vụ đầu vào video và kiểm tra hình ảnh/đếm lượt khi có tham chiếu thích hợp; không biến tọa độ số thành tài liệu chuyên môn trong KB. Video Fit3D test đã được dùng để thử đường xử lý, không dùng để khẳng định độ chính xác phát hiện lỗi khi chưa có nhãn lỗi chuẩn. Kiểm kê này không chứng minh lại cách chia tập của model đã huấn luyện trước đây.

## Tài liệu có thể bổ sung

Không cần tải thêm PDF để chạy bản cập nhật. Để giải thích rõ hơn các nhãn riêng của dataset, nên bổ sung file chú thích gốc `fine_grained_labels.json` có mô tả nhãn, nhất là `puppet dance`, `child pose cheat`, thang ROM/height và mâu thuẫn `knees over toes`. Nếu cần kiểm kê lại huấn luyện Chương 3, cần thêm manifest chia tập, label mapping và mã audit V4; hai thư mục Fit3D không thay thế các hồ sơ Qualcomm này.

Nội dung chuyên môn và liên kết một phần vẫn cần nhóm/giảng viên hoặc người có chuyên môn duyệt. Không mặc định việc thêm sách mới sẽ làm toàn bộ nhãn được phủ.

## Cập nhật khi có model mới

Từ thư mục `D:\Đồ án\smart-gym-ai`:

```powershell
.\.tools\python\python.exe -X utf8 services/kb_rag/scripts/import_v4_contracts.py
powershell -ExecutionPolicy Bypass -File services/kb_rag/scripts/prepare.ps1
.\.tools\python\python.exe -X utf8 services/kb_rag/scripts/export_v4_evidence.py
```

Dừng và mở lại service KB sau khi nạp lại dữ liệu. Nếu schema, hash hoặc ý nghĩa nhãn thay đổi, cần rà soát `label_knowledge_map.json`; không âm thầm dùng ánh xạ của model cũ.
