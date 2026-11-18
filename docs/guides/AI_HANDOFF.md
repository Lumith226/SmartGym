# Bàn giao dịch vụ AI

KB/RAG nằm trong `services/kb_rag`, giữ snapshot/vector/Cypher R3. Model tư thế là provider ngoài repository theo phạm vi bàn giao. Hướng dẫn endpoint, mTLS, contract và cách bật kết nối nằm trong [bàn giao chạy máy khác](BAN_GIAO_CHAY_MAY_KHAC.md#4-nối-dịch-vụ-model-riêng-khi-cần-video).

Hỏi kiến thức không cần provider video. Dữ liệu dự đoán dùng để làm bối cảnh, nguồn KB dùng làm căn cứ; không dùng JSON nhãn như lời khuyên chuyên môn đã xác nhận.
