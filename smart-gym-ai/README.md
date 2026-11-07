# 🏋️ Smart Gym AI

Hệ thống đánh giá tư thế tập luyện thông minh sử dụng AI.

**Bàn giao FE/BE ngày 07/11/2026:** đọc [HUONG_DAN_BAN_GIAO_FE_BE.md](HUONG_DAN_BAN_GIAO_FE_BE.md) trước khi chạy. `frontend/` và `backend/` là bản nháp cần làm lại; chatbot hiện hành nằm trong `services/kb_rag/` và dùng `POST /v1/chatbot`. Code, tiêu chí KB, danh mục nguồn và hợp đồng model được bàn giao cùng nhau. PDF gốc, index sinh tự động, `.env`, môi trường cài đặt và log thử nghiệm không được đưa lên Git; cần chuẩn bị dữ liệu theo hướng dẫn. Không coi việc clone repo là đã có sẵn corpus hoặc trọng số trên máy.

## KB và RAG

Phần KB/RAG đã có service riêng tại [`services/kb_rag`](services/kb_rag/README.md), pipeline thu thập tài liệu, truy xuất có nguồn, adapter Ollama và Neo4j. Backend AI Coach gọi service qua HTTP. Xem hướng dẫn trong thư mục này để thêm sách PDF, tải model và chạy thử độc lập với dataset DL.

## Công nghệ

| Layer | Stack |
|---|---|
| Frontend | Next.js 16.3.8 · React 19.2.8 · TypeScript · Tailwind CSS 4 |
| Backend | FastAPI · Python 3.11 · SQLAlchemy 2.0 |
| Database | PostgreSQL 16 |
| AI Core (TV1) | YOLOv8-Pose · ST-GCN++ · ONNX Runtime |
| KB + RAG (TV2) | FastAPI service · BM25 + Knowledge Graph + vector · Ollama Qwen3 · Neo4j |
| Infrastructure | Docker Compose |

## Cấu trúc dự án

```
smart-gym-ai/
├── backend/
│   ├── main.py              ← FastAPI entry
│   ├── core/
│   │   ├── config.py        ← Settings
│   │   ├── database.py      ← Async DB
│   │   └── security.py      ← JWT + Auth
│   ├── models/
│   │   ├── db_models.py     ← SQLAlchemy ORM
│   │   └── schemas.py       ← Pydantic
│   ├── routers/
│   │   ├── auth.py          ← /api/v1/auth/*
│   │   ├── profile.py       ← /api/v1/profile/*
│   │   ├── session.py       ← /api/v1/session/*, /ws/*
│   │   └── coach.py         ← /api/v1/coach/*
│   └── modules/
│       ├── ai_core/         ← [TV1] YOLOv8 + ST-GCN++
│       └── kb_rag/          ← [TV2] Neo4j + ChromaDB + LLM
├── frontend/
│   └── src/app/
│       ├── page.tsx         ← Landing page
│       ├── login/           ← Đăng nhập
│       ├── register/        ← Đăng ký
│       └── dashboard/
│           ├── page.tsx     ← Tổng quan
│           ├── studio/      ← Live Workout + WebSocket
│           ├── progress/    ← Tiến trình [TV3]
│           ├── planner/     ← Kế hoạch [TV3+TV2]
│           └── profile/     ← Hồ sơ
└── docker-compose.yml
```

## Khởi động DEV (không Docker)

### Backend
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env   # Đã tự động tạo
uvicorn main:app --reload --port 8000
# API docs: http://localhost:8000/docs
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# App: http://localhost:3000
```

### Database (Docker chỉ PostgreSQL)
```bash
docker run -d \
  --name smartgym_postgres \
  -e POSTGRES_USER=smartgym \
  -e POSTGRES_PASSWORD=smartgym123 \
  -e POSTGRES_DB=smartgymdb \
  -p 5432:5432 \
  postgres:16-alpine
```

## Khởi động với Docker Compose (toàn bộ)
```bash
docker compose up -d
```

## API Endpoints

| Method | Path | Mô tả |
|---|---|---|
| POST | /api/v1/auth/register | Đăng ký |
| POST | /api/v1/auth/login | Đăng nhập |
| GET | /api/v1/auth/me | Thông tin user hiện tại |
| GET/PUT | /api/v1/profile | Xem/cập nhật hồ sơ |
| POST | /api/v1/profile/weight | Ghi cân nặng |
| POST | /api/v1/session/start | Bắt đầu session |
| POST | /api/v1/session/{id}/end | Kết thúc session |
| WS | /ws/stream/{session_id} | AI Core stream |
| POST | /api/v1/coach/chat | AI Coach chat |
| POST | /api/v1/coach/explain-rep | Giải thích rep lỗi |
| GET | /api/health | Health check |

## TV Placeholder Hooks

Mỗi TV có hook rõ ràng để implement module của mình:

**TV1 – Lưu Minh Thắng:**
→ `backend/routers/session.py` → hàm `_placeholder_ai_process()`
→ Thay bằng: YOLOv8-Pose → FSM → Gatekeeper → ST-GCN++ → DTW

**TV2 – Phan Hoàng An:**
→ `backend/routers/coach.py` → HTTP gateway tới `services/kb_rag`
→ Xem `services/kb_rag/README.md`; cần thêm sách PDF, cài model Ollama và kiểm tra luồng tích hợp với DL thật.

**TV3 – Nguyễn Lưu Thanh Tùng:**
→ `frontend/src/app/dashboard/progress/page.tsx` → implement charts
→ `frontend/src/app/dashboard/planner/page.tsx` → implement planner UI
→ `backend/routers/` → thêm admin, analytics routes

## Giao diện

- 🌑 Dark theme premium
- 🟠 Orange accent color
- 📱 Responsive (mobile-first)
- ✨ Glassmorphism cards + glow buttons
- 🎞️ Fade-in animations + pulse indicators
