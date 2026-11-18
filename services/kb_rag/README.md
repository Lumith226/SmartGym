# Dịch vụ KB và RAG SmartGym

Package Python độc lập cho hỏi đáp có nguồn, giải thích theo quan sát, tóm tắt buổi tập và gợi ý luyện lại. Không cần model nhận diện ảnh để hỏi kiến thức. Xem [hướng dẫn chạy toàn hệ thống](../../docs/guides/BAN_GIAO_CHAY_MAY_KHAC.md).

- `kb_service/`: ingest, schema/adapter, lexical/dense/Neo4j retrieval, tổng hợp và kiểm bằng chứng, HTTP API.
- `data/releases/six_exercises_20261118_r3/`: snapshot/vector đã dựng, cùng version.
- `data/export/`: bản Cypher tái tạo và manifest kiểm hash.
- `data/source_manifest.json`, `sources.json`: URL, nguồn, định vị, phạm vi trích xuất và giấy phép.
- `model_contracts/`: JSON mô tả nhãn/threshold/schema; không chứa trọng số AI.
- `tests/`, `evaluation/`: fixture và bộ đánh giá, được tách khỏi corpus.

Chạy unit test bằng Python có các dependency trong `requirements.lock.txt`:

```powershell
python -m unittest discover -s services/kb_rag/tests -v
```

Đặt `PYTHONPATH=services/kb_rag` nếu chạy từ root. Hoặc chuyển vào thư mục service và chạy `python -m unittest discover -s tests -v`.

Chạy riêng service: tạo virtualenv Python3.12, cài `requirements.lock.txt`, sao chép `.env.example` thành `.env`, chỉnh endpoint Ollama/Neo4j và token của máy nhận, rồi chạy `python -m uvicorn kb_service.app:app --host 127.0.0.1 --port 8010`. Toàn hệ thống dùng mTLS trong Docker, không gọi trực tiếp API nội bộ từ browser.

Không đặt câu hỏi/đáp án của bộ test vào KB. Không coi LLM review hoặc số nút/đoạn là chứng nhận độ đúng. Snapshot hiện có phục vụ12 hồ sơ và ba PDF đã chọn trang, không phải toàn bộ các sách.
