"""
MODULE XỬ LÝ KHUNG XƯƠNG SẠCH (CLEAN POSE PROCESSOR - BẢN NÂNG CẤP V3)
Loại bỏ hoàn toàn các bộ lọc rule-based cứng nhắc (Dead Reckoning Inpainting, Occlusion Rule,
Bone Length Clipping, EMA Low-pass) nhằm giữ nguyên vẹn 100% tín hiệu lỗi từ RTMPose-M.

Chỉ giữ lại 2 bước xử lý chuẩn mực thị giác máy tính:
1. Confidence Masking: Khớp có confidence < 0.20 được đưa về 0 để loại trừ nhiễu nền.
2. Root Centering / Pelvis Normalization: Chuẩn hóa affine bất biến tỷ lệ theo tâm hông và chiều dài thân trên.
"""

import numpy as np


class EnhancedPoseProcessor:
    """Bộ xử lý khung xương tinh gọn, bảo toàn 100% đặc trưng lỗi cho ST-GCN++."""

    def __init__(self, exercise_type: str = 'squat'):
        self.exercise_type = exercise_type

    def reset(self, new_exercise: str = None):
        if new_exercise:
            self.exercise_type = new_exercise

    def process_sequence(self, sequence_32: list or np.ndarray, apply_root_centering: bool = True) -> np.ndarray:
        """
        Xử lý chuỗi 32 frames (3, 32, 17) hoặc list of (3, 17).
        Trả về mảng chuẩn hóa shape (3, 32, 17).
        """
        if isinstance(sequence_32, np.ndarray) and sequence_32.shape == (3, 32, 17):
            tensor_32 = sequence_32.copy()
        elif isinstance(sequence_32, list):
            arr = np.array(sequence_32, dtype=np.float32)  # (32, 3, 17)
            tensor_32 = np.transpose(arr, (1, 0, 2))       # (3, 32, 17)
        else:
            arr = np.array(list(sequence_32), dtype=np.float32)
            tensor_32 = np.transpose(arr, (1, 0, 2))

        # 1. Confidence Masking: Khớp nào conf < 0.20 thì gán tọa độ = 0 để tránh nhiễu
        for t in range(tensor_32.shape[1]):
            low_conf_mask = tensor_32[2, t, :] < 0.20
            tensor_32[0, t, low_conf_mask] = 0.0
            tensor_32[1, t, low_conf_mask] = 0.0

        # 2. Chuẩn hóa Root Centering theo tâm hông (Scale-invariant Affine Normalization)
        if apply_root_centering:
            tensor_32 = self.normalize_root_centering(tensor_32)

        return tensor_32

    def process_frame(self, kpts: np.ndarray) -> np.ndarray:
        """
        Xử lý frame đơn lẻ (3, 17).
        """
        cur = kpts.copy()
        low_conf = cur[2, :] < 0.20
        cur[0, low_conf] = 0.0
        cur[1, low_conf] = 0.0
        return cur

    @staticmethod
    def normalize_root_centering(kpts: np.ndarray) -> np.ndarray:
        """
        CHUẨN HÓA TÂM HÔNG (ROOT CENTERING / MID-HIP NORMALIZATION):
        Trừ tọa độ cho tâm hông và chia cho chiều dài thân trên (Torso Scale).
        Hỗ trợ cả (3, 17) lẫn (3, T, 17).
        """
        out = kpts.copy()
        if out.ndim == 2:  # (3, 17)
            mid_hip = (out[:2, 11] + out[:2, 12]) / 2.0
            mid_sh = (out[:2, 5] + out[:2, 6]) / 2.0
            torso_len = max(float(np.linalg.norm(mid_sh - mid_hip)), 0.05)
            out[0, :] = (out[0, :] - mid_hip[0]) / torso_len
            out[1, :] = (out[1, :] - mid_hip[1]) / torso_len
        elif out.ndim == 3:  # (3, T, 17)
            for t in range(out.shape[1]):
                mid_hip = (out[:2, t, 11] + out[:2, t, 12]) / 2.0
                mid_sh = (out[:2, t, 5] + out[:2, t, 6]) / 2.0
                torso_len = max(float(np.linalg.norm(mid_sh - mid_hip)), 0.05)
                out[0, t, :] = (out[0, t, :] - mid_hip[0]) / torso_len
                out[1, t, :] = (out[1, t, :] - mid_hip[1]) / torso_len

        return out
