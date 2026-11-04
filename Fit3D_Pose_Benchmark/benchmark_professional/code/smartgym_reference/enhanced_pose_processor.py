"""
MODULE XỬ LÝ KHUNG XƯƠNG NÂNG CAO (ENHANCED POSE PROCESSOR)
Tích hợp 4 kỹ thuật cơ sinh học và thị giác máy tính:
1. Exercise-specific Occlusion & Boundary Continuity Filter: Khử nhảy khớp do che khuất theo từng bài tập.
2. Root Centering / Pelvis Normalization: Chuẩn hóa theo tâm hông và tỷ lệ chiều cao thân trên.
3. Bone-Length Constancy Check: Ràng buộc độ dài xương sinh học không bị kéo dãn bất thường.
4. Temporal Momentum Extrapolation / Inpainting: Khôi phục khớp mờ nhòe/khuất dấu khi confidence thấp.
"""

import numpy as np

# 17 COCO Keypoints:
# 0: Mũi, 1: Mắt T, 2: Mắt P, 3: Tai T, 4: Tai P
# 5: Vai T, 6: Vai P, 7: Khuỷu T, 8: Khuỷu P, 9: Cổ tay T, 10: Cổ tay P
# 11: Hông T, 12: Hông P, 13: Gối T, 14: Gối P, 15: Cổ chân T, 16: Cổ chân P

BONE_PAIRS = [
    (5, 7), (7, 9),      # Tay trái (Bắp tay, Cẳng tay)
    (6, 8), (8, 10),     # Tay phải
    (11, 13), (13, 15),  # Chân trái (Đùi, Cẳng chân)
    (12, 14), (14, 16)   # Chân phải
]


class EnhancedPoseProcessor:
    """Bộ xử lý khung xương thông minh tích hợp 4 cải tiến cơ sinh học."""

    def __init__(self, exercise_type: str = 'squat'):
        self.exercise_type = exercise_type
        self.prev_kpts = None
        self.velocity = np.zeros((2, 17), dtype=np.float32)
        self.ref_bone_lengths = {}
        self.damping = 0.85

    def reset(self, new_exercise: str = None):
        if new_exercise:
            self.exercise_type = new_exercise
        self.prev_kpts = None
        self.velocity = np.zeros((2, 17), dtype=np.float32)
        self.ref_bone_lengths = {}

    def process_sequence(self, sequence_32: list or np.ndarray, apply_root_centering: bool = True) -> np.ndarray:
        """
        Xử lý toàn bộ chuỗi 32 frames (3, 32, 17) hoặc list of (3, 17).
        Trả về mảng chuẩn hóa chất lượng cao shape: (3, 32, 17).
        """
        if isinstance(sequence_32, np.ndarray) and sequence_32.shape == (3, 32, 17):
            raw_frames = [sequence_32[:, t, :] for t in range(32)]
        elif isinstance(sequence_32, list):
            raw_frames = sequence_32
        else:
            raw_frames = list(sequence_32)

        self.reset(self.exercise_type)
        processed_frames = []

        # Bước 1: Hiệu chỉnh động học qua từng frame liên tiếp
        for f in raw_frames:
            cur = self.process_frame(f.copy())
            processed_frames.append(cur)

        # Chuyển đổi thành array (32, 3, 17) -> transpose thành (3, 32, 17)
        arr = np.array(processed_frames, dtype=np.float32)  # (32, 3, 17)
        tensor_32 = np.transpose(arr, (1, 0, 2))            # (3, 32, 17)

        # Bước 2: Chuẩn hóa Root-Centering theo tâm hông và tỷ lệ thân trên
        if apply_root_centering:
            tensor_32 = self.normalize_root_centering(tensor_32)

        return tensor_32

    def process_frame(self, kpts: np.ndarray) -> np.ndarray:
        """
        Xử lý 1 frame tọa độ shape (3, 17):
        kpts[0] = x, kpts[1] = y, kpts[2] = confidence
        """
        cur = kpts.copy()
        conf = cur[2].copy()

        if self.prev_kpts is None:
            self.prev_kpts = cur.copy()
            # Khởi tạo độ dài xương tham chiếu ban đầu
            for p1, p2 in BONE_PAIRS:
                dist = np.linalg.norm(cur[:2, p1] - cur[:2, p2])
                if dist > 1e-4:
                    self.ref_bone_lengths[(p1, p2)] = dist
            return cur

        prev = self.prev_kpts.copy()

        # =====================================================================
        # 1. ĐỀ XUẤT 4: NGOẠI SUY VẬN TỐC / INPAINTING THÔNG MINH
        # Chỉ bù quán tính nếu frame trước đã từng theo dõi được khớp hợp lệ
        # Tránh tuyệt đối nội suy từ tọa độ rác (0,0) khi người dùng vừa bước vào khung hình
        # =====================================================================
        for j in range(17):
            prev_valid = (prev[2, j] >= 0.25 and np.linalg.norm(prev[:2, j]) > 0.02)
            if conf[j] < 0.25:
                if prev_valid:
                    # Dùng vận tốc quán tính để nội suy vị trí nếu frame trước từng thấy rõ
                    predicted_pos = prev[:2, j] + self.velocity[:, j] * self.damping
                    cur[:2, j] = predicted_pos
                    cur[2, j] = max(0.20, prev[2, j] * 0.85)  # Giảm dần độ tin cậy
                else:
                    # Khớp chưa từng xuất hiện hoặc ngoài khung hình -> giữ nguyên 0
                    cur[:2, j] = 0.0
                    cur[2, j] = 0.0
            else:
                # Khớp mới xuất hiện từ ngoài vào khung hình (ví dụ vừa lùi bước thấy chân)
                if not prev_valid:
                    prev[:2, j] = cur[:2, j]
                    prev[2, j] = cur[2, j]

        # =====================================================================
        # 2. ĐỀ XUẤT 1: BỘ LỌC CHE KHUẤT THEO TỪNG BÀI TẬP (EXERCISE-SPECIFIC OCCLUSION)
        # =====================================================================
        ex = self.exercise_type.lower()
        if 'squat' in ex:
            # Gối T (13), Gối P (14) bị che bởi Cổ tay/Khuỷu tay (7, 9, 8, 10)
            for (k_idx, h_idx, w_indices) in [(13, 11, [7, 9]), (14, 12, [8, 10])]:
                if cur[2, k_idx] > 0.20:
                    k_pt = cur[:2, k_idx]
                    prev_k = prev[:2, k_idx]
                    min_hand_dist = min([np.linalg.norm(k_pt - cur[:2, w]) for w in w_indices])
                    k_vel = np.linalg.norm(k_pt - prev_k)
                    if min_hand_dist < 0.038 and k_vel > 0.035:
                        hip_disp = cur[:2, h_idx] - prev[:2, h_idx]
                        cur[:2, k_idx] = prev_k + hip_disp

        elif 'pushup' in ex or 'push_up' in ex:
            # Khuỷu tay T (7), Khuỷu P (8) bị che hoặc gập sâu sát sàn
            for (el_idx, sh_idx, wr_idx) in [(7, 5, 9), (8, 6, 10)]:
                if cur[2, el_idx] > 0.20:
                    el_pt = cur[:2, el_idx]
                    prev_el = prev[:2, el_idx]
                    sh_wr_dist = np.linalg.norm(cur[:2, sh_idx] - cur[:2, wr_idx])
                    el_vel = np.linalg.norm(el_pt - prev_el)
                    if el_vel > 0.045 and sh_wr_dist > 0.05:
                        cur[:2, el_idx] = prev_el + (cur[:2, sh_idx] - prev[:2, sh_idx]) * 0.5

        elif 'jump' in ex or 'jack' in ex:
            for w_idx in [9, 10]:
                if cur[1, w_idx] < 0.01:
                    cur[1, w_idx] = max(0.01, prev[1, w_idx])

        elif 'crunch' in ex or 'situp' in ex or 'v_up' in ex:
            for (k_idx, h_idx) in [(13, 11), (14, 12)]:
                dist = np.linalg.norm(cur[:2, k_idx] - cur[:2, h_idx])
                if dist < 0.02 and cur[2, k_idx] > 0.20:
                    dir_vec = cur[:2, k_idx] - cur[:2, h_idx]
                    dir_norm = np.linalg.norm(dir_vec) + 1e-6
                    cur[:2, k_idx] = cur[:2, h_idx] + (dir_vec / dir_norm) * 0.03

        # =====================================================================
        # 3. ĐỀ XUẤT 3: RÀNG BUỘC ĐỘ DÀI XƯƠNG CỐ ĐỊNH CHUẨN THEO THÂN TRÊN (TORSO-SCALED)
        # Bất biến tuyệt đối với cự ly: dù đứng gần hay lùi xa, tỷ lệ xương luôn chuẩn xác
        # =====================================================================
        mid_sh = (cur[:2, 5] + cur[:2, 6]) / 2.0
        mid_hip = (cur[:2, 11] + cur[:2, 12]) / 2.0
        sh_hip_conf = min(max(cur[2, 5], cur[2, 6]), max(cur[2, 11], cur[2, 12]))
        torso_len = max(float(np.linalg.norm(mid_sh - mid_hip)), 0.08) if sh_hip_conf > 0.25 else 0.20

        # Giới hạn giải phẫu học tối đa so với thân trên (đùi ~ 1.25, cẳng chân ~ 1.25, tay ~ 1.0)
        bone_max_ratios = {
            (11, 13): 1.35, (12, 14): 1.35,  # Xương đùi T & P
            (13, 15): 1.30, (14, 16): 1.30,  # Xương cẳng chân T & P
            (5, 7): 1.15, (6, 8): 1.15,      # Bắp tay
            (7, 9): 1.10, (8, 10): 1.10      # Cẳng tay
        }

        for p1, p2 in BONE_PAIRS:
            if cur[2, p1] >= 0.20 and cur[2, p2] >= 0.20:
                curr_len = np.linalg.norm(cur[:2, p1] - cur[:2, p2])
                max_allowed = bone_max_ratios.get((p1, p2), 1.25) * torso_len
                if curr_len > max_allowed:
                    vec = cur[:2, p2] - cur[:2, p1]
                    vec_norm = np.linalg.norm(vec) + 1e-6
                    cur[:2, p2] = cur[:2, p1] + (vec / vec_norm) * (max_allowed * 0.95)

        # =====================================================================
        # 4. CẬP NHẬT VẬN TỐC & LÀM MƯỢT ĐỘNG HỌC EMA
        # Chỉ làm mượt khi cả 2 frame liên tiếp đều có dữ liệu hợp lệ
        # =====================================================================
        self.velocity = cur[:2] - prev[:2]
        smoothed = np.zeros_like(cur)
        for j in range(17):
            if prev[2, j] >= 0.20 and cur[2, j] >= 0.20:
                smoothed[:2, j] = 0.75 * cur[:2, j] + 0.25 * prev[:2, j]
                smoothed[2, j] = 0.75 * cur[2, j] + 0.25 * prev[2, j]
            else:
                smoothed[:, j] = cur[:, j]

        self.prev_kpts = smoothed.copy()
        return smoothed

    @staticmethod
    def normalize_root_centering(kpts: np.ndarray) -> np.ndarray:
        """
        ĐỀ XUẤT 2: CHUẨN HÓA TÂM HÔNG (ROOT CENTERING / MID-HIP NORMALIZATION)
        Trừ tọa độ cho tâm hông và chia cho chiều dài thân trên (Torso Scale).
        Hỗ trợ cả (3, 17) lẫn (3, 32, 17).
        """
        out = kpts.copy()
        if out.ndim == 2:  # (3, 17)
            mid_hip = (out[:2, 11] + out[:2, 12]) / 2.0
            mid_sh = (out[:2, 5] + out[:2, 6]) / 2.0
            torso_len = max(float(np.linalg.norm(mid_sh - mid_hip)), 0.05)
            # Đưa về tâm hông
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
