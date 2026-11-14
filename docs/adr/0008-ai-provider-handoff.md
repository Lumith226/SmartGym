# ADR 0008 — Tích hợp Pose V4 và KB/RAG bàn giao

Cập nhật T21: smoke CPU và raw validation đã đạt theo [ADR 0010](0010-local-ai-cpu-runtime.md) và [runtime evidence](../api/ai-runtime-verification.yaml). Các nhận định chưa chạy runtime trong bối cảnh quyết định dưới đây là lịch sử trước T21; adapter Web/auth và corpus generation vẫn chưa nghiệm thu.

ACCEPTED ngày 2026-11-07. Căn cứ là người dùng xác nhận KB/RAG từ `E:\do an\smart-gym-ai` và Pose từ `E:\do an\SmartGym`. Giữ NestJS cho backend nghiệp vụ và Next.js/BFF hiện tại. Các dịch vụ AI Python giao tiếp qua HTTP/JSON và WebSocket.

Nguồn Pose hiện hành là `smart_gym_web_v4/server` và `smart_gym_test_rtmpose_v4`, có FastAPI, RTMPose và ST-GCN++ ONNX V4. Nguồn RAG là `smart-gym-ai/services/kb_rag`, API chính `/v1/chatbot`. Bốn model ONNX khớp digest đăng ký trong RAG, bốn contract JSON giống nhau từng byte. Đây là kiểm tra tĩnh, runtime AI chưa được nghiệm thu trên máy này.

Quyết định thay thế giả định của ADR 0001 về SQLite/PostgreSQL bên trong RAG, nguồn Pose V2 và việc tái sử dụng RAG cũ. Provider bàn giao dùng JSON snapshot/vector và Neo4j tùy cấu hình. Backend FastAPI nháp trong `smart-gym-ai/backend` còn gọi `/v1/chat` cũ. Identity, Catalog, Workout, Progress và Notification tiếp tục dùng NestJS.

Web/BFF sở hữu chuyển tiếp cùng origin, kiểm phiên và hợp đồng trình duyệt. Pose boundary sở hữu upload, job/live-session, result và provenance theo owner. Lớp điều phối trong boundary Pose bổ sung bảo mật, idempotency, lưu kết quả và chuyển giao thức tới engine V4. Engine Python giữ inference hiện có. Progress chỉ nhập chỉ số đã xác minh. RAG giữ pipeline tri thức và generation hiện có. Topology giữ bảy ranh giới nghiệp vụ.

RAG adapter trong Web/BFF chuyển câu hỏi và các result ID đã kiểm owner thành request `/v1/chatbot`. Với dữ liệu phiên, adapter lấy raw V4 qua API Pose nội bộ. Browser chọn kết quả đã lưu, raw result và provenance dùng từ dữ liệu server. Các HTTP client tương đương có thể dùng trong module NestJS khi thuộc trách nhiệm của service đó.

Provider chưa có xác thực người dùng hoặc durable jobs phù hợp Web. Production dùng gateway/sidecar mTLS theo policy hiện có, giữ listener engine trên mạng riêng. RAG token nội bộ khác JWT người dùng, phải cấu hình không rỗng tại môi trường tích hợp. T21/T27 xác minh policy trước khi mở traffic.

Corpus sách/HTML của RAG độc lập với Catalog 35 bài. RAG-002 về đồng bộ Catalog vẫn thuộc phạm vi hệ thống, nhưng provider chưa có consumer/head/tombstone. T26/T36 chốt phần mở rộng với đội RAG. Chat kiến thức có thể phát triển trước feed CMS. Chỉ trả nội dung Catalog sau khi nghiệm thu visibility của feed.

OpenAPI AI M0 được đánh dấu NEEDS_PROVIDER_ALIGNMENT. T21/T22 sửa repCount bắt buộc cho video không có số rep, bổ sung đường đọc raw result nội bộ. T27 mở rộng contract câu hỏi đơn sang hội thoại/bốn task, giữ nghĩa status/references. Operation AI chưa triển khai không xác lập tính năng đang có ở provider.

Chi tiết ở [AI integration](../design/AI_INTEGRATION.md), [ma trận tương thích](../api/ai-provider-compatibility.yaml) và [review](../reviews/DESIGN_REVIEW.md).
