# SmartGym — Quy tắc, mục tiêu và kế hoạch Chương 4: KB + KG + RAG + Chatbot

Phiên bản quy tắc: **1.0**  
Cập nhật: **07/11/2026**  
Trạng thái: **Đã thiết lập quy tắc; chatbot đang hoàn thiện, chưa nghiệm thu đầy đủ.**

## 1. Hiệu lực và cách sử dụng file này

Đây là **file chuẩn duy nhất về quy tắc và kế hoạch công việc Chương 4** trong workspace SmartGym. Áp dụng cho nội dung chương, thu thập KB, biểu diễn KG, RAG, chatbot, giao diện chat, kết nối kết quả DL, kiểm thử và bộ minh chứng.

Mỗi lần bắt đầu công việc liên quan Chương 4, trợ lý phải:

1. Đọc file này từ ổ đĩa trước khi lập kế hoạch hoặc sửa code. Không chỉ dựa vào trí nhớ hội thoại.
2. Đối chiếu yêu cầu mới nhất của người dùng với các mục tiêu và phần việc còn mở.
3. Kiểm tra code/dữ liệu/bằng chứng thực tế cần thiết; ghi rõ điều đã xác minh và điều chưa biết.
4. Thực hiện phạm vi đã được giao. Ghi kết quả và phần còn thiếu vào mục theo dõi ở cuối file.
5. Chỉ đánh dấu hoàn thành khi có bằng chứng đáp ứng tiêu chí tương ứng. Không coi việc viết kế hoạch là đã sửa xong tính năng.

Các README, báo cáo, kết quả thử nghiệm và hướng dẫn trước đây là **tài liệu tham khảo hoặc hồ sơ lịch sử**, không phải bộ quy tắc cạnh tranh với file này. Nếu mâu thuẫn, áp dụng file này cho công việc Chương 4 và cập nhật liên kết/tài liệu liên quan. Không tự xóa bằng chứng cũ.

Chỉ dẫn hệ thống và yêu cầu mới nhất của người dùng vẫn có hiệu lực. File này không thay thế các chỉ dẫn đó. Khi người dùng đổi yêu cầu, cập nhật file để tránh duy trì quy tắc cũ trái ý người dùng. Không tự mở rộng quy tắc này sang các chương/phần việc không liên quan.

## 2. Mục tiêu sản phẩm

Xây dựng chatbot SmartGym bằng KB + KG + RAG, trò chuyện tiếng Việt tự nhiên, sử dụng tri thức có nguồn và quan sát video thực tế, hỗ trợ bốn bài: **squat, chống đẩy, jumping jack, reverse crunch**. Người dùng không có camera vẫn sử dụng được bằng video tải lên.

Chatbot cần hỗ trợ bốn nhóm chức năng:

| Chức năng | Kết quả cần đạt | Điều kiện không được bỏ qua |
|---|---|---|
| Hỏi đáp tri thức thể hình | Hiểu câu hỏi mới, diễn đạt khác nhau, câu nối tiếp và đổi chủ đề; trả lời có căn cứ | KB có giới hạn; hỏi thêm hoặc chỉ trả phần có bằng chứng khi cần |
| Giải thích lý do bị trừ điểm | Nối quan sát → tiêu chí bị vi phạm → khoản trừ trong nhật ký → giải thích dễ hiểu | Cần quy tắc chấm và phiên bản chính sách; điểm dự đoán model không phải số điểm trừ |
| Tóm tắt và đánh giá buổi tập | Dựa trên đúng video/lượt/buổi được chọn, nêu điểm đáng chú ý và phần chưa quan sát đủ | Không biến một video thành một rep hoặc bịa tổng thời gian, tiến bộ, mức đúng kỹ thuật |
| Gợi ý luyện sửa lỗi lặp lại | Ưu tiên lỗi có quan sát đủ và gợi ý có nguồn, giữ điều kiện áp dụng | Tách cue luyện lại kỹ thuật khỏi bài bổ trợ cá nhân hóa; không suy ra cơ yếu/bệnh lý từ nhãn |

“Hoàn chỉnh” là đáp ứng các tiêu chí nghiệm thu trong phạm vi công bố. Không có nghĩa trả lời mọi câu hỏi thể hình, chẩn đoán chính xác hoặc luôn đúng 100%.

## 3. Yêu cầu giảng viên phải thể hiện được

| Yêu cầu | Minh chứng bắt buộc |
|---|---|
| KB từ nhiều nguồn và có sách PDF | Danh mục nguồn thực sự đã xử lý, URL, file đã thu thập, đơn vị xuất bản, quyền sử dụng, hash và phạm vi trang/mục |
| Show KB và giải thích | Mẫu đầu ra KB gọn khoảng một trang, có khóa, nội dung, bài tập/khái niệm, liên kết nguồn; giải thích từng trường |
| Show Knowledge Graph | Sơ đồ thực thể/quan hệ, ý nghĩa quan hệ, dữ liệu Neo4j thật, truy vấn và kết quả thật |
| KB + RAG hoạt động thế nào | Luồng thu thập → xử lý → chunk/metadata → embedding/KG → truy xuất → tổng hợp → kiểm tra → trả lời |
| Chỉ ra code | Liên kết tới file/hàm thực hiện từng bước; phân biệt thiết kế đã cài đặt và thiết kế dự kiến |
| Show input/output cụ thể | Request, bối cảnh/quan sát, nguồn truy xuất, output, phiên bản và giới hạn; ghi rõ dữ liệu thật/giả lập/phát lại |
| RAG kết nối KG/Neo4j | Truy vấn thực, trace backend đang dùng, ảnh Graph và bảng chữ input/output; không dùng ảnh đồ thị để thay bằng chứng truy xuất |
| Thiết kế microservice | Ranh giới dịch vụ, hợp đồng dữ liệu, URL/API và xử lý khi một dịch vụ lỗi |
| Mô tả và nhận xét dữ liệu | Phân bố tài liệu/đoạn theo nguồn, chủ đề, bài; chọn trang PDF, tiền xử lý, OCR nếu có, kiểm tra chất lượng và khoảng trống |
| Kết luận chương | Nêu kết quả thực hiện, kiểm chứng, hạn chế và phần việc tiếp theo |

Liên kết Chương 3: dịch vụ DL cung cấp quan sát đã kiểm tra schema/ngưỡng/phiên bản cho Chương 4. Các thử nghiệm 4–5 mô hình trên 4–5 tập dữ liệu, bảng kiến trúc/hyperparameter và kết quả benchmark phải lấy từ thí nghiệm có thật của Chương 3; không tự tạo số liệu để hoàn thiện báo cáo Chương 4.

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
- Bốn mã bài nội bộ phải ánh xạ thống nhất; `situp` của pipeline này là **reverse crunch**, không tự đổi sang sit-up truyền thống.
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

## 8. Mốc hiện trạng đã có bằng chứng

Các số sau là **mốc kiểm tra trước khi lập file này**, không phải chứng nhận mọi yêu cầu mới đã hoàn thành:

| Thành phần | Mốc đã ghi nhận | Giới hạn |
|---|---|---|
| KB | `kb_a3a9fc4465797bf3`; 7 tài liệu/4 đơn vị xuất bản; 194 chunk; 23 tiêu chí | 171 chunk sách giải phẫu, chỉ 23 chunk hướng dẫn bài tập |
| Nhãn V4 | 83 nhãn, trong đó 23 nhãn lỗi | 8 lỗi liên kết trực tiếp, 13 một phần, 2 chưa có; chờ duyệt chuyên môn |
| PDF | OpenStax Anatomy and Physiology 2e, file 1.347 trang; chọn 84 trang thành 171 chunk | Không phải đã đưa toàn bộ sách vào index; trang file khác số in trên trang |
| KG | Đã kiểm chứng Neo4j với 311 nút KB và dữ liệu input/output | Phải kiểm tra lại dịch vụ/version trước mỗi lần trình diễn; hội thoại mới cần nhập/lưu theo luồng hiện có |
| LLM | Ollama `qwen3:8b`; embedding `qwen3-embedding:0.6b` | Chất lượng ngữ nghĩa và độ trễ chưa được coi là đạt toàn bộ mục tiêu sản phẩm |
| Kiểm thử trước | 36 câu nguồn/ngữ cảnh, 15 output API; 63 test KB, 26 test web/API | Bộ do người phát triển viết; chưa là đánh giá độc lập về độ tự nhiên/chính xác |
| Video → chat | Đã có minh chứng một video squat suy luận mới được gửi vào nhánh hỏi đáp | Chưa đủ để nghiệm thu mọi bài, mọi góc quay hoặc mọi tình huống nhiều video |

Hai nhãn lỗi đang thiếu liên kết: `child_pose_cheat`, `puppet_dance`. Các mức ROM và nhãn `knees_over_toes` cần tiếp tục đối chiếu mô tả gốc. Không bịa semantics từ tên nhãn.

## 9. Kế hoạch thực hiện theo ưu tiên

Các ô dưới đây là trạng thái công việc, không phải yêu cầu xin xác nhận trước mọi bước. Chỉ thực hiện phần đã được người dùng giao; cập nhật sau khi làm và kiểm chứng.

### P0 — Sửa luồng hội thoại và cách hiển thị

- [x] Phân loại và xử lý xã giao, cảm ơn, xác nhận, tạm biệt và câu hỏi đi kèm trong bộ kiểm thử phát triển; đã chạy B1/B3 ngày 07/11, chưa coi là đánh giá mọi cách diễn đạt.
- [x] Ưu tiên ý định hiện tại; các ca cảm ơn/đổi bài/rút gọn trong bộ kiểm thử cuối không bị kéo về câu hỏi trước.
- [x] Đổi ID chunk thô thành tham chiếu gọn trên UI; JSON giữ reply/ID gốc và ánh xạ `references`, không đổi luồng xuất Neo4j. Kiểm chứng trên web ngày 07/11; hội thoại mới vẫn cần nhập JSON vào Neo4j theo luồng hiện có.
- [x] Chuyển thông tin kiểm tra ngữ nghĩa/debug sang phần kỹ thuật; giữ thông báo có ích đúng lúc. Kiểm chứng UI thật và fixture lỗi ngày 07/11; chưa có nghĩa LLM kiểm chứng luôn đúng.
- [x] Kiểm chứng lại các nhóm thiếu ngữ cảnh, nối tiếp, đổi bài, không dấu và khoảng trống KB trong bộ 40 kịch bản ngày 07/11; cần đánh giá tiếp trên tập độc lập.

### P1 — Hoàn thiện hỏi về video đã tải

- [x] Giao diện thể hiện trạng thái và tên video; API nhận video_context, hướng dẫn nút gắn khi chưa có records. Chrome/API thật kiểm tra selected → analyzed → attached ngày 07/11.
- [x] Kiểm chứng luồng suy luận thật cho bốn bài, không cần camera: năm video người tập (hai squat), cộng video đen tổng hợp cho ca thiếu quan sát. Đây là kiểm tra tích hợp, chưa là benchmark độ chính xác DL.
- [ ] Kiểm tra đổi video, nhiều video, upload trùng, video không đủ quan sát và kết quả còn đang xử lý.
- [ ] Tách nội dung model quan sát, tiêu chí KB và kết luận; không gắn nhãn video trước cho video sau.
- [ ] Nghiệm thu câu hỏi tổng quát về độ ổn của video cùng các câu hỏi chi tiết/nối tiếp bằng nhiều cách nói.

### P2 — Tối ưu độ trễ

- [ ] Đo baseline nóng/nguội từng bước; ghi P50/P95 và số lần gọi LLM.
- [ ] Bổ sung đường xử lý nhẹ cho xã giao; bỏ rewrite/truy xuất/generation trùng lặp không cần thiết.
- [ ] Cải thiện ngữ cảnh, cache/version và trạng thái chờ; kiểm tra mất kết nối/timeout.
- [ ] So sánh chất lượng và độ trễ trước/sau trên cùng cấu hình; không hạ chất lượng âm thầm để đạt thời gian.

### P3 — Tăng chất lượng và độ phủ KB/KG

- [ ] Kiểm kê nguồn và phân bố chủ đề; rà liên kết nhãn/tiêu chí tới đúng đoạn và đúng pha/biến thể.
- [ ] Xác minh các nhãn chưa rõ với thành viên phụ trách DL, không suy đoán hoặc tự tạo ground truth.
- [ ] Bổ sung nguồn giải quyết các khoảng trống cần cho bốn chức năng; xác định phần cần người dùng/nhóm cung cấp.
- [ ] Có thang điểm/chính sách thật trước khi tuyên bố giải thích được số điểm kỹ thuật thực tế.
- [ ] Chỉ mở rộng bài bổ trợ cá nhân hóa khi có bằng chứng về lựa chọn, điều kiện áp dụng và đánh giá chuyên môn.
- [ ] Kiểm tra từng ý trả lời và citation; xử lý lặp ý, sai nghĩa, thừa ý và citation chỉ hỗ trợ một phần câu ghép.

### P4 — Hoàn thiện minh chứng Chương 4

- [ ] Đồng bộ đúng KB/Neo4j; lưu URL nguồn, file PDF, schema, code và chỉ dẫn chạy.
- [ ] Xuất mẫu KB gọn một trang và giải thích cấu trúc.
- [ ] Lưu input/output thật cho bốn chức năng; ghi rõ dữ liệu, model/KB/policy version và giới hạn.
- [ ] Có truy vấn Neo4j Graph + Table để giải thích nguồn → tiêu chí → nhãn và input → truy xuất → output.
- [ ] Cập nhật sơ đồ microservice và luồng đúng với code cuối cùng.
- [ ] Đánh giá nguồn/đoạn, tính đúng ngữ nghĩa, hội thoại, độ tự nhiên, latency và lỗi còn mở bằng kết quả thật.
- [ ] Viết nội dung và kết luận Chương 4, đối chiếu Chương 3; xuất bản in/Word khi được giao.

## 10. Tiêu chí nghiệm thu

| Nhóm | Điều kiện phải chứng minh |
|---|---|
| Hội thoại | Xã giao không kích hoạt bài giảng; câu có yêu cầu mới vẫn được trả lời; đại từ/đổi chủ đề xử lý đúng |
| Không phụ thuộc đáp án mẫu | Câu hỏi chưa đưa vào code/KB/prompt mẫu vẫn truy xuất và tổng hợp được; công bố giới hạn khi không đủ căn cứ |
| Video | Cả bốn bài được hỏi đáp với đúng quan sát của video đang chọn; dữ liệu thiếu và video trùng xử lý đúng |
| Điểm và tổng hợp | Số liệu tái tính được từ quan sát/chính sách, có trace; không bịa rep, thời gian hoặc điểm |
| Nguồn và UI | Không rò ID thô vào lời chat; tham chiếu mở được đúng nguồn/mục/trang; trace và JSON giữ đủ ID |
| Chất lượng | Có rà từng ý và lỗi điển hình; không coi LLM tự chấm là nghiệm thu chuyên môn |
| Độ phủ | Báo riêng nội dung, nhãn, đoạn/nguồn truy xuất và chất lượng trả lời; công bố các mục chưa hỗ trợ |
| Tốc độ | Có số đo nóng/nguội P50/P95, so sánh với mục tiêu và ghi rõ phần chưa đạt |
| Chương 4 | Nhiều nguồn + PDF; mẫu KB; KG/Neo4j; luồng microservice; code; input/output thật; phân bố/tiền xử lý; kết luận |

Không đánh dấu toàn bộ mục tiêu hoàn thành khi còn lỗi cốt lõi trong các nhóm này. Có thể nghiệm thu từng phần và công bố phần còn mở.

## 11. Đường dẫn và điểm vào cần nhớ

| Nội dung | Đường dẫn tương đối từ workspace |
|---|---|
| Dịch vụ KB/RAG | `smart-gym-ai/services/kb_rag/` |
| Xử lý hội thoại | `smart-gym-ai/services/kb_rag/kb_service/chatbot.py` |
| Planning, tổng hợp và kiểm tra nguồn | `smart-gym-ai/services/kb_rag/kb_service/knowledge.py` |
| Truy xuất/Neo4j | `smart-gym-ai/services/kb_rag/kb_service/retrieval.py`, `kb_service/graph.py` |
| Nguồn, tiêu chí, nhãn và giới hạn | `sources.json`, `claims.json`, `label_catalog_v4.json`, `capabilities.json` trong service |
| Hợp đồng DL | `smart-gym-ai/services/kb_rag/kb_service/v4.py`, `model_contracts/` |
| Web video và chatbot | `SmartGym-Model/smart_gym_web_v4/web/` |
| API điều phối và bridge KB | `SmartGym-Model/smart_gym_web_v4/server/app.py`, `server/coach.py` |
| Model chạy bốn bài | `SmartGym-Model/smart_gym_test_rtmpose_v4/` |
| Bộ đánh giá gần nhất | `smart-gym-ai/services/kb_rag/artifacts/coverage_audit/` |
| Hướng dẫn/bằng chứng Chương 4 cũ | `smart-gym-ai/services/kb_rag/docs/`, `artifacts/chatbot/` |

## 12. Nhật ký và việc đang mở

Bàn giao GitHub ngày 07/11/2026 theo yêu cầu người dùng: chuẩn bị đưa cả `smart-gym-ai/frontend`, `backend` và `services/kb_rag` lên nhánh riêng `handoff/web-kb-rag-20261107` của `Lumith226/SmartGym`, dựa trên nhánh mặc định `Tùng`, giữ các nhánh/model sẵn có. Bổ sung `HUONG_DAN_BAN_GIAO_FE_BE.md`: API chatbot hiện hành `/v1/chatbot`, FE/BE nháp còn gọi API cũ/placeholder, cách dựng lại corpus/index và yêu cầu PDF đúng bản. Bàn giao toàn bộ code/tiêu chí/manifest nguồn/catalog/contract/tests; loại `.env`, môi trường cài đặt, log hội thoại, corpus/index phát sinh và tài liệu gốc khỏi Git theo cấu trúc loại trừ của dự án. Đây là mốc chuẩn bị; trạng thái push và kiểm tra commit sẽ ghi sau khi thực hiện. Không tuyên bố toàn bộ chatbot đã nghiệm thu hoặc thay đổi kết quả đánh giá lịch sử.

Cập nhật xuất Word ngày 07/11/2026 theo yêu cầu mới: đã kiểm tra bộ ảnh và tạo `SmartGym_Bao_cao_Chuong_3_4.docx`, không làm bìa theo trả lời của người dùng. Bản ghép có 71 trang, 41 ảnh nhúng, 37 bảng và 1 mục lục đã cập nhật bằng Microsoft Word. Chương 3 gốc giữ nguyên hash b5565b87f1ecdcd0176e898e9493dcb9e8ddcc05db714ff3014bac4aff241ade; bản ghép bảo toàn 25 ảnh và giá trị trong 27 bảng, chuẩn hóa chú thích/phụ lục/tham chiếu. Chương 4 bổ sung 16 hình và 10 bảng, có mẫu KB một trang, nguồn PDF/URL/hash, kiến trúc microservice, luồng RAG, code và input/output thật. Hình 4.6 trang 39 nhúng nguyên PNG do Neo4j Browser xuất đủ 311 nút/380 cạnh; Hình 4.7 trang 40 có giao diện và số đếm. Hình nhánh được ghi đúng là vẽ lại từ dữ liệu, không giả ảnh Neo4j.

Bằng chứng xuất Word: `CHUONG_4_BAO_CAO/KIEM_TRA_ANH_BAO_CAO.md`, `tmp/chapter34/final_verification.json`, `tmp/chapter34/render_release/`. Đã rà 71 ảnh trang, sửa giữ chú thích cùng hình, header bảng, căn trái code và khung nhãn cạnh. Render bản cuối có 64 trang PNG trùng byte với bản đã rà, 7 trang thay đổi được mở kiểm tra lại. Dùng Word native EMF vì renderer đóng gói thiếu pdf2image/LibreOffice; một số nét chữ raster không trung thực hoàn toàn với font/văn bản Word nên kiểm tra thêm nội dung Word/OOXML. Chỉ giao DOCX, không giao ảnh QA làm bản nộp. Không thay đổi KB/model/ngưỡng; không chạy lại bộ 44 lượt hay 89+27 test trong đợt soạn báo cáo. Giữ giới hạn LIVE_PDF citation, direct/partial/none, policy DEMO và đánh giá phát triển; không đánh dấu toàn bộ P0–P4 hoặc nghiệm thu chuyên môn/tốc độ hoàn thành. Các ghi chú “chưa ghép Word” ở các mốc bên dưới là trạng thái lịch sử, được cập nhật bởi mốc xuất bản này.

| Ngày | Việc/quyết định | Bằng chứng/trạng thái |
|---|---|---|
| 06/11/2026 | Thiết lập file chuẩn theo yêu cầu người dùng; đặt hướng dẫn tự đọc trong `AGENTS.md` | Hoàn thành thiết lập quy tắc; chưa triển khai các checkbox P0–P4 của kế hoạch này |
| 06/11/2026 | Ảnh người dùng cho thấy ID chunk lộ trong lời chat và cảnh báo kỹ thuật lặp dưới câu trả lời | Xác nhận UI hiện chép nguyên reply/ID/warnings; đưa vào P0 |
| 06/11/2026 | “Cảm ơn bạn” bị hiểu thành yêu cầu tiếp tục giải thích bài trước | Xác nhận lỗi qua ảnh; cần xử lý xã giao và regression nhiều lượt, chưa đánh dấu đã sửa |
| 06/11/2026 | Người dùng phản ánh trả lời chậm | Code có planning, truy xuất/embedding, sinh, kiểm tra và tối đa một lần sửa; chưa đo baseline P50/P95 mới cho phản ánh này |
| 06/11/2026 | Đã có đường gửi quan sát video vào chat, cần làm rõ UX và kiểm chứng đủ bốn bài | Mốc một video squat thật đã lưu; P1 còn mở |
| 06/11/2026 | Soạn bộ kịch bản kiểm thử thủ công theo yêu cầu người dùng | `BO_KICH_BAN_TEST_CHATBOT_THU_CONG.md`: chín bộ câu hỏi/tình huống, có điều kiện và tiêu chí; chỉ soạn kịch bản, chưa chạy hoặc đánh dấu đạt các ca mới; không đưa câu kiểm thử vào KB/prompt đáp án |
| 07/11/2026 | Khởi động web theo yêu cầu người dùng | Web 8080, API video 8001 (ready=true, CPU), KB/RAG 8010 (KB/index ready), Ollama 11434 và Neo4j 7474 trả HTTP 200; container Neo4j chạy. Cập nhật runtime/local_processes.json; chỉ kiểm tra sẵn sàng dịch vụ, không nghiệm thu hội thoại hoặc đánh dấu P0–P4. |
| 07/11/2026 | Sửa hiển thị nguồn/cảnh báo và định tuyến xã giao theo ảnh người dùng | `web/chat-view.js`, `kb_service/presentation.py`, `knowledge.py`: UI dùng [1], mở đoạn trích, khối kỹ thuật đóng mặc định; API/JSON giữ ID và ánh xạ. 69 unit test KB đạt; JS hợp lệ; 6 lượt API thật qua Chrome đạt kiểm tra hành vi/UI, cộng fixture từ chối bản nháp/giới hạn video/XSS. Bằng chứng: `smart-gym-ai/services/kb_rag/artifacts/chat_presentation_20261107/`. Lưu cả lần lỗi trước chỉnh planner; chưa nghiệm thu toàn bộ P0, độ phủ hay tốc độ P50/P95; lời sinh còn lặp/thừa ý. Không thêm đáp án kỹ thuật làm sẵn vào KB hoặc prompt. |
| 07/11/2026 | Sửa lặp/thừa ý và tự chạy toàn bộ bộ kiểm thử theo yêu cầu người dùng | `knowledge.py`: giới hạn số ý theo trọng tâm, chọn ý/cắt vế cuối qua reviewer có nguồn, giữ điều kiện; thêm guard thiếu quan sát/không rõ tên bài, dùng quan sát V4 để truy xuất, nêu giới hạn năng lực và đọc metadata nguồn thật. `chatbot.py`: điểm chỉ hiện tiêu chí liên quan; tóm tắt giới hạn đúng số điểm người dùng yêu cầu, giữ đầy đủ dữ liệu trong JSON. Không thêm đáp án mẫu vào KB/prompt. |
| 07/11/2026 | Xuất bộ kết quả kiểm thử thực tế và giữ ca thất bại | `KET_QUA_TEST_CHATBOT_2026-11-07.md` và `.html`; `artifacts/manual_suite_20261107/`: 40 ca gốc/44 lượt chính, 164 lượt HTTP qua các vòng. Kết quả cuối: 35 ca gốc Đạt, 3 Chưa đủ căn cứ, 2 Lỗi; theo 44 lượt là 38/4/2. 78 unit test KB đạt; Chrome xác minh UI/mobile/export nguồn, video phân tích mới và phát lại output có gắn nhãn rõ; Neo4j read-only xác minh 311 nút và 10 chunk được trích đúng version. Chưa nhập hội thoại mới vào Neo4j, chưa thẩm định chuyên môn hoặc đo P50/P95 chuẩn. |
| 07/11/2026 | Những lỗi còn mở sau vòng thử này | VD02 chưa hướng dẫn bước gắn kết quả video; VD03 từ chối dù có quan sát vì bản nháp lặp nhận định tần suất không có nguồn. KT01/KT02 có quote chưa chứng minh đủ từng vế; VD04 chống đẩy và reverse crunch còn giải thích tiêu chí chung/chưa đủ liên kết với kết luận quan sát. Các vấn đề giữ trong báo cáo, không tính là đã hoàn thiện toàn bộ P0–P4. |
| 07/11/2026 | Phân tích nguyên nhân năm ca chưa đạt theo câu hỏi người dùng | `PHAN_TICH_NGUYEN_NHAN_5_CA_CHATBOT.md`: đối chiếu sáu lượt con trong final_results.json với code. Xác minh quote thiếu vế/reviewer chấp nhận nhầm (KT01/KT02), nối nhãn–tiêu chí/quan sát chưa đủ (VD04), API thiếu trạng thái đã phân tích nhưng chưa gắn (VD02), rewrite thêm “common mistakes” dẫn đến hai bản nháp “phổ biến” bị chặn và fallback chung (VD03). Chỉ phân tích/tài liệu; không sửa runtime, không đổi điểm chấm test hoặc đánh dấu đã khắc phục. |
| 07/11/2026 | Sửa năm ca theo yêu cầu tiếp theo | `grounding.py`, `knowledge.py`: quote nhiều câu/span bổ sung cùng tài liệu đã truy xuất, kiểm tra thiếu thuật ngữ rồi review lại; không tắt guard tần suất. Nhận xét dùng câu hỏi/nhãn thật, chọn tiêu chí liên kết trực tiếp và không tự xếp hạng nguy cơ; fallback giữ dữ liệu model hợp lệ. `observation_chat.py` công bố đúng liên kết partial/thuộc tính thay vì giả vờ có ngưỡng/góc đo. `chatbot.py`, web/API thêm video_context và trạng thái/tên video. Không đổi nguồn KB, model, ngưỡng hoặc đưa đáp án test vào prompt/KB. |
| 07/11/2026 | Vòng kiểm thử cuối thống nhất sau sửa | `KET_QUA_TEST_CHATBOT_CUOI_2026-11-07.md`/`.html`; `artifacts/manual_suite_final_20261107/`: 40 ca gốc, 44 lượt chính trong một run_id với runtime_revision b09ac8f306a30c02 trước/sau không đổi; 44/44 đạt tiêu chí hành vi theo rà soát trợ lý phát triển. Giữ 14 lượt thử sơ bộ (có lỗi) và mốc trước sửa riêng. 89 unit test KB, 27 test web/API đạt; Chrome/API thật kiểm tra trạng thái video, replay output riêng cho hiển thị; HTML lọc/tìm kiếm/mobile đạt. Neo4j read-only: 311 nút/11 chunk trích dẫn cùng version. Chưa nhập trace hội thoại mới, chưa phải đánh giá độc lập/chuyên môn/P50-P95. Đạt bao gồm nêu đúng giới hạn; ngưỡng quá sâu và góc đo xác minh vẫn chưa có. |

Sau mỗi đợt công việc: ghi thay đổi, vị trí code/bằng chứng, kiểm thử/đo đạc đã chạy, kết quả, giới hạn và việc tiếp theo. Không sửa nhật ký để biến lỗi hoặc dữ liệu giả lập thành kết quả thật.

Làm rõ thuật ngữ ngày 07/11/2026: “chưa có ngưỡng cá nhân được kiểm chứng” trong các trao đổi trước nói tới thiếu quy tắc đối chiếu định lượng/điều kiện áp dụng để chuyển nhãn thành tư vấn riêng cho người tập; không có nghĩa model chưa có ngưỡng kích hoạt. Catalog hiện có ngưỡng 0.35 cho nhãn PUSHUP/too_deep; đây là ngưỡng trên điểm nhãn, không phải góc khớp hoặc phần trăm kỹ thuật đúng. Cần xác minh định nghĩa nhãn gốc, cách đo và liên kết nguồn trước khi tư vấn ngưỡng kỹ thuật cụ thể. Đợt này chỉ giải thích thuật ngữ, không đổi code/ngưỡng hoặc chạy lại test.

Kiểm tra phụ thuộc thư mục ngày 07/11/2026 theo câu hỏi dọn bản nháp: `smart-gym-ai/` hiện chứa cả FE/BE cũ và KB/RAG đang dùng. Luồng demo là web/model trong `SmartGym-Model/smart_gym_web_v4` (8080/8001) gọi HTTP tới `smart-gym-ai/services/kb_rag` (8010), chạy bằng `smart-gym-ai/.tools/python`; Neo4j được cấu hình bằng `docker-compose.kb.yml`. Kiểm tra HTTP: 8080/8001/8010 sẵn sàng, 3000/8000 không truy cập được. Không thấy import backend/frontend cũ trong code runtime của service KB và web-model. Không xoá cả `smart-gym-ai/`; muốn bỏ thư mục gốc phải tách service/data/runtime/config và sửa các đường dẫn trước. Đợt này chỉ kiểm kê/giải thích, không xoá hoặc di chuyển dữ liệu.

Chuẩn bị báo cáo Chương 4 ngày 07/11/2026 theo yêu cầu người dùng: đọc văn bản và toàn bộ bảng của `Chuong_3_Thuc_nghiem_va_Danh_gia_AI_SmartGym.docx` mới (hash b5565b87f1ecdcd0176e898e9493dcb9e8ddcc05db714ff3014bac4aff241ade), giữ nguyên bản gốc. Tạo `CHUONG_4_BAO_CAO/` gồm nội dung chương dạng MD/HTML để duyệt, bảng đối chiếu yêu cầu, code trích nguyên văn, mẫu KB một trang có đoạn sách, 9 sơ đồ SVG/PNG, trang tra cứu đủ nút và cạnh, hướng dẫn và 12 truy vấn Neo4j. Kiểm tra database khớp toàn bộ 311 node ID và 380 bộ ba cạnh với snapshot; hash cả 7 nguồn khớp. Nhập 10 output HTTP đã lưu và 2 HTTP KB mới vào suite riêng `smartgym-chapter4-20261107` bằng MERGE, ghi rõ evidence_origin/timestamp; đối chiếu reply lưu DB khớp JSON. Truy vấn Q1–Q12 đều có kết quả; chụp Graph KB, Graph trace và Table trong Browser thật. Hội thoại không tự biến thành tri thức KB.

Giới hạn của đợt chuẩn bị: chưa ghép Word Chương 3+4 hoặc nghiệm thu bố cục toàn bộ file Chương 3; chưa chạy lại 89+27 test hay bộ 44 câu, các kết quả đó được dẫn đúng là hồ sơ đã lưu. Hai HTTP mới tốn 43,004 và 36,485 giây, không coi là benchmark nóng/nguội. Rà ví dụ LIVE_PDF cho thấy định nghĩa agonist trực tiếp nằm ở chunk đã truy xuất nhưng chưa được response CITES, trong khi quote tự động tập trung antagonist; ghi rõ trong nội dung chương, không đổi output/điểm kiểm thử để gọi là đạt mọi vế. SVG là hình vẽ lại từ dữ liệu đối chiếu, ảnh `neo4j_*.png` mới là Browser thật. HTML kiểm tra link/ảnh/JS/mobile; mẫu KB vừa vùng in A4. P0–P4 và tiêu chí nghiệm thu chuyên môn/tốc độ chưa được đánh dấu hoàn thành toàn bộ. Bước tiếp theo theo người dùng: duyệt nội dung rồi ghép báo cáo Word Chương 3+4, mục lục, đánh số và kiểm tra bản in.

Ảnh Neo4j tổng quát ngày 07/11/2026 theo yêu cầu dồn toàn bộ 311 nút và 380 cạnh: làm rõ hình hộp input/output VD03 do trợ lý vẽ lại để giải thích, không phải ảnh Browser. Chạy truy vấn read-only toàn bộ `SmartGymKB` của đúng version, không LIMIT; kiểm đếm trực tiếp database 311/380 và xác nhận Browser hiển thị Nodes (311), Relationships (380). Dùng renderer thật và nút Download as PNG của Neo4j Browser xuất `CHUONG_4_BAO_CAO/figures/neo4j_toan_bo_311_nut_380_canh_graph.png` (4268×2500); ảnh giao diện kèm query, Graph và số đếm lưu ở `neo4j_toan_bo_311_nut_380_canh.png` (5120×1600). Chỉ thay kích thước panel, zoom và thứ tự ưu tiên màu trong browser profile tạm; không sửa dữ liệu DB/KB hoặc tự vẽ thay graph. Năm thành phần liên thông có 172/45/38/28/28 nút; cụm sách đứng riêng vì hiện chưa gắn quan hệ khái niệm giải phẫu với bốn bài. Lưu query `NEO4J_TOAN_BO_311_380.cypher`, bằng chứng DB/capture JSON trong evidence, script `capture_neo4j_full_graph.py`; cập nhật index và hướng dẫn. Đã xem hai ảnh cuối và kiểm tra link/ảnh/JS/mobile của hồ sơ; không chạy lại chatbot hoặc đổi đánh giá độ phủ.
