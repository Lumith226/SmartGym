"""
BỘ SUY LUẬN ĐA ĐỘNG TÁC GYM BẰNG ONNX RUNTIME (ONNX GYM ANALYZER)
Tối ưu hóa đa nền tảng, không phụ thuộc vào thư viện PyTorch đồ sộ.
Tốc độ suy luận siêu tốc: ~5ms trên CPU / ~2ms trên GPU.
"""

import os
import sys
import time
import numpy as np
import onnxruntime as ort

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
WEIGHTS_DIR = os.path.join(CURRENT_DIR, 'weights')

from enhanced_pose_processor import EnhancedPoseProcessor, sanitize_image_keypoints

EXERCISE_CONFIG = {
    'squat': {
        'name_vi': 'Gánh đùi (Squat V2 - Qualcomm)',
        'onnx_file': 'best_stgcnpp_squat_v2.onnx',
        'classes': ['CORRECT', 'BACK_ROUNDING', 'KNEE_ALIGNMENT', 'SHALLOW_DEPTH'],
        'details': {
            'CORRECT': {
                'name_vi': 'Đúng chuẩn kỹ thuật',
                'feedback': 'Rất tốt! Cột sống thẳng, đùi hạ ngang hoặc sâu hơn gối.'
            },
            'BACK_ROUNDING': {
                'name_vi': 'Gù lưng / Đổ thân về trước',
                'feedback': 'Lưng bị cong hoặc đổ người quá nhiều. Hãy ưỡn ngực, mắt nhìn thẳng và siết chặt cơ bụng.'
            },
            'KNEE_ALIGNMENT': {
                'name_vi': 'Sai trục gối / Chân quá hẹp',
                'feedback': 'Khoảng cách hai chân quá hẹp hoặc gối sai trục. Hãy mở chân bằng vai và hướng gối theo mũi chân.'
            },
            'SHALLOW_DEPTH': {
                'name_vi': 'Xuống chưa đủ độ sâu',
                'feedback': 'Độ sâu chưa đạt mức song song. Hãy hạ hông sâu hơn để kích hoạt cơ mông và đùi sau.'
            }
        }
    },
    'squat_v1': {
        'name_vi': 'Gánh đùi (Squat V1 cũ)',
        'onnx_file': 'best_stgcnpp_squat.onnx',
        'classes': ['CORRECT', 'BACK_ROUNDING', 'KNEE_VALGUS', 'SHALLOW_DEPTH'],
        'details': {
            'CORRECT': {
                'name_vi': 'Đúng chuẩn kỹ thuật',
                'feedback': 'Rất tốt! Cột sống thẳng, đùi hạ ngang hoặc sâu hơn gối.'
            },
            'BACK_ROUNDING': {
                'name_vi': 'Gù lưng / Đổ thân về trước',
                'feedback': 'Lưng bị cong hoặc đổ người quá nhiều. Hãy ưỡn ngực, mắt nhìn thẳng và siết chặt cơ bụng.'
            },
            'KNEE_VALGUS': {
                'name_vi': 'Chụm đầu gối vào trong',
                'feedback': 'Khớp gối sụp vào trong. Hãy chủ động mở rộng đầu gối hướng theo mũi chân.'
            },
            'SHALLOW_DEPTH': {
                'name_vi': 'Xuống chưa đủ độ sâu',
                'feedback': 'Độ sâu chưa đạt mức song song. Hãy hạ hông sâu hơn để kích hoạt cơ mông và đùi sau.'
            }
        }
    },
    'push_up': {
        'name_vi': 'Chống đẩy (Push-up V2 - Qualcomm)',
        'onnx_file': 'best_stgcnpp_pushup_v2.onnx',
        'classes': ['CORRECT', 'SHALLOW_DEPTH', 'HIP_ALIGNMENT', 'HAND_PLACEMENT'],
        'details': {
            'CORRECT': {
                'name_vi': 'Đúng chuẩn kỹ thuật',
                'feedback': 'Rất tốt! Thân người thẳng như một tấm ván, ngực hạ sâu sát sàn.'
            },
            'SHALLOW_DEPTH': {
                'name_vi': 'Chống đẩy nông / Nửa vời',
                'feedback': 'Khuỷu tay chưa gập đủ sâu. Hãy hạ ngực cách mặt sàn khoảng 5-10cm để tối ưu cơ ngực.'
            },
            'HIP_ALIGNMENT': {
                'name_vi': 'Lệch hông / Võng sụp hông',
                'feedback': 'Hông bị võng chùng hoặc nhô quá cao. Hãy siết chặt cơ bụng và cơ mông để giữ thẳng trục thân.'
            },
            'HAND_PLACEMENT': {
                'name_vi': 'Đặt tay quá rộng hoặc quá hẹp',
                'feedback': 'Khoảng cách hai bàn tay chưa chuẩn. Hãy đặt tay rộng hơn vai khoảng một bàn tay, ngón tay hướng thẳng.'
            }
        }
    },
    'pull_up': {
        'name_vi': 'Hít xà đơn (Pull-up)',
        'onnx_file': 'best_stgcnpp_pull_up.onnx',
        'classes': ['CORRECT', 'KIPPING_SWINGING', 'SHALLOW_PULL', 'INCOMPLETE_EXTENSION'],
        'details': {
            'CORRECT': {
                'name_vi': 'Đúng chuẩn kỹ thuật',
                'feedback': 'Rất tốt! Cằm vượt thanh xà, nhả thẳng tay ở đáy, thân người ổn định.'
            },
            'KIPPING_SWINGING': {
                'name_vi': 'Đong đưa / Quăng người lấy đà',
                'feedback': 'Thân người bị đong đưa mất lực kéo cô lập. Hãy gồng chặt cơ bụng và kéo thẳng người có kiểm soát.'
            },
            'SHALLOW_PULL': {
                'name_vi': 'Kéo nửa vời / Cằm chưa qua xà',
                'feedback': 'Cằm chưa vượt qua xà. Hãy chủ động ép bả vai xuống dưới và kéo cùi chỏ về sau.'
            },
            'INCOMPLETE_EXTENSION': {
                'name_vi': 'Chưa duỗi thẳng tay ở điểm thấp nhất',
                'feedback': 'Chưa nhả hết khớp tay ở đáy. Hãy nhả thẳng tay hoàn toàn (dead hang) để giãn cơ xô tối đa.'
            }
        }
    },
    'bench_pressing': {
        'name_vi': 'Đẩy ngực nằm (Bench Press)',
        'onnx_file': 'best_stgcnpp_bench_pressing.onnx',
        'classes': ['CORRECT', 'ASYMMETRIC_BAR', 'ELBOW_OVERFLARE', 'SHALLOW_PRESS'],
        'details': {
            'CORRECT': {
                'name_vi': 'Đúng chuẩn kỹ thuật',
                'feedback': 'Rất tốt! Hạ tạ đều hai tay, cùi chỏ mở góc an toàn, thanh đòn chạm ngực kiểm soát.'
            },
            'ASYMMETRIC_BAR': {
                'name_vi': 'Lệch thanh tạ / Đẩy không đều 2 tay',
                'feedback': 'Thanh đòn bị nghiêng lệch một bên. Hãy gồng đều hai tay và tập trung kiểm soát tốc độ cân bằng.'
            },
            'ELBOW_OVERFLARE': {
                'name_vi': 'Banh cùi chỏ quá rộng sang ngang',
                'feedback': 'Cùi chỏ mở góc gần 90 độ gây áp lực lớn lên khớp vai. Hãy khép cùi chỏ góc 60-75 độ so với thân.'
            },
            'SHALLOW_PRESS': {
                'name_vi': 'Đẩy nửa vời / Tạ chưa hạ đủ sâu',
                'feedback': 'Tạ chưa chạm hoặc cách ngực quá xa. Hãy hạ thanh đòn chạm nhẹ phần giữa ngực.'
            }
        }
    },
    'situp': {
        'name_vi': 'Gập bụng ngược (Reverse Crunches / Sit-up V2)',
        'onnx_file': 'best_stgcnpp_situp_v2.onnx',
        'classes': ['CORRECT', 'SHALLOW_RANGE', 'NOT_RAISING_HIPS', 'HEAD_STRAIN'],
        'details': {
            'CORRECT': {
                'name_vi': 'Đúng chuẩn kỹ thuật',
                'feedback': 'Rất tốt! Co gập hông đạt góc 90 độ, cơ core gồng chắc, không gập giật cổ.'
            },
            'SHALLOW_RANGE': {
                'name_vi': 'Co gập nửa vời / Chưa đủ góc 90°',
                'feedback': 'Biên độ co đùi chưa đạt góc vuông 90 độ. Hãy nâng chân lên cao hơn để kích hoạt cơ bụng dưới.'
            },
            'NOT_RAISING_HIPS': {
                'name_vi': 'Chưa nâng hông tách sàn',
                'feedback': 'Hông vẫn dán chặt dưới sàn. Hãy cuộn tròn cơ bụng dưới để nhấc nhẹ xương chậu khỏi thảm.'
            },
            'HEAD_STRAIN': {
                'name_vi': 'Gồng bẻ đốt sống cổ / Giật đầu gáy',
                'feedback': 'Đầu và cổ bị căng gập quá mức. Hãy giữ cổ thư giãn tự nhiên, dán lưng trên xuống thảm.'
            }
        }
    },
    'jump_jack': {
        'name_vi': 'Bật nhảy (Jumping Jack V2 - Qualcomm)',
        'onnx_file': 'best_stgcnpp_jumpjack_v2.onnx',
        'classes': ['CORRECT', 'ARMS_INCOMPLETE', 'LEGS_TOO_NARROW', 'NOT_JUMPING'],
        'details': {
            'CORRECT': {
                'name_vi': 'Đúng chuẩn kỹ thuật',
                'feedback': 'Rất tốt! Hai tay vỗ qua đầu, hai chân mở rộng đều, nhịp điệu dứt khoát.'
            },
            'ARMS_INCOMPLETE': {
                'name_vi': 'Tay vỗ chưa tới đỉnh qua đầu',
                'feedback': 'Biên độ tay chưa giơ qua đầu. Hãy vươn thẳng hai tay vỗ chạm nhau trên đỉnh đầu ở mỗi nhịp bật.'
            },
            'LEGS_TOO_NARROW': {
                'name_vi': 'Chân mở quá hẹp khi tiếp đất',
                'feedback': 'Chân mở chưa đủ rộng. Hãy bật hai chân rộng hơn vai khoảng 1.5 lần.'
            },
            'NOT_JUMPING': {
                'name_vi': 'Không bật nhảy (giậm chân tại chỗ)',
                'feedback': 'Chưa có lực bật tách chân khỏi mặt đất. Hãy nhún gối và bật nhảy dứt khoát.'
            }
        }
    }
}

EXERCISE_ALIASES = {
    'squat': 'squat', 'squats': 'squat', 'squat_v2': 'squat',
    'squat_v1': 'squat_v1',
    'push_up': 'push_up', 'pushup': 'push_up', 'push-up': 'push_up', 'pushups': 'push_up',
    'pull_up': 'pull_up', 'pullup': 'pull_up', 'pull-up': 'pull_up', 'pullups': 'pull_up',
    'bench_pressing': 'bench_pressing', 'benchpress': 'bench_pressing', 'bench_press': 'bench_pressing', 'bench': 'bench_pressing',
    'situp': 'situp', 'sit_up': 'situp', 'sit-up': 'situp', 'situps': 'situp',
    'jump_jack': 'jump_jack', 'jumpjacks': 'jump_jack', 'jumping_jack': 'jump_jack', 'jumpingjack': 'jump_jack'
}


def calc_angle_3p(p1, p2, p3):
    v1 = np.array(p1) - np.array(p2)
    v2 = np.array(p3) - np.array(p2)
    n1, n2 = np.linalg.norm(v1), np.linalg.norm(v2)
    if n1 < 1e-6 or n2 < 1e-6:
        return 180.0
    cos_a = np.clip(np.dot(v1, v2) / (n1 * n2), -1.0, 1.0)
    return float(np.degrees(np.arccos(cos_a)))


def calc_torso_lean(sh, hip):
    dy = hip[1] - sh[1]
    dx = hip[0] - sh[0]
    return float(np.degrees(np.arctan2(abs(dx), abs(dy) + 1e-6)))


class ONNXGymAnalyzer:
    """Bộ phân tích chất lượng động tác Gym thời gian thực chạy hoàn toàn bằng ONNX Runtime."""

    def __init__(self):
        # Tự động chọn provider
        available = ort.get_available_providers()
        self.providers = ['CUDAExecutionProvider', 'CPUExecutionProvider'] if 'CUDAExecutionProvider' in available else ['CPUExecutionProvider']
        self.sessions = {}
        # Bộ tiền xử lý nâng cao tích hợp 4 cải tiến cho từng bài tập
        self.pose_processors = {
            'squat': EnhancedPoseProcessor('squat'),
            'push_up': EnhancedPoseProcessor('pushup'),
            'jump_jack': EnhancedPoseProcessor('jump_jack'),
            'situp': EnhancedPoseProcessor('crunch')
        }

    def normalize_exercise(self, exercise_type: str) -> str:
        key = exercise_type.lower().strip().replace(' ', '_')
        return EXERCISE_ALIASES.get(key, key)

    def get_session(self, exercise_type: str):
        key = self.normalize_exercise(exercise_type)
        if key not in EXERCISE_CONFIG:
            raise ValueError(f"Không hỗ trợ bài tập '{exercise_type}'. Danh sách: {list(EXERCISE_CONFIG.keys())}")

        if key not in self.sessions:
            onnx_path = os.path.join(WEIGHTS_DIR, EXERCISE_CONFIG[key]['onnx_file'])
            if not os.path.exists(onnx_path):
                raise FileNotFoundError(f"Không tìm thấy file ONNX: {onnx_path}")
            
            # Khởi tạo InferenceSession
            session = ort.InferenceSession(onnx_path, providers=self.providers)
            self.sessions[key] = session

        return self.sessions[key], key

    def detect_camera_view(self, rep_tensor: np.ndarray) -> dict:
        """
        Nhận diện góc đặt camera dựa trên độ mở hình chiếu ngang 2D giữa vai trái-phải và hông trái-phải.
        Hỗ trợ:
        - Khung hình đơn: (3, 17) hoặc (2, 17)
        - Chuỗi thời gian: (3, T, 17) hoặc (1, 3, T, 17)
        """
        tensor = rep_tensor[0] if rep_tensor.ndim == 4 else rep_tensor

        # 5: vai T, 6: vai P | 11: hông T, 12: hông P | 13: gối T, 14: gối P
        if tensor.ndim == 2:
            # Khung hình đơn: shape (3, 17) hoặc (2, 17)
            sh_dx = float(abs(tensor[0, 5] - tensor[0, 6]))
            hip_dx = float(abs(tensor[0, 11] - tensor[0, 12]))
            knee_dx = float(abs(tensor[0, 13] - tensor[0, 14]))
        else:
            # Chuỗi thời gian: shape (3, T, 17)
            sh_dx = float(np.mean(np.abs(tensor[0, :, 5] - tensor[0, :, 6])))
            hip_dx = float(np.mean(np.abs(tensor[0, :, 11] - tensor[0, :, 12])))
            knee_dx = float(np.mean(np.abs(tensor[0, :, 13] - tensor[0, :, 14])))

        # Phân loại góc camera:
        # Nếu sh_dx < 0.11 và hip_dx < 0.09: QUAY NGANG (SIDE_VIEW)
        # Nếu sh_dx > 0.18 và hip_dx > 0.12: CHÍNH DIỆN (FRONT_VIEW)
        # Còn lại: GÓC CHÉO 45 độ (OBLIQUE_VIEW)
        if sh_dx < 0.11 and hip_dx < 0.09:
            view_code = 'SIDE_VIEW'
            view_name_vi = 'QUAY NGANG (SIDE)'
            is_side_view = True
        elif sh_dx > 0.18 and hip_dx > 0.12:
            view_code = 'FRONT_VIEW'
            view_name_vi = 'CHÍNH DIỆN (FRONT)'
            is_side_view = False
        else:
            view_code = 'OBLIQUE_VIEW'
            view_name_vi = 'GÓC CHÉO 45°'
            is_side_view = False

        return {
            'view_code': view_code,
            'view_name_vi': view_name_vi,
            'view_vi': view_name_vi,
            'is_side_view': is_side_view,
            'sh_dx': round(sh_dx, 4),
            'hip_dx': round(hip_dx, 4),
            'knee_dx': round(knee_dx, 4)
        }

    def resample_sequence(self, sequence: list, target_frames: int = 32) -> np.ndarray:
        """Nội suy đều chuỗi khung xương về 32 frames. Shape: (1, 3, 32, 17)"""
        t_raw = len(sequence)
        if t_raw == 0:
            return np.zeros((1, 3, target_frames, 17), dtype=np.float32)

        indices = np.linspace(0, t_raw - 1, target_frames)
        resampled = []
        for idx in indices:
            i_low = int(np.floor(idx))
            i_high = int(np.ceil(idx))
            weight = idx - i_low
            if i_low == i_high or i_high >= t_raw:
                frame_data = sequence[i_low]
            else:
                frame_data = (1.0 - weight) * sequence[i_low] + weight * sequence[i_high]
            resampled.append(frame_data)
        resampled = np.array(resampled, dtype=np.float32) # (32, 3, 17)
        transposed = np.transpose(resampled, (1, 0, 2))  # (3, 32, 17)
        return np.expand_dims(transposed, axis=0)        # (1, 3, 32, 17)

    def predict_rep_tensor(self, rep_tensor: np.ndarray, exercise_type: str = 'squat') -> dict:
        """
        Dự đoán từ rep_tensor dạng (3, 32, 17) hoặc (1, 3, 32, 17).
        Áp dụng Camera View-Aware Gating (Đề xuất 1) để triệt tiêu các lỗi bị che khuất quang học.
        """
        session, key = self.get_session(exercise_type)
        cfg = EXERCISE_CONFIG[key]
        classes = cfg['classes']

        if rep_tensor.ndim == 3:
            raw_tensor = rep_tensor.copy()
        else:
            raw_tensor = rep_tensor[0].copy()

        raw_tensor = sanitize_image_keypoints(raw_tensor)

        # 1. Nhận diện góc nhìn camera trên tọa độ chuẩn hóa ảnh gốc [0, 1]
        view_info = self.detect_camera_view(raw_tensor)
        is_side_view = view_info['is_side_view']
        view_note = ""

        # 2. Áp dụng 4 cải tiến (Inpainting + Occlusion Filter + Bone Constancy + Root Centering) cho bản V2
        tensor_3d = raw_tensor.copy()
        if key in self.pose_processors:
            tensor_3d = self.pose_processors[key].process_sequence(tensor_3d, apply_root_centering=True)

        input_data = np.expand_dims(tensor_3d.astype(np.float32), axis=0)

        start_time = time.perf_counter()
        outputs = session.run(None, {'keypoints': input_data})
        logits = outputs[0][0] # (4,)
        
        # Softmax ban đầu từ mô hình ONNX
        exp_logits = np.exp(logits - np.max(logits))
        raw_probs = exp_logits / np.sum(exp_logits)
        latency_ms = (time.perf_counter() - start_time) * 1000


        # 2. Tính toán các chỉ số cơ sinh học chính xác từ chuỗi 32 frames
        biomechanics = {}
        filtered_probs = raw_probs.copy()

        if key in ['squat', 'squat_v1']:
            min_knee_angle = 180.0
            max_torso_lean = 0.0
            for t in range(32):
                l_hip, r_hip = tensor_3d[:2, t, 11], tensor_3d[:2, t, 12]
                l_knee, r_knee = tensor_3d[:2, t, 13], tensor_3d[:2, t, 14]
                l_ank, r_ank = tensor_3d[:2, t, 15], tensor_3d[:2, t, 16]
                l_sh, r_sh = tensor_3d[:2, t, 5], tensor_3d[:2, t, 6]

                k_ang = (calc_angle_3p(l_hip, l_knee, l_ank) + calc_angle_3p(r_hip, r_knee, r_ank)) / 2.0
                if k_ang < min_knee_angle:
                    min_knee_angle = k_ang
                t_lean = calc_torso_lean((l_sh + r_sh) / 2.0, (l_hip + r_hip) / 2.0)
                if t_lean > max_torso_lean:
                    max_torso_lean = t_lean

            biomechanics['min_knee_angle'] = round(min_knee_angle, 1)
            biomechanics['max_torso_lean'] = round(max_torso_lean, 1)

            # CAMERA VIEW-AWARE GATING CHO SQUAT:
            if is_side_view:
                # Với Squat V1: Góc quay ngang không thấy được chụm gối KNEE_VALGUS
                if key == 'squat_v1' and 'KNEE_VALGUS' in classes:
                    valgus_idx = classes.index('KNEE_VALGUS')
                    filtered_probs[valgus_idx] = 0.0


                # Kiểm tra chéo độ sâu: Nếu góc gập gối tại đáy <= 100 độ (đạt song song hoặc sâu hơn) -> Chắc chắn KHÔNG phạm lỗi SHALLOW_DEPTH
                if min_knee_angle <= 100.0 and 'SHALLOW_DEPTH' in classes:
                    shallow_idx = classes.index('SHALLOW_DEPTH')
                    filtered_probs[shallow_idx] = 0.0

                # Chuẩn hóa lại tổng xác suất sau khi lọc
                sum_p = np.sum(filtered_probs)
                if sum_p > 1e-6:
                    filtered_probs = filtered_probs / sum_p
                else:
                    filtered_probs[classes.index('CORRECT')] = 1.0

                view_note = "Góc quay ngang: Đã kích hoạt bộ lọc che khuất (Bỏ qua lỗi trục gối; tập trung đo độ sâu & cột sống)."

        elif key == 'push_up':
            # Với Chống đẩy: Khi quay ngang, không thể quan sát banh cùi chỏ hoặc đặt tay quá rộng/hẹp
            if is_side_view:
                if 'ELBOW_FLARING' in classes:
                    flare_idx = classes.index('ELBOW_FLARING')
                    filtered_probs[flare_idx] = 0.0
                if 'HAND_PLACEMENT' in classes:
                    hand_idx = classes.index('HAND_PLACEMENT')
                    filtered_probs[hand_idx] = 0.0

                sum_p = np.sum(filtered_probs)
                if sum_p > 1e-6:
                    filtered_probs = filtered_probs / sum_p
                else:
                    filtered_probs[classes.index('CORRECT')] = 1.0
                view_note = "Góc quay ngang: Bỏ qua lỗi khoảng cách đặt tay (chỉ quan sát được từ trực diện/trên)."

        pred_idx = int(np.argmax(filtered_probs))
        pred_code = classes[pred_idx]
        detail = cfg['details'][pred_code]

        return {
            'exercise': key,
            'exercise_name_vi': cfg['name_vi'],
            'class_id': pred_idx,
            'class_code': pred_code,
            'class_name_vi': detail['name_vi'],
            'feedback_vi': detail['feedback'],
            'is_correct': (pred_code == 'CORRECT'),
            'confidence': float(filtered_probs[pred_idx]),
            'probabilities': {classes[i]: float(filtered_probs[i]) for i in range(len(classes))},
            'raw_probabilities': {classes[i]: float(raw_probs[i]) for i in range(len(classes))},
            'latency_ms': round(latency_ms, 2),
            'camera_view': view_info['view_code'],
            'camera_view_vi': view_info['view_name_vi'],
            'is_side_view': is_side_view,
            'view_note': view_note,
            'biomechanics': biomechanics
        }
