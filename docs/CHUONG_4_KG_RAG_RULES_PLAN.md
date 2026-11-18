# Quy tắc KB/KG/RAG cho bản bàn giao SmartGym

Bản hướng dẫn áp dụng cho repository tích hợp, trích các quy tắc hiện hành1.4 của workspace ngày18/11/2026. Đây là nguồn quy tắc KB/RAG duy nhất trong bản bàn giao; hướng dẫn cài đặt và báo cáo là tài liệu tham khảo. Yêu cầu hiện tại của người dùng và chỉ dẫn cấp cao hơn được ưu tiên.

Phạm vi: FE/BFF/backend và KB/RAG, không đẩy model tư thế. Giữ code `kb_service` của R3, thêm wrapper triển khai ở `infra/rag` thay vì âm thầm sửa hành vi phương pháp. KB R3 và các giới hạn119 câu được ghi trong KNOWN_LIMITATIONS.md. Không tự chạy nhiều vòng119 câu hoặc sinh LLM để đóng gói code.

## 4. Quy tắc về tri thức và câu trả lời

### R1 — Không xây chatbot hỏi đáp bằng bảng đáp án mẫu

- Không tạo danh sách câu hỏi–đáp án để thay cho RAG; không viết nhánh khớp từng câu hỏi để trả một đoạn kiến thức làm sẵn.
- Câu hỏi mới phải được hiểu theo ngữ nghĩa và ngữ cảnh, truy xuất bằng chứng phù hợp, rồi LLM tổng hợp lời giải thích.
- Các tiêu chí có nguồn, từ điển tên bài, quy tắc số học, phân loại nhu cầu và thông báo trạng thái là dữ liệu/logic hệ thống, không phải đáp án mẫu cho câu hỏi kiến thức.
- Bộ câu hỏi đánh giá chỉ dùng kiểm thử. Không đưa đáp án kỳ vọng vào prompt, KB hay code để làm đẹp kết quả.

### R2 — Phân biệt tri thức, quan sát và kết luận

- KB lưu nội dung có nguồn; KG biểu diễn thực thể và các liên kết có ý nghĩa đã định nghĩa.
- Kết quả DL là dự đoán về video, không phải tri thức khoa học mới hoặc xác nhận nguyên nhân lỗi.
- RAG không thay thế model nhìn ảnh, không tự sửa nhãn nhận diện sai và không được nói đã xem từng khung hình nếu chỉ nhận bảng nhãn.
- Mỗi nhận xét phải đúng phạm vi video/window/rep, đúng bài, biến thể và chất lượng quan sát.
- Không coi thuộc tính, góc nhãn dữ liệu, trạng thái hoặc khả năng quan sát là lỗi nếu hợp đồng model không định nghĩa như vậy.
- Thiếu nhãn lỗi không chứng minh toàn bộ động tác đúng. Điểm nhãn không mặc nhiên là xác suất kết luận đúng hoặc điểm kỹ thuật.

### R3 — Nội dung có nguồn và đúng ý

- Citation phải tồn tại, được truy xuất trong lượt đó, và hỗ trợ chính ý được dẫn. Kiểm tra tồn tại ID hoặc chép đúng quote chưa đủ để xác nhận diễn giải đúng.
- Tách các ý ghép cần nhiều bằng chứng; không gán cả câu nhiều vế cho một đoạn chỉ hỗ trợ một vế.
- Giữ đúng pha động tác và biến thể. Không trộn vị trí bắt đầu, pha nâng và pha hạ; không nhầm chuyển động gối với nâng/cuộn chậu.
- Không tự thêm góc, tải, số hiệp/lần, lượng calo, liều bổ sung, nguyên nhân yếu cơ hoặc kết luận bệnh lý ngoài căn cứ.
- Trả lời đúng câu hiện tại, ngắn và dễ hiểu; không bổ sung các bước không được hỏi chỉ để làm câu trả lời dài hơn.
- LLM tự kiểm tra chỉ là một bước hỗ trợ. Không dùng trạng thái `supported=true` làm bằng chứng chuyên gia đã xác nhận.

### R4 — Thiếu ngữ cảnh khác với thiếu tri thức

- Không rõ “buổi này/video này/bài đó”: dùng bối cảnh hiện có hoặc hỏi thêm, không đoán tùy ý một bài.
- Đã có tên bài hoặc quan sát: phải sử dụng, không hỏi lại như chưa được cung cấp.
- Câu hỏi kỹ thuật chung không bắt buộc phải có video.
- Thiếu nguồn/quan hệ KB: nói rõ phần chưa có; có thể trả phần đã có căn cứ, nhưng không lấy hướng dẫn gần nghĩa để giả vờ đã trả lời.
- `capabilities.json` phải phản ánh kiểm kê KB và được xem lại khi KB đổi; không dùng nó như danh sách chặn câu hỏi viết tùy tiện.

## 5. Quy tắc hội thoại và trải nghiệm

### R5 — Có xử lý xã giao và kết thúc hội thoại

- Nhận biết chào hỏi, cảm ơn, xác nhận, từ chối và tạm biệt theo nghĩa câu.
- “Cảm ơn bạn” thuần túy cần được đáp lại ngắn gọn, không tự tiếp tục giảng bài, không hỏi lại câu kỹ thuật và không gọi pipeline truy xuất nặng.
- Câu có cả cảm ơn và yêu cầu mới phải xử lý yêu cầu mới; không nuốt câu hỏi chỉ vì có từ “cảm ơn”.
- Câu hiện tại quyết định ý định. Lịch sử giúp hiểu đại từ và tham chiếu, không ép mọi câu về chủ đề trước.
- Hỗ trợ không dấu, cách nói khác nhau, rút gọn và câu nối tiếp; không chỉ kiểm thử vài chuỗi khớp nguyên văn.

### R6 — Nhận xét video phải bám đúng dữ liệu đang chọn

Luồng chuẩn: tải video → phân tích DL → gắn kết quả vào video/buổi đang chọn → hỏi chatbot → kết hợp quan sát với KB/KG.

- Giao diện phải cho biết video nào đã phân tích và video nào đang làm ngữ cảnh chat. Không để người dùng tưởng chọn file đồng nghĩa chatbot đã phân tích.
- Nếu hiện còn bước **Thêm kết quả video hiện tại**, phải hướng dẫn rõ; kế hoạch có thể tự gắn sau phân tích nhưng phải thể hiện video đang được gắn.
- Nhiều video phải có định danh/hash và cơ chế chọn hoặc làm rõ video được hỏi. Video mới không được âm thầm gắn nhãn của video cũ.
- Không đếm upload lại cùng video thành nhiều lần mắc lỗi độc lập.
- Khi quan sát thiếu/không nhìn thấy đủ khớp, báo điều cần làm để phân tích lại; không bịa nhận xét.
- Khi hỏi “tập như vậy có ổn không”, trả phần quan sát và tiêu chí liên quan, đồng thời nêu giới hạn cụ thể; không đưa lời xác nhận an toàn tuyệt đối.
- Nhận xét tiếng Việt có thể do LLM diễn đạt, nhưng nhãn, số đếm, khoản trừ và phiên bản phải lấy từ dữ liệu đã kiểm tra.

### R7 — Nguồn dễ đọc; thông tin kỹ thuật có chỗ riêng

- Các chuỗi như `[ace_reverse_crunch_f5e40f92abac94fd]` là ID chunk nội bộ, không hiển thị nguyên dạng trong lời chat thông thường.
- Giao diện đích dùng số tham chiếu gọn như `[1]`, liên kết tới **Nguồn tham khảo** có tên tài liệu, đơn vị xuất bản, URL, mục/trang PDF và đoạn hỗ trợ khi mở xem.
- Giữ ánh xạ số tham chiếu ↔ chunk ID trong response/JSON/trace/Neo4j để giảng viên và nhóm kiểm tra. Không chỉ xóa nguồn để câu trả lời đẹp hơn.
- Thông tin như “kiểm tra ngữ nghĩa bằng LLM...” thuộc phần giải thích phương pháp/debug/báo cáo, không lặp lại dưới mọi câu chat.
- Thông báo có tác động thực tế như chưa có quan sát, chất lượng video kém, chưa có quy tắc điểm, KB chưa đủ hoặc nguồn đang lỗi phải diễn đạt rõ và hiện đúng lúc.
- Có chế độ/khối kỹ thuật riêng để xem trace, ID, thời gian, giới hạn, model/KB version; giao diện người tập chỉ hiện nội dung giúp họ hiểu hoặc quyết định việc tiếp theo.

### R8 — Tốc độ phải đo được và tối ưu có căn cứ

- Đo riêng thời gian nhận dạng ý định, rewrite, embedding/truy xuất/KG, sinh câu trả lời, kiểm tra, sửa bản nháp và toàn bộ request.
- Ghi model, thiết bị, provider thực tế, độ dài ngữ cảnh, số lần gọi LLM và số lần thử lại. Tách lượt nguội/nóng, inference video và thời gian chat.
- Xã giao không chạy đầy đủ RAG. Tái sử dụng kết quả video đã tính; không chạy lại DL khi chỉ hỏi tiếp về cùng video.
- Cân nhắc rút ngữ cảnh, cache có khóa đúng phiên bản/ngữ cảnh, giảm gọi LLM trùng lặp, giữ model sẵn sàng và kiểm tra theo mức rủi ro.
- Không bỏ kiểm chứng một cách âm thầm để giảm thời gian; ghi rõ thay đổi và ảnh hưởng chất lượng.
- Không stream lời khuyên chưa kiểm tra rồi coi đó là câu trả lời đã xác minh. Có thể hiển thị tiến độ thực hoặc stream nội dung theo thiết kế đã kiểm chứng.

Mục tiêu kỹ thuật ban đầu **để đo và tối ưu, chưa phải kết quả đã đạt** trên máy RAM 32 GB, RTX 4060 8 GB:

| Hạng mục | Mục tiêu đề xuất |
|---|---|
| Phản hồi giao diện khi bấm gửi | Trong khoảng 1 giây |
| Lượt xã giao khi dịch vụ đã sẵn sàng | P95 không quá 2 giây; không gọi truy xuất/kiểm tra kỹ thuật đầy đủ |
| Chat có nguồn khi model đã nóng | P50 không quá 15 giây, P95 không quá 30 giây |
| Lượt tải model/nguội | Báo riêng, không gộp để tô đẹp số liệu lượt nóng |

Nếu chưa đạt, công bố số đo thực và nguyên nhân; điều chỉnh mục tiêu có lý do trong nhật ký, không đổi âm thầm để đánh dấu đạt.

## 6. Kiến trúc và hợp đồng dữ liệu

```text
Web/app → API điều phối
Video → dịch vụ DL → quan sát có schema/model/hash/chất lượng/phạm vi
API điều phối → dịch vụ KB/KG/RAG → truy xuất văn bản/vector + Neo4j
                                 → LLM diễn đạt + kiểm tra → response có nguồn
Web/app ← lời trả lời dễ đọc + nguồn; trace kỹ thuật nằm trong dữ liệu riêng
```

- Giữ ranh giới microservice. Dịch vụ KB/RAG không cần import model vision hoặc thư viện huấn luyện để trả lời kiến thức.
- Mã bài nội bộ phải ánh xạ thống nhất; `situp` của pipeline này là **reverse crunch**, không tự đổi sang sit-up truyền thống. Hai mã model mới `high_knees` và `butt_kickers` cần hợp đồng RAG tương ứng trước khi được tiếp nhận ở runtime sáu bài.
- Hợp đồng quan sát cần kiểm tra đầy đủ bảng nhãn, loại nhãn, ngưỡng, schema, hash/phiên bản, chất lượng và phạm vi; hash khai báo không tự chứng minh nguồn dữ liệu được ký xác thực.
- Tách request/response, dữ liệu buổi tập, nguồn khoa học và nhật ký điểm. Hội thoại sinh ra không tự được đưa trở lại thành tri thức đúng của KB.
- Neo4j là nơi lưu/truy vấn đồ thị, không phải LLM. Báo rõ đang dùng Neo4j hay fallback snapshot cùng phiên bản.
- Gắn version KB/index/model/chính sách với cache và bộ minh chứng. Không đưa mật khẩu/token vào báo cáo hoặc log công khai.

## 7. Nguồn dữ liệu và độ phủ

Phân biệt ba lớp đánh giá:

1. **Phủ nội dung:** có nguồn/tiêu chí cho chủ đề, bài, lỗi, biến thể và điều kiện áp dụng không?
2. **Phủ truy xuất:** câu hỏi diễn đạt khác, không dấu, nối tiếp hoặc đổi chủ đề có lấy đúng đoạn hỗ trợ không?
3. **Chất lượng trả lời:** từng ý có được bằng chứng chứng minh, đúng ngữ cảnh, đủ hữu ích và diễn đạt tự nhiên không?

- Không lấy số chunk, tỷ lệ tìm được tên nguồn, số unit test hoặc tự chấm của LLM để tuyên bố “phủ đủ/đúng 100%”.
- `direct`, `partial`, `none` phải có định nghĩa và căn cứ. Không cộng `partial` thành phủ đầy đủ.
- So sánh các kênh truy xuất khi có lý do và dữ liệu; nguồn đúng chưa chắc đoạn đúng. Báo cả lỗi truy xuất, thiếu dữ liệu, lỗi suy diễn và lỗi giao diện.
- Cần tập câu hỏi mới và kiểm tra nhiều lượt; giữ nguyên những ca thất bại, không chỉ xuất ví dụ đẹp. Tách bộ phát triển và bộ đánh giá để hạn chế tối ưu theo câu kiểm thử.
- Khi cần mở rộng KB, ưu tiên nguồn giải quyết khoảng trống thực tế; giữ provenance và kiểm tra nội dung trước khi công bố.
- Dataset ảnh/video dùng huấn luyện/đánh giá DL không mặc nhiên là nguồn hướng dẫn kỹ thuật có thẩm quyền. Không cần train lại model hình ảnh để bổ sung tài liệu KB.


## Mục tiêu và kế hoạch sau bàn giao

1. Giữ môi trường có thể dựng lại bằng setup, manifest, snapshot/vector và Cypher đồng version.
2. Các thay đổi truy xuất/diễn giải phải kiểm bằng chứng từng ý, ghi cả lỗi và số đo thật; không đưa đáp án test vào corpus.
3. Nâng cấp model video phải theo provider/contract riêng, không đổi hash/schema để bỏ kiểm tra. Model sáu bài chưa được nghiệm thu trong bản web này.
4. Khi cập nhật KB, tạo release mới, rà nguồn, đồng bộ vector/graph, kiểm thử rồi kích hoạt; giữ lịch sử và kiểm rollback riêng.
5. Trạng thái hiện tại không phải hoàn thành toàn bộ chuyên môn/tải/consumer CMS→KB. Sau thay đổi KB/RAG, ghi bằng chứng và giới hạn vào hồ sơ review của thay đổi.

## Nhật ký đóng gói ngày18/11/2026

- Bàn giao riêng nhánh `SmartGym_Integrated`; không đưa code/trọng số model tư thế từ máy thành viên, raw PDF, dataset, dữ liệu người dùng hoặc bí mật lên Git. Giữ API/adapter để nối provider riêng.
- Giữ nguyên byte module R3/runtime `6ce23ba72145c329`; thêm wrapper triển khai bên ngoài package. Setup sinh cấu hình mới, dùng KB/vector/Cypher đồng version và Neo4j riêng.
- Kiểm tra thực thi:132 unit RAG,17 BFF fixture đạt; build hai image; setup bản Git sạch; restore graph468/567 hai lần, khớp toàn bộ thuộc tính và bộ ba cạnh; mTLS health/inventory/xã giao đạt. Chi tiết tại `handoff-verification.json`.
- Không chạy lại119 câu hoặc model GPU. Kết quả83/10/26 là đánh giá phát triển đã lưu;26 ca vẫn cần sửa. Chưa nghiệm thu toàn stack trên máy khác hoặc đường video sáu bài.
