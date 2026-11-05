"""
MODULE ĐẾM VÀ TỰ ĐỘNG CẮT REP ĐỘNG TÁC THỜI GIAN THỰC (REAL-TIME REP TRACKER) - BẢN NÂNG CẤP CHÍNH XÁC CAO
1. Giữ bộ đệm trước chuyển động và phát hiện đầu/cuối lượt bằng hình học.
2. Lọc khớp có độ tin cậy thấp; không dùng EMA trong bộ xử lý hiện tại.
3. Gửi chuỗi 32 mẫu tới bộ suy luận; V4 chuẩn hóa lại theo hợp đồng từng bài.
"""

from collections import deque
import time
import numpy as np

from enhanced_pose_processor import EnhancedPoseProcessor


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
        self.timestamp = 0.
        self.rep_started_at = None
        self.cooldown_until = 0.
        self.missing_since = None
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
        self.cooldown_frames = 0  # Chống bounce: số frame tối thiểu phải trôi qua trước khi kích hoạt rep mới
        self.floor_side = None
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
        self.cooldown_frames = 0
        self.rep_started_at = None
        self.cooldown_until = 0.
        self.missing_since = None
        self.last_rep_tensor = None
        self.last_raw_frames_count = 0
        self.floor_side = None

    def notify_missing(self, timestamp=None):
        now = time.monotonic() if timestamp is None else float(timestamp)
        if self.missing_since is None: self.missing_since = now
        if now-self.missing_since >= .75:
            self.state = 'CHỜ TOÀN THÂN' if self.current_exercise in ('squat','jump_jack') else 'READY'
            self.current_rep_frames = []
            self.pre_buffer.clear()
            self.rep_started_at = None
            self.baseline_hip_y = None
            self.max_descent_score = self.max_hip_drop = 0.
            self.min_indicator_in_rep = 180.
            return True
        return False

    def smooth_kpts(self, norm_kpts: np.ndarray) -> np.ndarray:
        """
        Lọc tọa độ khớp có độ tin cậy dưới 0,20 bằng EnhancedPoseProcessor.
        Tên hàm giữ tương thích; bộ xử lý hiện tại không nội suy khớp/EMA.
        """
        return self.pose_processor.process_frame(norm_kpts)

    def process_frame(self, raw_norm_kpts: np.ndarray, timestamp=None) -> dict:
        """
        Xử lý từng khung hình và cắt rep chính xác bằng cơ chế động học hỗn hợp.
        """
        self.timestamp = time.monotonic() if timestamp is None else float(timestamp)
        if self.current_exercise not in ('push_up','situp'):
            self.missing_since = None
        norm_kpts = self.smooth_kpts(raw_norm_kpts)
        kpts = norm_kpts[:2].copy()  # (2,17)
        if self.current_exercise in ('squat','jump_jack','push_up','situp'):
            kpts[0] *= self.analyzer.frame_aspect_ratio

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
        floor_angle = None
        if ex in ('push_up','situp'):
            triples=[(5,7,9),(6,8,10)] if ex=='push_up' else [(5,11,13),(6,12,14)]
            scores=[float(np.min(norm_kpts[2,list(joints)])) for joints in triples]
            valid_sides=[side for side,score in enumerate(scores) if score>=.25]
            if not valid_sides:
                self.notify_missing(self.timestamp)
                return {'exercise':ex,'rep_count':self.rep_count,
                        'state':'CHỜ KHỚP TAY' if ex=='push_up' else 'CHỜ KHỚP HÔNG/CHÂN',
                        'indicator':None,'last_result':None,'just_finished_rep':False,
                        'smoothed_kpts':norm_kpts,'need_full_body':True}
            side=self.floor_side if self.floor_side in valid_sides else max(valid_sides,key=lambda i:scores[i])
            if self.floor_side is not None and side!=self.floor_side:
                # Changing sides is not evidence that a repetition finished.
                self.state='READY';self.current_rep_frames=[];self.pre_buffer.clear()
                self.rep_started_at=None;self.min_indicator_in_rep=180.
            self.floor_side=side;self.missing_since=None
            a,b,c=triples[side]
            floor_angle=calc_angle(kpts[:,a],kpts[:,b],kpts[:,c])

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
                # Cập nhật baseline vị trí đứng thẳng ổn định khi ở READY (chống baseline drift)
                if hip_y <= self.baseline_hip_y + 0.08 * torso_len:
                    self.baseline_hip_y = 0.95 * self.baseline_hip_y + 0.05 * hip_y

            hip_drop = max(0.0, (hip_y - self.baseline_hip_y) / torso_len)
            knee_bend = max(0.0, (175.0 - k_ang) / 55.0)
            hip_bend = max(0.0, (170.0 - hip_ang) / 45.0)

            # Điểm số hạ người tổng hợp (0.0: đứng thẳng, > 0.30: bắt đầu hạ rep, > 0.40: đạt độ sâu)
            descent_score = max(knee_bend, hip_drop * 1.5, hip_bend * 0.8)

            # Bắt đầu rep: Phải có độ hạ thực sự (gối gập < 155° hoặc hông tụt > 0.15), loại bỏ nhún nhẹ/rung lắc
            if self.state == 'READY' and self.timestamp >= self.cooldown_until and descent_score > 0.35 and (k_ang < 155.0 or hip_drop > 0.15):
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
                # 1. Đã đạt độ sâu tối thiểu thực sự: min_indicator_in_rep <= 145° HOẶC max_hip_drop >= 0.20
                # 2. Đã phục hồi về tư thế đứng (k_ang >= 165° VÀ hông phải quay về gần vị trí ban đầu hip_drop <= 0.08)
                has_reached_depth = (self.min_indicator_in_rep <= 145.0 or self.max_hip_drop >= 0.20 or self.max_descent_score >= 0.45)
                
                # Phải thỏa mãn đồng thời: góc chân đứng thẳng và độ hạ hông đã triệt tiêu (người đã đứng dậy)
                is_standing_up = (descent_score <= 0.15 and hip_drop <= 0.08 and k_ang >= 162.0)
                enough_frames = len(self.current_rep_frames) >= 4 and self.rep_started_at is not None and self.timestamp-self.rep_started_at >= .4

                if has_reached_depth and is_standing_up and enough_frames:
                    finish_rep = True
                    self.baseline_hip_y = 0.8 * self.baseline_hip_y + 0.2 * hip_y
                    self.cooldown_frames = 15  # Khóa 15 frames (~0.5s) chống đếm lặp (double-count)
                    self.cooldown_until = self.timestamp + .35
                elif is_standing_up and not has_reached_depth and len(self.current_rep_frames) >= 8:
                    # Nhún nhẹ rồi đứng lại -> Hủy rep giả mạo, quay về READY
                    self.state = 'READY'
                    self.current_rep_frames = []
                    self.min_indicator_in_rep = 180.0
                    self.max_descent_score = 0.0
                    self.max_hip_drop = 0.0

        elif ex in ['push_up', 'bench_pressing']:
            ang_l = calc_angle(l_sh, l_el, l_wr)
            ang_r = calc_angle(r_sh, r_el, r_wr)
            val = floor_angle if ex=='push_up' else (ang_l + ang_r) / 2.0
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
            val = floor_angle
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
            self.rep_started_at = self.timestamp
            self.current_rep_frames = list(self.pre_buffer) + [norm_kpts]
            self.min_indicator_in_rep = self.indicator_value
        elif self.state == 'IN_REP':
            self.current_rep_frames.append(norm_kpts)

            # Giới hạn tối đa 240 frames (~8 giây ở 30fps) để người tập cực chậm (tempo slow pause) không bị cắt rep
            if len(self.current_rep_frames) > 900 or (self.rep_started_at is not None and self.timestamp-self.rep_started_at > 12.):
                self.state = 'READY'
                self.current_rep_frames = []
                self.min_indicator_in_rep = 180.0
                self.max_descent_score = 0.0
                self.max_hip_drop = 0.0

            # Hoàn thành 1 rep hợp lệ
            min_duration = 4 if ex == 'squat' else 12
            if finish_rep and len(self.current_rep_frames) >= min_duration:
                self.rep_count += 1
                self.last_raw_frames_count = len(self.current_rep_frames)
                self.analyzer.rep_duration_seconds = max(self.timestamp - (self.rep_started_at if self.rep_started_at is not None else self.timestamp), .1)
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
            self.pre_buffer.append(norm_kpts)
            if self.cooldown_frames > 0:
                self.cooldown_frames -= 1

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
