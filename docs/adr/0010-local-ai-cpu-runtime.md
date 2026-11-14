# ADR 0010 — Runtime AI cục bộ cho T21

T21 là cổng nhận bàn giao engine: hash/schema, inference và raw fixtures đủ scope, xác minh auth upstream và giới hạn private. Auth user/owner/mTLS của adapter là đầu ra T22/T23; không đặt nó thành phụ thuộc trước T21 rồi lại bắt T22 phụ thuộc T21. Không bật API AI trên Web chỉ vì T21 đạt. Corpus/generation thật thuộc T27, feed Catalog thuộc T26/T36 và deployment/quality thuộc M6. Cách phân cổng này làm rõ trách nhiệm, giữ nguyên yêu cầu bảo mật toàn hệ thống.

ACCEPTED cho môi trường development T21 ngày 2026-11-07. Người dùng đã chọn chạy AI trên máy hiện tại; được quyền chọn công cụ/runtime có thể đảo ngược trong WRITE_ROOT. Không thay framework nghiệp vụ hoặc mã/weights bàn giao.

uv 0.13.7 portable có SHA-256 từ GitHub release chính thức; CPython 3.12.16 build 20261026 được kiểm từ distribution catalog của bản uv này. Binary/env/cache/temp đặt trong .local/ai, tắt cài executable, Windows registry và sửa PATH. Hai venv riêng cho Pose và RAG. RAG giữ nguyên tất cả 23 pin requirements.lock.txt của provider, thêm hash để sync.

Resolve nguyên manifest Pose cho thấy rtmlib 0.0.16 yêu cầu onnxruntime không pin và cả opencv-python/opencv-contrib-python. Điều này kéo CPU ORT 1.31.1 song song GPU ORT 1.19.2, OpenCV contrib 5.0 song song core 4.12. Wheel dùng cùng namespace nên pip check không chứng minh implementation đúng. Kiểm import thực tế nạp ORT 1.31.1 CPU và cv2 4.12.0. CUDA không khả dụng trong runtime đã kiểm.

Chọn profile smoke CPU riêng: thay dòng GPU bằng onnxruntime==1.31.1 trong input được tạo ở Web, ghim opencv-contrib-python==4.12.0.88 để đồng phiên bản core đã pin. Giữ rtmlib 0.0.16 và model/preprocessing/threshold nguyên bản. httpx 0.28.1 là dependency của harness FastAPI TestClient, không bắt buộc lên production Pose. Reinstall sạch package theo lock khi sync profile CPU để loại file overlay GPU/OpenCV cũ.

rtmlib vẫn yêu cầu hai distribution OpenCV dùng chung cv2. Profile local ghim đồng phiên bản và kiểm version import thực tế; đây là giới hạn đóng gói provider còn mở cho production. Không sửa metadata hoặc vendoring rtmlib trong lượt này. Trước GPU/production phải thống nhất profile chỉ một implementation mỗi namespace với đội AI, khóa dependency riêng và chạy lại nghiệm thu. Smoke CPU không chứng minh CUDA, tải, rep accuracy, service auth hay corpus RAG đầy đủ.

Không chạy script cài đặt toàn máy. Chỉ install wheel có hash từ PyPI. Source provider chỉ đọc với PYTHONDONTWRITEBYTECODE và cache/temp riêng; thiếu local detector/pose weights thì smoke dừng trước khi RTMPose có thể tự tải. Video benchmark chỉ dùng nội bộ tại nguồn, không sao chép hoặc công bố. Raw observation lưu trong .local/ai, bỏ comparison ground truth và thay source filename bằng hash để không biến benchmark thành bằng chứng kỹ thuật đúng.

Nguồn kiểm ngày 2026-11-07: [uv Python versions](https://docs.astral.sh/uv/concepts/python-versions/), [uv environment](https://docs.astral.sh/uv/reference/environment/), [rtmlib metadata](https://pypi.org/pypi/rtmlib/0.0.16/json), [uv 0.13.7](https://github.com/astral-sh/uv/releases/tag/0.13.7). Chi tiết cài/chạy và bằng chứng ở Operations/Test Plan.
