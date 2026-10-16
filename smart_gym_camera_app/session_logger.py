"""
MODULE GHI NHẬT KÝ CHI TIẾT ĐỘNG TÁC & TỌA ĐỘ KHỚP (SESSION LOGGER)
Ghi nhận toàn diện cho từng rep tập:
1. File CSV/Excel: logs/{session}/summary.csv (dễ mở xem bảng tổng hợp)
2. File JSONL: logs/{session}/details.jsonl (lưu toàn bộ xác suất và metadata)
3. Mảng NumPy .npy: logs/{session}/tensors/rep_XXX_*.npy chứa toàn bộ mảng (3, 32, 17) tọa độ khớp
để bạn có thể phân tích, vẽ lại biểu đồ hoặc kiểm tra lại bất cứ lúc nào!
"""

import os
import csv
import json
import time
from datetime import datetime
import numpy as np

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
LOGS_ROOT = os.path.join(CURRENT_DIR, 'logs')


class SessionLogger:
    """Bộ ghi nhật ký tập luyện chi tiết cho từng phiên làm việc."""

    def __init__(self, logs_root: str = None):
        target_root = logs_root if logs_root else LOGS_ROOT
        os.makedirs(target_root, exist_ok=True)
        self.session_time_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.session_dir = os.path.join(target_root, f"session_{self.session_time_str}")
        self.tensors_dir = os.path.join(self.session_dir, "tensors")
        os.makedirs(self.tensors_dir, exist_ok=True)

        self.csv_path = os.path.join(self.session_dir, "summary.csv")
        self.jsonl_path = os.path.join(self.session_dir, "details.jsonl")

        # Khởi tạo header cho CSV
        with open(self.csv_path, mode='w', newline='', encoding='utf-8-sig') as f:
            writer = csv.writer(f)
            writer.writerow([
                "STT Rep",
                "Thời gian",
                "Nguồn (Video / Webcam)",
                "Bài tập",
                "Góc nhìn Camera",
                "Trạng thái",
                "Kết quả đánh giá",
                "Mã lỗi",
                "Độ tin cậy (%)",
                "Lời khuyên HLV sửa lỗi",
                "Độ trễ ONNX (ms)",
                "Số frame gốc",
                "File tọa độ 17 khớp (.npy)"
            ])

        print(f">>> ĐÃ KHỞI TẠO BỘ GHI NHẬT KÝ TẠI: {self.session_dir}")

    def log_rep(self, rep_num: int, exercise: str, eval_res: dict, rep_tensor: np.ndarray, raw_frame_count: int = 32, source_name: str = "Webcam"):
        """
        Ghi lại toàn bộ thông tin 1 rep từ kết quả đánh giá đến mảng tọa độ (3, 32, 17).
        """
        now_str = datetime.now().strftime("%H:%M:%S")
        is_corr_str = "ĐÚNG FORM" if eval_res.get('is_correct') else "CÓ LỖI SAI"
        conf_pct = round(eval_res.get('confidence', 0.0) * 100, 2)
        latency = eval_res.get('latency_ms', 0.0)
        class_code = eval_res.get('class_code', 'UNKNOWN')
        class_name_vi = eval_res.get('class_name_vi', '')
        feedback_vi = eval_res.get('feedback_vi', '')
        camera_view_vi = eval_res.get('camera_view_vi', 'Chính diện / Khác')

        # 1. Lưu file mảng tọa độ 17 khớp chuẩn NumPy (3, 32, 17)
        tensor_filename = f"rep_{rep_num:03d}_{exercise}_{class_code}_{int(conf_pct)}pct.npy"
        tensor_filepath = os.path.join(self.tensors_dir, tensor_filename)
        
        # Đảm bảo mảng có shape chuẩn (3, 32, 17)
        clean_tensor = rep_tensor.squeeze()
        if clean_tensor.ndim == 3 and clean_tensor.shape == (3, 32, 17):
            np.save(tensor_filepath, clean_tensor.astype(np.float32))
        else:
            np.save(tensor_filepath, rep_tensor.astype(np.float32))

        # 2. Ghi 1 dòng vào bảng CSV
        with open(self.csv_path, mode='a', newline='', encoding='utf-8-sig') as f:
            writer = csv.writer(f)
            writer.writerow([
                rep_num,
                now_str,
                source_name,
                eval_res.get('exercise_name_vi', exercise),
                camera_view_vi,
                is_corr_str,
                class_name_vi,
                class_code,
                f"{conf_pct}%",
                feedback_vi,
                latency,
                raw_frame_count,
                tensor_filename
            ])

        # 3. Ghi vào file JSONL chi tiết (chứa đầy đủ xác suất 4 lớp, góc nhìn và lời khuyên)
        detail_record = {
            "rep_num": rep_num,
            "timestamp": datetime.now().isoformat(),
            "source_name": source_name,
            "exercise": exercise,
            "exercise_name_vi": eval_res.get('exercise_name_vi', exercise),
            "camera_view": eval_res.get('camera_view', 'UNKNOWN'),
            "camera_view_vi": camera_view_vi,
            "view_note": eval_res.get('view_note', ''),
            "is_correct": eval_res.get('is_correct', False),
            "class_id": eval_res.get('class_id', 0),
            "class_code": class_code,
            "class_name_vi": class_name_vi,
            "confidence": eval_res.get('confidence', 0.0),
            "probabilities": eval_res.get('probabilities', {}),
            "raw_probabilities": eval_res.get('raw_probabilities', {}),
            "biomechanics": eval_res.get('biomechanics', {}),
            "feedback_vi": feedback_vi,
            "latency_ms": latency,
            "raw_frames_count": raw_frame_count,
            "tensor_file": os.path.join("tensors", tensor_filename)
        }

        with open(self.jsonl_path, mode='a', encoding='utf-8') as f:
            f.write(json.dumps(detail_record, ensure_ascii=False) + "\n")

        print(f"  [ĐÃ LƯU LOG & TỌA ĐỘ]: {tensor_filename} -> {self.csv_path}")

    def open_folder(self):
        """Mở trực tiếp thư mục chứa file log trong File Explorer của Windows."""
        try:
            if os.name == 'nt' and os.path.exists(self.session_dir):
                os.startfile(self.session_dir)
                print(f">>> Đã mở thư mục log trong Windows Explorer: {self.session_dir}")
        except Exception as e:
            print(f"[ERROR] Không thể mở thư mục: {e}")

    def get_summary_stats(self) -> dict:
        """Đọc lại log và tạo thống kê tóm tắt phiên test."""
        reps = []
        if os.path.exists(self.jsonl_path):
            with open(self.jsonl_path, 'r', encoding='utf-8') as f:
                for line in f:
                    if line.strip():
                        reps.append(json.loads(line))
        
        total = len(reps)
        correct = sum(1 for r in reps if r.get('is_correct'))
        errors = total - correct
        return {
            'total_reps': total,
            'correct_reps': correct,
            'error_reps': errors,
            'accuracy': (correct / total * 100) if total > 0 else 0.0,
            'csv_path': self.csv_path,
            'jsonl_path': self.jsonl_path,
            'session_dir': self.session_dir,
            'reps': reps
        }

