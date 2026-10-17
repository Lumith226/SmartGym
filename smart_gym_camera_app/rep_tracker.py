"""
MODULE ĐẾM VÀ TỰ ĐỘNG CẮT REP ĐỘNG TÁC THỜI GIAN THỰC (REAL-TIME REP TRACKER) - BẢN NÂNG CẤP CHÍNH XÁC CAO
1. Quản lý Pre-buffer: Chỉ bắt đầu ghi khi chuyển động thực sự diễn ra, LOẠI BỎ hoàn toàn các frame đứng yên chờ đợi (không làm loãng rep).
2. Làm mượt khung xương (EMA Filter): Khử rung lắc tọa độ khớp từ webcam.
3. Nhận diện chính xác pha chuyển động: Chuẩn hóa 32 frames đạt độ tin cậy tối đa.
"""

from collections import deque
import numpy as np

from enhanced_pose_processor import EnhancedPoseProcessor, sanitize_image_keypoints


def calc_angle(p1, p2, p3):
    v1 = np.array(p1) - np.array(p2)
    v2 = np.array(p3) - np.array(p2)
    n1, n2 = np.linalg.norm(v1), np.linalg.norm(v2)
    if n1 < 1e-6 or n2 < 1e-6:
        return 180.0
    cos_a = np.clip(np.dot(v1, v2) / (n1 * n2), -1.0, 1.0)
    return float(np.degrees(np.arccos(cos_a)))


class ExerciseRepTracker:
    """Bộ theo dõi và cắt rep chuẩn thời gian thực với độ chính xác cao."""

    def __init__(self, analyzer):
        self.analyzer = analyzer
        self.current_exercise = 'squat'
        self.rep_count = 0
        self.state = 'READY'  # 'READY', 'IN_REP'
        self.pre_buffer = deque(maxlen=6)  # Lưu 6 frame trước khi bắt đầu để rep mượt mà
        self.current_rep_frames = []
        self.last_result = None
        self.indicator_value = 0.0
        self.prev_kpts = None
        self.min_indicator_in_rep = 180.0
        self.baseline_hip_y = None
        self.max_descent_score = 0.0
        self.max_hip_drop = 0.0
        self.missing_leg_frames = 0
        # Tích hợp bộ xử lý 4 cải tiến cơ sinh học
        self.pose_processor = EnhancedPoseProcessor(self.current_exercise)

    def reset(self, new_exercise: str = None):
        if new_exercise:
            self.current_exercise = self.analyzer.normalize_exercise(new_exercise)
            proc_key = 'pushup' if 'push' in self.current_exercise else ('crunch' if 'sit' in self.current_exercise or 'crunch' in self.current_exercise else self.current_exercise)
            self.pose_processor.reset(proc_key)
        else:
            self.pose_processor.reset()
        self.rep_count = 0
        self.state = 'READY'
        self.pre_buffer.clear()
        self.current_rep_frames = []
        self.last_result = None
        self.indicator_value = 0.0
        self.prev_kpts = None
        self.min_indicator_in_rep = 180.0
        self.baseline_hip_y = None
        self.max_descent_score = 0.0
        self.max_hip_drop = 0.0
        self.missing_leg_frames = 0

    def smooth_kpts(self, norm_kpts: np.ndarray) -> np.ndarray:
        """
        Xử lý từng frame qua EnhancedPoseProcessor:
        1. Inpainting khi conf < 0.35
        2. Exercise-specific occlusion filters
        3. Ràng buộc độ dài xương giải phẫu
        4. Làm mượt động học EMA
        """
        return self.pose_processor.process_frame(norm_kpts)

    def reset_motion(self):
        """Discard an interrupted trajectory while preserving completed reps."""
        completed = self.rep_count
        self.reset()
        self.rep_count = completed

    def process_frame(self, raw_norm_kpts: np.ndarray, *, prefiltered=False,
                      model_keypoints=None) -> dict:
        """
        Xử lý từng khung hình và cắt rep chính xác bằng cơ chế động học hỗn hợp.
        """
        norm_kpts = (sanitize_image_keypoints(raw_norm_kpts) if prefiltered
                     else self.smooth_kpts(raw_norm_kpts))
        model_frame = (sanitize_image_keypoints(model_keypoints)
                       if model_keypoints is not None else norm_kpts)
        kpts = norm_kpts[:2]  # (2, 17)

        # 5: vai T, 6: vai P, 7: khuỷu T, 8: khuỷu P, 9: cổ tay T, 10: cổ tay P
        # 11: hông T, 12: hông P, 13: gối T, 14: gối P, 15: cổ chân T, 16: cổ chân P
        l_sh, r_sh = kpts[:, 5], kpts[:, 6]
        l_el, r_el = kpts[:, 7], kpts[:, 8]
        l_wr, r_wr = kpts[:, 9], kpts[:, 10]
        l_hip, r_hip = kpts[:, 11], kpts[:, 12]
        l_knee, r_knee = kpts[:, 13], kpts[:, 14]
        l_ank, r_ank = kpts[:, 15], kpts[:, 16]

        ex = self.current_exercise
        start_rep = False
        finish_rep = False
        need_full_body = False

        if ex in ['squat', 'squat_v1']:
            # Kiểm tra xem có thấy phần thân dưới (hông + gối) hay không
            hip_conf = max(norm_kpts[2, 11], norm_kpts[2, 12])
            knee_conf = max(norm_kpts[2, 13], norm_kpts[2, 14])
            ank_conf = max(norm_kpts[2, 15], norm_kpts[2, 16])
            lower_body_valid = (hip_conf >= 0.25 and knee_conf >= 0.25)

            if not lower_body_valid:
                # Đứng quá gần, camera chỉ thấy thân trên -> không thể tập squat
                if self.state != 'IN_REP':
                    self.state = 'CHỜ TOÀN THÂN'
                else:
                    self.missing_leg_frames += 1
                    if self.missing_leg_frames > 6:
                        self.state = 'CHỜ TOÀN THÂN'
                        self.current_rep_frames = []
                        self.min_indicator_in_rep = 180.0
                        self.max_descent_score = 0.0
                        self.max_hip_drop = 0.0
                self.indicator_value = 180.0
                return {
                    'exercise': ex,
                    'rep_count': self.rep_count,
                    'state': self.state,
                    'indicator': round(self.indicator_value, 1),
                    'last_result': self.last_result,
                    'just_finished_rep': False,
                    'rep_tensor_32': getattr(self, 'last_rep_tensor', None),
                    'raw_frames_count': getattr(self, 'last_raw_frames_count', 32),
                    'smoothed_kpts': norm_kpts,
                    'need_full_body': True
                }

            self.missing_leg_frames = 0
            if self.state == 'CHỜ TOÀN THÂN':
                self.state = 'READY'

            # 1. Góc gập gối (chỉ tính với các khớp có độ tin cậy >= 0.20)
            ang_l = calc_angle(l_hip, l_knee, l_ank) if (norm_kpts[2, 13] >= 0.20 and norm_kpts[2, 15] >= 0.20) else None
            ang_r = calc_angle(r_hip, r_knee, r_ank) if (norm_kpts[2, 14] >= 0.20 and norm_kpts[2, 16] >= 0.20) else None

            if ang_l is not None and ang_r is not None:
                k_ang = (ang_l + ang_r) / 2.0
            elif ang_l is not None:
                k_ang = ang_l
            elif ang_r is not None:
                k_ang = ang_r
            else:
                k_ang = 180.0
            self.indicator_value = k_ang

            # 2. Động học chuyển vị hông và gập hông (Bắt được cả squat nông & gù lưng Good-Morning)
            hip_y = float((l_hip[1] + r_hip[1]) / 2.0)
            sh_y = float((l_sh[1] + r_sh[1]) / 2.0)
            torso_len = max(abs(hip_y - sh_y), 0.08)

            l_hip_valid = (norm_kpts[2, 5] >= 0.25 and norm_kpts[2, 11] >= 0.25 and norm_kpts[2, 13] >= 0.25)
            r_hip_valid = (norm_kpts[2, 6] >= 0.25 and norm_kpts[2, 12] >= 0.25 and norm_kpts[2, 14] >= 0.25)
            if l_hip_valid and r_hip_valid:
                hip_ang = (calc_angle(l_sh, l_hip, l_knee) + calc_angle(r_sh, r_hip, r_knee)) / 2.0
            elif l_hip_valid:
                hip_ang = calc_angle(l_sh, l_hip, l_knee)
            elif r_hip_valid:
                hip_ang = calc_angle(r_sh, r_hip, r_knee)
            else:
                hip_ang = 175.0

            if self.baseline_hip_y is None:
                self.baseline_hip_y = hip_y
            elif self.state == 'READY':
                # Cập nhật baseline vị trí đứng thẳng ổn định
                if hip_y <= self.baseline_hip_y + 0.08 * torso_len:
                    self.baseline_hip_y = 0.95 * self.baseline_hip_y + 0.05 * hip_y

            hip_drop = max(0.0, (hip_y - self.baseline_hip_y) / torso_len)
            knee_bend = max(0.0, (175.0 - k_ang) / 55.0)
            hip_bend = max(0.0, (170.0 - hip_ang) / 45.0)

            # Điểm số hạ người tổng hợp (0.0: đứng thẳng, > 0.32: bắt đầu hạ rep, > 0.42: đạt độ sâu)
            descent_score = max(knee_bend, hip_drop * 1.5, hip_bend * 0.8)

            # Bắt đầu rep: Phải có độ hạ thực sự (gối gập < 162° hoặc hông tụt > 0.12), loại bỏ hoàn toàn rung lắc khi đứng
            if self.state == 'READY' and descent_score > 0.32 and (k_ang < 162.0 or hip_drop > 0.12):
                start_rep = True
                self.max_descent_score = descent_score
                self.min_indicator_in_rep = k_ang
                self.max_hip_drop = hip_drop
            elif self.state == 'IN_REP':
                if descent_score > self.max_descent_score:
                    self.max_descent_score = descent_score
                if k_ang < self.min_indicator_in_rep:
                    self.min_indicator_in_rep = k_ang
                if hip_drop > self.max_hip_drop:
                    self.max_hip_drop = hip_drop

                # Điều kiện hoàn thành rep:
                # 1. Đã đạt độ sâu tối thiểu: max_descent_score >= 0.42 HOẶC min_indicator_in_rep <= 150° HOẶC max_hip_drop >= 0.18
                # 2. Đã trở về vị trí đứng: descent_score < 0.18 HOẶC k_ang >= 158°
                # 3. Thời lượng hợp lý: >= 16 frames (~0.55s)
                has_reached_depth = (self.max_descent_score >= 0.42 or self.min_indicator_in_rep <= 150.0 or self.max_hip_drop >= 0.18)
                is_standing_up = (descent_score < 0.18 or k_ang >= 158.0)
                enough_frames = (len(self.current_rep_frames) >= 16)

                if has_reached_depth and is_standing_up and enough_frames:
                    finish_rep = True
                    self.baseline_hip_y = hip_y
                elif is_standing_up and not has_reached_depth and len(self.current_rep_frames) >= 8:
                    # Người dùng chỉ lắc nhẹ hoặc nhún nhẹ rồi đứng lại -> Hủy rep giả mạo, quay về READY
                    self.state = 'READY'
                    self.current_rep_frames = []
                    self.min_indicator_in_rep = 180.0
                    self.max_descent_score = 0.0
                    self.max_hip_drop = 0.0

        elif ex in ['push_up', 'bench_pressing']:
            ang_l = calc_angle(l_sh, l_el, l_wr)
            ang_r = calc_angle(r_sh, r_el, r_wr)
            val = (ang_l + ang_r) / 2.0
            self.indicator_value = val

            if self.state == 'READY' and val < 135.0:
                start_rep = True
            elif self.state == 'IN_REP':
                if val < self.min_indicator_in_rep:
                    self.min_indicator_in_rep = val
                if val > 145.0 and self.min_indicator_in_rep < 130.0 and len(self.current_rep_frames) >= 12:
                    finish_rep = True

        elif ex == 'pull_up':
            ang_l = calc_angle(l_sh, l_el, l_wr)
            ang_r = calc_angle(r_sh, r_el, r_wr)
            val = (ang_l + ang_r) / 2.0
            self.indicator_value = val

            # Bắt đầu kéo tay co dưới 135 độ
            if self.state == 'READY' and val < 135.0:
                start_rep = True
            elif self.state == 'IN_REP':
                if val < self.min_indicator_in_rep:
                    self.min_indicator_in_rep = val
                # Nhả hết tay trên 145 độ và đã từng kéo co dưới 100 độ
                if val > 145.0 and self.min_indicator_in_rep < 115.0 and len(self.current_rep_frames) >= 12:
                    finish_rep = True

        elif ex == 'situp':
            mid_sh = (l_sh + r_sh) / 2.0
            mid_hip = (l_hip + r_hip) / 2.0
            mid_knee = (l_knee + r_knee) / 2.0
            val = calc_angle(mid_sh, mid_hip, mid_knee)
            self.indicator_value = val

            if self.state == 'READY' and val < 115.0:
                start_rep = True
            elif self.state == 'IN_REP':
                if val < self.min_indicator_in_rep:
                    self.min_indicator_in_rep = val
                if val > 125.0 and self.min_indicator_in_rep < 105.0 and len(self.current_rep_frames) >= 12:
                    finish_rep = True

        elif ex == 'jump_jack':
            # Jump jack cần nhìn thấy cả chân để phân tích mở chân
            knee_conf = max(norm_kpts[2, 13], norm_kpts[2, 14])
            ank_conf = max(norm_kpts[2, 15], norm_kpts[2, 16])
            if knee_conf < 0.20 and ank_conf < 0.20:
                if self.state != 'IN_REP':
                    self.state = 'CHỜ TOÀN THÂN'
                return {
                    'exercise': ex,
                    'rep_count': self.rep_count,
                    'state': self.state,
                    'indicator': round(self.indicator_value, 1),
                    'last_result': self.last_result,
                    'just_finished_rep': False,
                    'rep_tensor_32': getattr(self, 'last_rep_tensor', None),
                    'raw_frames_count': getattr(self, 'last_raw_frames_count', 32),
                    'smoothed_kpts': norm_kpts,
                    'need_full_body': True
                }
            elif self.state == 'CHỜ TOÀN THÂN':
                self.state = 'READY'

            ang_l = calc_angle(l_hip, l_sh, l_wr)
            ang_r = calc_angle(r_hip, r_sh, r_wr)
            val = (ang_l + ang_r) / 2.0
            self.indicator_value = val

            if self.state == 'READY' and val > 75.0:
                start_rep = True
            elif self.state == 'IN_REP':
                if val < 50.0 and len(self.current_rep_frames) >= 12:
                    finish_rep = True

        # Quản lý bộ đệm khung xương
        just_finished = False

        if start_rep and self.state == 'READY':
            # Bắt đầu rep: Lấy 5 frame đệm trước đó + frame hiện tại
            self.state = 'IN_REP'
            self.current_rep_frames = list(self.pre_buffer) + [model_frame.copy()]
            self.min_indicator_in_rep = self.indicator_value
        elif self.state == 'IN_REP':
            self.current_rep_frames.append(model_frame.copy())

            # Giới hạn tối đa 90 frames (~3 giây) tránh kẹt trạng thái nếu đứng yên giữa chừng
            if len(self.current_rep_frames) > 90:
                self.state = 'READY'
                self.current_rep_frames = []
                self.min_indicator_in_rep = 180.0
                self.max_descent_score = 0.0
                self.max_hip_drop = 0.0

            # Hoàn thành 1 rep hợp lệ
            min_duration = 16 if ex in ['squat', 'squat_v1'] else 12
            if finish_rep and len(self.current_rep_frames) >= min_duration:
                self.rep_count += 1
                self.last_raw_frames_count = len(self.current_rep_frames)
                rep_32 = self.analyzer.resample_sequence(self.current_rep_frames, target_frames=32)
                eval_res = self.analyzer.predict_rep_tensor(rep_32, exercise_type=ex)
                self.last_result = eval_res
                self.last_rep_tensor = rep_32
                self.state = 'READY'
                self.current_rep_frames = []
                self.min_indicator_in_rep = 180.0
                self.max_descent_score = 0.0
                self.max_hip_drop = 0.0
                just_finished = True

        else:
            # Khi ở trạng thái READY: chỉ lưu rolling buffer 6 frames
            self.pre_buffer.append(model_frame.copy())

        return {
            'exercise': ex,
            'rep_count': self.rep_count,
            'state': self.state,
            'indicator': round(self.indicator_value, 1),
            'last_result': self.last_result,
            'just_finished_rep': just_finished,
            'rep_tensor_32': getattr(self, 'last_rep_tensor', None),
            'raw_frames_count': getattr(self, 'last_raw_frames_count', 32),
            'smoothed_kpts': norm_kpts,
            'need_full_body': need_full_body
        }

    def force_evaluate_current_buffer(self) -> dict:
        """Kích hoạt đánh giá thủ công ngay lập tức bằng buffer hiện tại."""
        frames_to_eval = self.current_rep_frames if len(self.current_rep_frames) >= 10 else list(self.pre_buffer)
        if len(frames_to_eval) < 6:
            return None
        self.rep_count += 1
        self.last_raw_frames_count = len(frames_to_eval)
        rep_32 = self.analyzer.resample_sequence(frames_to_eval, target_frames=32)
        eval_res = self.analyzer.predict_rep_tensor(rep_32, exercise_type=self.current_exercise)
        self.last_result = eval_res
        self.last_rep_tensor = rep_32
        self.state = 'READY'
        self.current_rep_frames = []
        self.min_indicator_in_rep = 180.0
        return eval_res, rep_32
