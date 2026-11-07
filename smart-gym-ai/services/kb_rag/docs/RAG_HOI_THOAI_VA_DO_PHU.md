# RAG hội thoại và kiểm tra độ phủ — bản thay thế cách ghép đáp án

**Trạng thái vòng cuối 07/11/2026:** đã sửa năm ca KT01/KT02/VD02/VD03/VD04 và chạy lại đủ 40 kịch bản, 44 lượt chính trên một runtime revision. [Báo cáo mới nhất](../../../../KET_QUA_TEST_CHATBOT_CUOI_2026-11-07.md), [HTML có bộ lọc](../../../../KET_QUA_TEST_CHATBOT_CUOI_2026-11-07.html). Cả 44 lượt đáp ứng tiêu chí hành vi trong tập phát triển; các số 35/3/2 bên dưới là mốc trước sửa. Không coi đạt ca nêu giới hạn là đã bổ sung đủ tri thức hoặc giải thích mọi nhãn.

`grounding.py` hỗ trợ span nhiều câu và span bổ sung từ cùng tài liệu đã truy xuất, kiểm tra thiếu thuật ngữ cơ thể rồi đưa toàn bộ bằng chứng qua reviewer. Đây là kiểm tra hỗ trợ, không phải phép chứng minh ngữ nghĩa tuyệt đối. `knowledge.py` giữ câu hỏi/nhãn quan sát làm trọng tâm thay vì tiền đề tần suất do rewrite thêm. Với nhận xét video, `observation_chat.py` tường thuật nhãn và mức direct/partial/none từ catalog; nhãn thuộc tính không bị biến thành số đo góc hoặc chuẩn đúng/sai. Đây là dữ liệu/hợp đồng hệ thống, không phải bảng đáp án câu hỏi kiến thức. Các câu kiến thức vẫn được truy xuất và LLM tổng hợp.

UI gửi `video_context` gồm trạng thái và định danh video qua API; `records` mới là dữ liệu quan sát để kết luận. Trạng thái chọn/đang xử lý/đã phân tích/đã gắn được hiển thị cùng tên file. Khi chưa gắn kết quả, hướng dẫn thao tác chạy nhẹ và không giả vờ đã phân tích tư thế trong chat. Nguồn vẫn giữ nguyên ID trong JSON và tham chiếu số trên UI.

## Vì sao câu trong ảnh bị từ chối?

Bản trước dùng bộ lọc từ khóa trước truy xuất, không nhận ra một số cách nói như “buổi tập”. Chế độ hỏi đáp cũng chưa đưa quan sát video vào ngữ cảnh. Ngoài ra, một số câu kỹ thuật và định nghĩa được trả bằng các view viết sẵn. Cách này giảm tự bịa nhưng hạn chế khả năng hỏi tự nhiên, nên đã được thay thế ở nhánh chatbot hỏi đáp.

“Tôi nên chú ý gì trong buổi tập này?” chưa chỉ rõ bài tập hoặc dữ liệu buổi tập. Nếu chưa có ngữ cảnh, chatbot cần hỏi thêm. Nếu đã có tên bài trong hội thoại hoặc đã thêm kết quả video, nó cần sử dụng thông tin đó. Không nên tự đoán bạn đang tập squat hay khẳng định một lỗi chưa được quan sát.

## Cơ chế hiện tại

Cập nhật 07/11/2026: lượt xã giao thuần túy đi qua nhánh nhẹ, không truy xuất hoặc gọi LLM nếu khớp ngữ pháp toàn câu bảo thủ; các câu khác vẫn do planner hiểu theo nghĩa, có action `social`. Lời chào/cảm ơn đi kèm câu hỏi kỹ thuật không được bỏ qua câu hỏi. Lời chào chỉ nêu mong muốn học tập chung thì hỏi bài/phần muốn tìm hiểu. Đây là định tuyến hội thoại, không phải bảng đáp án kiến thức.

Giao diện chat đổi citation thành `[1]`, `[2]`, mở mục **Nguồn tham khảo** chứa tên nguồn, đơn vị xuất bản, trang/mục và đoạn trích. `reply`/`citations` gốc vẫn giữ ID trong JSON; `references` ánh xạ số sang ID. `kb_service/presentation.py` tách `user_notices` và `technical_details`; `web/chat-view.js` hiển thị bằng DOM/text an toàn. Hai thông báo nội bộ về kiểm tra ngữ nghĩa và bản nháp bị chặn chuyển sang **Thông tin kỹ thuật (phục vụ báo cáo)** đóng mặc định; cảnh báo thực tế như chất lượng video kém vẫn hiển thị. Bộ kiểm tra bằng chứng vẫn được giữ.

Minh chứng đợt này: [báo cáo hiển thị/xã giao](../artifacts/chat_presentation_20261107/REPORT.md). Sáu lượt thật là kiểm tra chức năng nhỏ; không thay thế đánh giá ngữ nghĩa độc lập, toàn bộ bộ câu hỏi hoặc benchmark độ trễ.

```text
Câu hỏi mới + hội thoại có vai trò + quan sát V4 đã kiểm tra
    → lập truy vấn theo ngữ nghĩa, dịch truy vấn tìm kiếm sang tiếng Anh
    → hỏi thêm nếu tham chiếu tới buổi/video chưa xác định
    → BM25 + embedding + KG/Neo4j, hợp nhất bằng RRF
    → LLM tự viết phần giải thích từ bằng chứng và tiêu chí
    → chọn mã citation và đoạn trích thật bằng schema ràng buộc
    → kiểm tra đoạn trích + kiểm tra ngữ nghĩa bản nháp bằng LLM
    → trả lời có nguồn hoặc nói rõ phần chưa đủ căn cứ
```

Không còn `BOOK_VIEWS`, danh sách câu hỏi–đáp án hoặc nhánh nhận diện một câu hỏi kỹ thuật để ghép sẵn đáp án trong `kb_service/knowledge.py`. Các tiêu chí trong `claims.json` vẫn là tri thức có nguồn của KB; chúng được đưa vào ngữ cảnh để LLM diễn đạt, không phải bảng tra câu hỏi mẫu.

Việc nhận diện tên bài, xác minh nguồn, kiểm tra nhãn, tính điểm và đếm dữ liệu vẫn là code xác định. Những phần này cần ổn định và không nên giao cho LLM tự đoán. Quy tắc nhận ra tham chiếu như “buổi này/video này” chỉ dùng để yêu cầu ngữ cảnh còn thiếu, không lưu đáp án kiến thức.

`capabilities.json` là bản kê năng lực còn thiếu dựa trên nguồn/quan hệ KB hiện có, không chứa câu hỏi mẫu hoặc đáp án thể hình. Bộ phân loại ngữ nghĩa và một số ràng buộc loại yêu cầu giúp ngăn việc dùng hướng dẫn tư thế để trả lời sai câu hỏi về nguyên nhân yếu cơ, calo hoặc giáo án cá nhân. Khi bổ sung nguồn mới, cần duyệt lại bản kê này cùng phiên bản KB. Nhánh báo thiếu năng lực dùng `generation_mode=capability_limit`.

`generation_mode=grounded_synthesis` là lời giải thích do LLM tổng hợp. `clarification` là câu hỏi làm rõ do LLM viết. `claim_selection` vẫn được dùng trong báo cáo nhãn V4 và các chế độ thống kê có cấu trúc; không nên nhầm nó với nhánh hội thoại mới.

Mô hình local hiện chọn `qwen3:8b`, đã tải và thử trên máy này. Bản 4B được giữ để dự phòng; không tự xóa. Embedding vẫn là `qwen3-embedding:0.6b`, nên không cần xây lại embedding hoặc train lại model hình ảnh. `.env`, `.env.example` và mặc định cấu hình đã cập nhật model chat.

## Độ phủ cần hiểu thành ba phần

Đợt kiểm thử 07/11/2026: [báo cáo đầy đủ](../../../../KET_QUA_TEST_CHATBOT_2026-11-07.md), [bản HTML có bộ lọc](../../../../KET_QUA_TEST_CHATBOT_2026-11-07.html). Đã chạy toàn bộ 40 kịch bản thủ công, mở rộng thành 44 lượt chính và giữ 164 lượt thực thi qua các vòng. Theo 40 ca gốc: 35 Đạt, 3 Chưa đủ căn cứ, 2 Lỗi. Đây là rà soát hành vi/nguồn do trợ lý phát triển thực hiện, không phải độ chính xác thể hình trên tập độc lập.

Planner hiện giới hạn số ý theo câu hỏi. Reviewer chọn tập ý tối thiểu và có thể chọn bản cắt vế cuối được code tạo từ chính bản nháp; không tự thêm kiến thức, không cắt điều kiện tường minh được nhận diện. JSON lưu cả bản nháp, các ứng viên và lựa chọn để kiểm tra. Cách này đã xử lý các ca đầu/cột sống bị lặp và khoảng cách tay bị thêm hướng ngón tay; vẫn còn trường hợp quote chỉ hỗ trợ một phần câu ghép.

Với câu nhận xét video, truy xuất được gắn quan sát V4 đã kiểm tra; nhãn dự đoán được tách khỏi cue KB. Chưa đủ khớp thì dừng nhận xét cá nhân. Hỏi nguồn lượt trước dùng metadata/ID thật, không yêu cầu LLM đoán URL/trang. Báo cáo điểm không chèn tiêu chí không liên quan khoản trừ; tóm tắt có yêu cầu số ý giữ đúng số ý mà không bỏ dữ liệu gốc. Các ca video VD02/VD03 và phần liên kết quan sát–tiêu chí còn mở được ghi rõ trong báo cáo.

1. **Nội dung:** KB có thật sự chứa kiến thức về chủ đề đó không? Số đoạn nhiều không đồng nghĩa biết mọi lĩnh vực thể hình.
2. **Truy xuất:** khi người dùng đổi cách hỏi hoặc hỏi nối tiếp, hệ thống có lấy đúng nguồn/đoạn không?
3. **Trả lời:** LLM có diễn đạt đúng bằng chứng, đúng câu hỏi và hỏi thêm đúng lúc không?

Báo cáo số liệu và output: [DO_PHU_KB_RAG.md](../artifacts/coverage_audit/DO_PHU_KB_RAG.md). Dữ liệu thô: `artifacts/coverage_audit/cases.json` và `report.json`. Bộ kiểm tra có 36 câu do người phát triển viết; không dùng như dữ liệu huấn luyện hay câu trả lời mẫu. Kiểm thử trả lời chạy trên một tập con; xem số lượng thực tế trong báo cáo.

Lần kiểm tra đã lưu: 36 câu về nguồn/ngữ cảnh, 15 output API; Source Recall@5 trên 27 câu có nguồn kỳ vọng tăng từ 85,2% ở bộ lọc cũ lên 100% ở đường truy xuất ngữ nghĩa. Đây chỉ là tìm nguồn trên tập nhỏ. Đã kiểm tra thêm hội thoại ba lượt bằng trình duyệt và một video suy luận mới đưa vào nhánh hỏi đáp. 63 unit test KB và 26 test web/API vượt qua; không dùng các số test này để suy ra độ chính xác kiến thức.

KB vẫn có 7 tài liệu, 194 đoạn và 23 tiêu chí. Trong đó 171 đoạn là sách giải phẫu, 23 đoạn là hướng dẫn bài tập. 23 nhãn lỗi có 8 liên kết trực tiếp, 13 một phần, 2 chưa có. Những số này không thay đổi chỉ vì đổi cách sinh câu trả lời.

Các khoảng trống còn lại gồm: thang điểm chính thức, thiết kế chương trình/tiến triển tải, liều bổ sung dinh dưỡng, ước lượng năng lượng cá nhân, bài bổ trợ theo nguyên nhân và lịch sử nhiều buổi. Không được tự bù những phần đó bằng kiến thức không có trong KB.

## Kiểm tra trên web

Mở `http://localhost:8080`, tải lại trang để nhận JavaScript mới. Xóa hội thoại cũ rồi thử theo trình tự:

- Hỏi về buổi tập khi chưa thêm video hoặc tên bài: kiểm tra chatbot hỏi thêm.
- Nêu tên một trong bốn bài và hỏi bằng lời của bạn, kể cả không dấu.
- Hỏi nối tiếp bằng đại từ hoặc chỉ một bộ phận; kiểm tra ngữ cảnh được giữ.
- Đổi sang bài khác; kiểm tra chatbot không bám chủ đề cũ.
- Thêm kết quả video vào buổi tập và hỏi trong chế độ hỏi đáp; kiểm tra quan sát được đưa vào request.
- Hỏi một vấn đề KB chưa có; kiểm tra hệ thống không bịa số điểm, liều lượng hoặc nguyên nhân.

Mỗi output có `retrieval.planner`, các kênh truy xuất, `support_quotes` và `evidence_review` để kiểm tra. Trình duyệt xuất cả input/output; muốn show hội thoại mới bằng Neo4j, nhập JSON theo hướng dẫn Chương 4. Các ví dụ Neo4j cũ vẫn là hồ sơ của bản trước, chưa đại diện cho cơ chế sinh hội thoại mới.

## Giới hạn đánh giá

Một trích dẫn tồn tại chưa chứng minh câu diễn giải đúng. Bộ lọc ngữ nghĩa dùng LLM cũng có thể bỏ sót hoặc chặn nhầm; chưa thay thế người có chuyên môn. Vì vậy báo cáo không quy Source Recall@5 thành “độ chính xác câu trả lời”, không dùng việc vượt qua unit test để tuyên bố phủ toàn bộ tri thức và không cam kết chatbot không bao giờ sai.

Kiểm tra thủ công vẫn thấy một số output dài hơn ý hỏi và có câu ghép mà một citation chưa hỗ trợ đầy đủ mọi vế. Đây là giới hạn cần công bố khi trình diễn; trạng thái `generated` hoặc tự kiểm tra `supported=true` của LLM không được dùng làm kết quả thẩm định khoa học.
