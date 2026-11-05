"""
MODULE GHI NHẬT KÝ CHI TIẾT ĐỘNG TÁC & TỌA ĐỘ KHỚP (SESSION LOGGER V4)
Hỗ trợ UTF-8 an toàn trên Windows terminal và Excel.
Ghi nhận toàn diện cho từng rep tập:
1. File CSV/Excel: logs/{session}/summary.csv
2. File JSONL: logs/{session}/details.jsonl
3. Mảng NumPy .npy: logs/{session}/tensors/rep_XXX_*.npy
"""

import os
import sys
import csv
import json
import time
from datetime import datetime
import numpy as np

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

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
        now_str = datetime.now().strftime("%H:%M:%S")
        correct = eval_res.get('is_correct')
        is_corr_str = "KHÔNG THẤY VẤN ĐỀ RÕ RÀNG" if correct is True else ("CÓ LỖI SAI" if correct is False else "CHƯA KẾT LUẬN")
        conf_pct = round(eval_res.get('confidence', 0.0) * 100, 2)
        latency = eval_res.get('latency_ms', 0.0)
        class_code = eval_res.get('class_code', 'UNKNOWN')
        class_name_vi = eval_res.get('class_name_vi', '')
        feedback_vi = eval_res.get('feedback_vi', '')
        camera_view_vi = eval_res.get('camera_view_vi', 'Chính diện / Khác')

        # 1. Lưu file mảng tọa độ 17 khớp chuẩn NumPy (3, 32, 17)
        safe_code = "".join([c if c.isalnum() else "_" for c in str(class_code)])[:30]
        tensor_filename = f"rep_{rep_num:03d}_{exercise}_{safe_code}_{int(conf_pct)}pct.npy"
        tensor_filepath = os.path.join(self.tensors_dir, tensor_filename)
        
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

        # 3. Ghi vào file JSONL chi tiết
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
            "class_code": class_code,
            "class_name_vi": class_name_vi,
            "confidence": eval_res.get('confidence', 0.0),
            "probabilities": eval_res.get('probabilities', {}),
            "biomechanics": eval_res.get('biomechanics', {}),
            "feedback_vi": feedback_vi,
            "latency_ms": latency,
            "raw_frames_count": raw_frame_count,
            "tensor_file": os.path.join("tensors", tensor_filename)
        }
        detail_record.update({key:eval_res.get(key) for key in
                              ['scope','schema_version','status','quality','label_results','detected_labels','comparison',
                               'duration_seconds','stored_rep_coordinate_system','frame_aspect_ratio']})
        detail_record['review_notes'] = eval_res.get('review_notes',[])

        with open(self.jsonl_path, mode='a', encoding='utf-8') as f:
            f.write(json.dumps(detail_record, ensure_ascii=False) + "\n")

        print(f"  [ĐÃ LƯU LOG & TỌA ĐỘ]: {tensor_filename} -> {self.csv_path}")
