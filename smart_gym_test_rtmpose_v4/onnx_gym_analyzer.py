"""
BỘ SUY LUẬN ĐA ĐỘNG TÁC GYM BẰNG ONNX RUNTIME (ONNX GYM ANALYZER V4)
Phiên bản V4 sạch, tối ưu hóa toàn diện:
1. Mô hình Đa nhánh Multi-Head V4 (Squat V4):
   - Đánh giá đồng thời 14 nhãn gốc Qualcomm, giữ nhiều thuộc tính đồng thời.
   - Đầu ra Sigmoid từng nhánh (không bị triệt tiêu chéo).
2. Mô hình Đơn nhãn V3 (Pushup, JumpJack, Situp / Crunch).
3. Đầy đủ hàm nội suy thời gian thực `resample_sequence` phục vụ bộ đếm rep.
"""

import os
import sys
import time
import json
from pathlib import Path
import numpy as np

# Nạp CUDA DLL từ PyTorch để ONNX Runtime kích hoạt GPU NVIDIA RTX nếu có
try:
    import torch
    if hasattr(os, 'add_dll_directory'):
        torch_lib = os.path.join(os.path.dirname(torch.__file__), 'lib')
        if os.path.exists(torch_lib):
            os.add_dll_directory(torch_lib)
            os.environ['PATH'] = torch_lib + os.pathsep + os.environ.get('PATH', '')
except Exception:
    pass

import onnxruntime as ort

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
WEIGHTS_DIR = os.path.join(CURRENT_DIR, 'weights')

from enhanced_pose_processor import EnhancedPoseProcessor
from squat_schema import (SCHEMA_VERSION, LABELS, RAW_LABELS, prepare_input, sha256)

EXERCISE_CONFIG = {
    'squat': {'name_vi': 'Squat V4 — 14 nhãn Qualcomm', 'onnx_file': 'best_stgcnpp_squat_v4_multihead.onnx', 'is_multihead': True, 'classes': RAW_LABELS},
    'push_up': {
        'name_vi': 'Chống đẩy (Push-up V3 - RTMPose)',
        'onnx_file': 'best_stgcnpp_pushup_v3.onnx',
        'is_multihead': False,
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
    'jump_jack': {
        'name_vi': 'Bật nhảy (Jumping Jack V3 - RTMPose)',
        'onnx_file': 'best_stgcnpp_jumpjack_v3.onnx',
        'is_multihead': False,
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
                'feedback': 'Khoảng cách chân lúc nhảy mở chưa đủ rộng. Hãy mở rộng chân hơn vai khi bật ra.'
            },
            'NOT_JUMPING': {
                'name_vi': 'Nhảy hời hợt / Chân không nhấc khỏi sàn',
                'feedback': 'Chưa tạo lực bật nhảy dứt khoát. Hãy nhón mũi chân và bật nảy nhẹ nhàng tiếp đất êm.'
            }
        }
    },
    'situp': {
        'name_vi': 'Gập bụng ngược (Reverse Crunches / Sit-up V3)',
        'onnx_file': 'best_stgcnpp_situp_v3.onnx',
        'is_multihead': False,
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
    }
}

import jumpjack_schema
import squat_schema
import pushup_schema
import crunch_schema
V4_SCHEMAS={'squat':squat_schema,'jump_jack':jumpjack_schema,
            'push_up':pushup_schema,'situp':crunch_schema}
V4_STEMS={'squat':'squat','jump_jack':'jumpjack','push_up':'pushup','situp':'crunch'}
EXERCISE_CONFIG['jump_jack'] = {
    'name_vi': 'Jumping jacks V4 — 29 nhãn Qualcomm',
    'onnx_file': 'best_stgcnpp_jumpjack_v4_multihead.onnx',
    'is_multihead': True, 'classes': jumpjack_schema.RAW_LABELS,
}
for _key,_schema in [('push_up',pushup_schema),('situp',crunch_schema)]:
    _stem=V4_STEMS[_key]
    EXERCISE_CONFIG[_key]={'name_vi':('Chống đẩy' if _key=='push_up' else 'Gập bụng ngược')+f' V4 — {len(_schema.LABELS)} nhãn Qualcomm',
                         'onnx_file':f'best_stgcnpp_{_stem}_v4_multihead.onnx',
                         'is_multihead':True,'classes':_schema.RAW_LABELS}

EXERCISE_ALIASES = {
    'squat': 'squat',
    'squats': 'squat',
    'pushup': 'push_up',
    'push_up': 'push_up',
    'push-up': 'push_up',
    'pushups': 'push_up',
    'jump_jack': 'jump_jack',
    'jumpjack': 'jump_jack',
    'jumping_jack': 'jump_jack',
    'jumpingjack': 'jump_jack',
    'jumping_jacks': 'jump_jack',
    'situp': 'situp',
    'sit-up': 'situp',
    'sit_up': 'situp',
    'crunch': 'situp',
    'crunches': 'situp'
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
    """Bộ phân tích chất lượng động tác Gym thời gian thực V4 chạy bằng ONNX Runtime."""

    def __init__(self, device=None):
        available = ort.get_available_providers()
        self.providers = ['CUDAExecutionProvider', 'CPUExecutionProvider'] if device != 'cpu' and 'CUDAExecutionProvider' in available else ['CPUExecutionProvider']
        self.sessions = {}
        self.squat_contract = None
        self.jumpjack_contract = None
        self.extra_contracts = {}
        self.frame_aspect_ratio = 1.0
        self.rep_duration_seconds = 2.0
        self.pose_processors = {
            'squat': EnhancedPoseProcessor('squat'),
            'push_up': EnhancedPoseProcessor('pushup'),
            'jump_jack': EnhancedPoseProcessor('jump_jack'),
            'situp': EnhancedPoseProcessor('crunch')
        }

    def normalize_exercise(self, exercise_type: str) -> str:
        key = exercise_type.lower().strip().replace(' ', '_').replace('-', '_')
        return EXERCISE_ALIASES.get(key, key)

    def get_session(self, exercise_type: str):
        key = self.normalize_exercise(exercise_type)
        if key not in EXERCISE_CONFIG:
            raise ValueError(f"Không hỗ trợ bài tập '{exercise_type}'. Danh sách: {list(EXERCISE_CONFIG.keys())}")

        if key not in self.sessions:
            onnx_path = os.path.join(WEIGHTS_DIR, EXERCISE_CONFIG[key]['onnx_file'])
            if not os.path.exists(onnx_path):
                raise FileNotFoundError(f"Không tìm thấy file ONNX: {onnx_path}")
            
            opts = ort.SessionOptions()
            opts.intra_op_num_threads = 2
            opts.log_severity_level = 3
            session = ort.InferenceSession(onnx_path, sess_options=opts, providers=self.providers)
            self.sessions[key] = session

        return self.sessions[key], key

    def load_squat_contract(self):
        if self.squat_contract is None:
            path = Path(WEIGHTS_DIR) / 'squat_v4_contract.json'
            if not path.exists():
                raise RuntimeError('Squat V4 14 nhãn chưa huấn luyện/xuất xong. Xem README.md để chạy pipeline.')
            contract = json.loads(path.read_text(encoding='utf-8'))
            if contract['schema_version'] != SCHEMA_VERSION or [r['raw_label'] for r in contract['labels']] != RAW_LABELS:
                raise RuntimeError('Hợp đồng nhãn/tiền xử lý không khớp mô hình squat V4')
            model_path = Path(WEIGHTS_DIR) / EXERCISE_CONFIG['squat']['onnx_file']
            if sha256(model_path) != contract['onnx_sha256']:
                raise RuntimeError('Trọng số và ngưỡng nhãn squat không cùng phiên bản')
            self.squat_contract = contract
        return self.squat_contract

    def load_jumpjack_contract(self):
        if self.jumpjack_contract is None:
            path = Path(WEIGHTS_DIR) / 'jumpjack_v4_contract.json'
            contract = json.loads(path.read_text(encoding='utf-8'))
            if contract['schema_version'] != jumpjack_schema.SCHEMA_VERSION or [r['raw_label'] for r in contract['labels']] != jumpjack_schema.RAW_LABELS:
                raise RuntimeError('Jumping-jacks label/preprocessing contract mismatch')
            model_path = Path(WEIGHTS_DIR) / EXERCISE_CONFIG['jump_jack']['onnx_file']
            if sha256(model_path) != contract['onnx_sha256']:
                raise RuntimeError('Jumping-jacks model/contract hash mismatch')
            self.jumpjack_contract = contract
        return self.jumpjack_contract

    def predict_jumpjack_sequence(self, raw_sequence, duration_seconds, scope='video'):
        return self.predict_squat_sequence(raw_sequence, duration_seconds, scope, _exercise='jump_jack')

    def load_v4_contract(self,exercise_type):
        key=self.normalize_exercise(exercise_type)
        if key=='squat':return self.load_squat_contract()
        if key=='jump_jack':return self.load_jumpjack_contract()
        if key not in self.extra_contracts:
            schema=V4_SCHEMAS[key];stem=V4_STEMS[key]
            contract=json.loads((Path(WEIGHTS_DIR)/f'{stem}_v4_contract.json').read_text(encoding='utf-8'))
            if contract['schema_version']!=schema.SCHEMA_VERSION or [r['raw_label'] for r in contract['labels']]!=schema.RAW_LABELS:
                raise RuntimeError('Nhãn hoặc tiền xử lý không khớp mô hình '+stem)
            if sha256(Path(WEIGHTS_DIR)/EXERCISE_CONFIG[key]['onnx_file'])!=contract['onnx_sha256']:
                raise RuntimeError('Trọng số và ngưỡng không cùng phiên bản: '+stem)
            self.extra_contracts[key]=contract
        return self.extra_contracts[key]

    def predict_pushup_sequence(self,raw_sequence,duration_seconds,scope='video'):
        return self.predict_squat_sequence(raw_sequence,duration_seconds,scope,_exercise='push_up')

    def predict_crunch_sequence(self,raw_sequence,duration_seconds,scope='video'):
        return self.predict_squat_sequence(raw_sequence,duration_seconds,scope,_exercise='situp')

    def predict_squat_sequence(self, raw_sequence, duration_seconds, scope='video', _exercise='squat'):
        """raw_sequence=(T,3,17), x/image_height,y/image_height; không chuẩn hóa trước."""
        if scope not in ('video', 'rep', 'window'):
            raise ValueError('Phạm vi phải là video, rep hoặc window')
        schema = V4_SCHEMAS[_exercise]
        LABELS, RAW_LABELS, SCHEMA_VERSION = schema.LABELS, schema.RAW_LABELS, schema.SCHEMA_VERSION
        skeleton, context, quality = schema.prepare_input(raw_sequence, duration_seconds)
        result = {'exercise':_exercise,'exercise_name_vi':'Squat V4 — 14 nhãn Qualcomm',
                  'schema_version':SCHEMA_VERSION,'scope':scope,'is_multihead':True,
                  'duration_seconds':float(duration_seconds),
                  'input_coordinate_system':'x/image_height,y/image_height,confidence',
                  'is_correct':None,'status':'insufficient_data','confidence':0.,
                  'class_code':'INSUFFICIENT_DATA','class_name_vi':'Chưa đủ dữ liệu quan sát',
                  'feedback_vi':'Đưa toàn thân vào khung hình và kiểm tra ánh sáng.',
                  'detected_errors':[],'detected_labels':[],'head_results':{},'label_results':[],
                  'probabilities':{},'error_count':0,'has_multiple_errors':False,'latency_ms':0.,
                  'camera_view':'UNKNOWN','camera_view_vi':'Chưa xác định','is_side_view':False,
                  'view_note':'Nhãn Qualcomm mô tả video; chưa phát hiện nhãn không đồng nghĩa tư thế đúng.',
                  'quality':quality,'biomechanics':{'min_knee_angle':quality['min_knee_angle'],
                                                   'max_torso_lean':quality['max_torso_lean']}}
        result['exercise_name_vi'] = EXERCISE_CONFIG[_exercise]['name_vi']
        if not quality['usable']:
            result['label_results'] = [dict(key=r[0],raw_label=RAW_LABELS[i],name_vi=r[2],group_vi=r[3],
                                            kind=r[4],probability=None,threshold=None,detected=False,
                                            supported=False,status='Chưa đủ dữ liệu') for i,r in enumerate(LABELS)]
            return result
        contract = self.load_v4_contract(_exercise)
        result['exercise_name_vi'] = EXERCISE_CONFIG[_exercise]['name_vi']
        session, _ = self.get_session(_exercise)
        if len(session.get_inputs()) != 2:
            raise RuntimeError('Mô hình V4 cần hai đầu vào: khung xương và đặc trưng ngữ cảnh')
        start = time.perf_counter()
        logits = session.run(None,{'skeleton':skeleton[None],'context':context[None]})[0][0]
        if logits.shape != (len(LABELS),) or not np.isfinite(logits).all():
            raise RuntimeError(f'Đầu ra mô hình không đúng {len(LABELS)} nhãn hữu hạn')
        result['latency_ms'] = round((time.perf_counter()-start)*1000,2)
        probabilities = 1/(1+np.exp(-np.clip(logits,-50,50)))
        errors, detected, rows = [], [], []
        for cfg,p in zip(contract['labels'],probabilities):
            supported = (scope == 'video' or cfg['rep_supported']) and cfg.get('calibrated', True)
            active = bool(p >= cfg['threshold']) and supported
            row = {**cfg,'probability':float(p),'detected':active,'supported':supported,
                   'status':'Có nhãn' if active else ('Chưa phát hiện' if supported else
                       ('Thiếu mẫu xác thực' if not cfg.get('calibrated',True) else 'Cần toàn video'))}
            rows.append(row)
            if active:
                detected.append(row)
                if cfg['kind']=='error':
                    errors.append({'key':cfg['key'],'name_vi':cfg['name_vi'],'error_prob':float(p),
                                   'status_msg':cfg['name_vi'],'feedback':'Kiểm tra lại: '+cfg['name_vi']})
        visibility_bad = any(r['key']=='not_visible' for r in detected)
        positive = any(r['key']=='no_obvious_issue' for r in detected)
        detected_keys = {r['key'] for r in detected}
        review_notes = []
        if len(detected_keys & {'shoulder_width','wide','narrow'}) > 1:
            review_notes.append('Có nhiều mức khoảng cách '+('tay' if _exercise=='push_up' else 'chân')+' được dự đoán; hãy xem lại các pha trong video.')
        if positive and errors:
            review_notes.append('Nhãn không thấy vấn đề rõ ràng cùng xuất hiện với nhãn lỗi; chưa thể kết luận toàn bộ video đúng.')
        result.update({'label_results':rows,'detected_labels':detected,'detected_errors':errors,
                       'probabilities':{r['key']:r['probability'] for r in rows},
                       'head_results':{r['key']:r for r in rows},'error_count':len(errors),
                       'has_multiple_errors':len(errors)>1,
                       'confidence':max([r['probability'] for r in detected],default=0.),
                       'is_correct':False if errors and not visibility_bad else (True if positive and not visibility_bad else None),
                       'status':'insufficient_data' if visibility_bad else ('errors_detected' if errors else 'attributes_detected'),
                       'class_code':';'.join(r['key'] for r in detected) or 'UNCERTAIN',
                       'class_name_vi':' | '.join(r['name_vi'] for r in detected) or 'Chưa có nhãn vượt ngưỡng',
                       'feedback_vi':'Kiểm tra: '+', '.join(r['name_vi'] for r in errors) if errors else
                           'Đối chiếu từng thuộc tính; không có nhãn lỗi chưa chứng minh toàn bộ tư thế đúng.'})
        result['review_notes'] = review_notes
        if review_notes and not visibility_bad:
            result['status'] = 'review_needed'
            result['is_correct'] = None
        return result

    def detect_camera_view(self, rep_tensor: np.ndarray) -> dict:
        """Nhận diện góc đặt camera (Chính diện / Góc chéo 45° / Góc nghiêng ngang)."""
        tensor = rep_tensor[0] if rep_tensor.ndim == 4 else rep_tensor
        if tensor.ndim == 2:
            sh_dx = float(abs(tensor[0, 5] - tensor[0, 6]))
            hip_dx = float(abs(tensor[0, 11] - tensor[0, 12]))
            knee_dx = float(abs(tensor[0, 13] - tensor[0, 14]))
        else:
            sh_dx = float(np.mean(np.abs(tensor[0, :, 5] - tensor[0, :, 6])))
            hip_dx = float(np.mean(np.abs(tensor[0, :, 11] - tensor[0, :, 12])))
            knee_dx = float(np.mean(np.abs(tensor[0, :, 13] - tensor[0, :, 14])))

        body_dx = (sh_dx + hip_dx + knee_dx) / 3.0
        if body_dx < 0.08:
            view_code = 'SIDE'
            view_name_vi = 'GÓC NGHIÊNG NGANG (90°)'
            is_side_view = True
        elif body_dx < 0.18:
            view_code = 'DIAGONAL'
            view_name_vi = 'GÓC CHÉO 45°'
            is_side_view = False
        else:
            view_code = 'FRONTAL'
            view_name_vi = 'CHÍNH DIỆN (0°)'
            is_side_view = False

        return {
            'view_code': view_code,
            'view_name_vi': view_name_vi,
            'is_side_view': is_side_view,
            'body_width_score': round(body_dx, 4)
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
        resampled = np.array(resampled, dtype=np.float32)  # (32, 3, 17)
        transposed = np.transpose(resampled, (1, 0, 2))   # (3, 32, 17)
        return np.expand_dims(transposed, axis=0)         # (1, 3, 32, 17)

    def predict_rep_tensor(self, rep_tensor: np.ndarray, exercise_type: str = 'squat') -> dict:
        """
        Dự đoán từ rep_tensor dạng (3, 32, 17) hoặc (1, 3, 32, 17).
        Hỗ trợ cả Multi-Head (V4) và Single-Head (V3).
        """
        if EXERCISE_CONFIG[self.normalize_exercise(exercise_type)].get('is_multihead',False):
            raw = np.asarray(rep_tensor,dtype=np.float32)
            if raw.ndim == 4: raw = raw[0]
            if raw.ndim != 3 or raw.shape[0] != 3 or raw.shape[2] != 17:
                raise ValueError('Tensor rep phải có dạng (3,T,17) hoặc (1,3,T,17)')
            raw = raw.transpose(1,0,2).copy()
            raw[:,0] *= self.frame_aspect_ratio
            key=self.normalize_exercise(exercise_type)
            predict=getattr(self,'predict_'+V4_STEMS[key]+'_sequence')
            result = predict(raw,self.rep_duration_seconds,scope='rep')
            result['stored_rep_coordinate_system'] = 'x/image_width,y/image_height,confidence'
            result['frame_aspect_ratio'] = self.frame_aspect_ratio
            return result
        session, key = self.get_session(exercise_type)
        cfg = EXERCISE_CONFIG[key]

        if rep_tensor.ndim == 3:
            raw_tensor = rep_tensor.copy()
        else:
            raw_tensor = rep_tensor[0].copy()

        # 1. Nhận diện góc nhìn camera
        view_info = self.detect_camera_view(raw_tensor)
        is_side_view = view_info['is_side_view']

        # 2. Xử lý chuẩn hóa Root Centering
        tensor_3d = raw_tensor.copy()
        if key in self.pose_processors:
            tensor_3d = self.pose_processors[key].process_sequence(tensor_3d, apply_root_centering=True)

        input_data = np.expand_dims(tensor_3d.astype(np.float32), axis=0)
        input_name = session.get_inputs()[0].name

        start_time = time.perf_counter()
        outputs = session.run(None, {input_name: input_data})
        latency_ms = (time.perf_counter() - start_time) * 1000

        biomechanics = {}

        logits = outputs[0][0]
        exp_logits = np.exp(logits - np.max(logits))
        raw_probs = exp_logits / np.sum(exp_logits)
        classes = cfg['classes']

        sorted_indices = np.argsort(raw_probs)[::-1]
        top1_idx = int(sorted_indices[0])
        top1_code = classes[top1_idx]
        top1_prob = float(raw_probs[top1_idx])
        top1_detail = cfg['details'][top1_code]

        is_correct = (top1_code == 'CORRECT' and top1_prob >= 0.50)

        return {
            'exercise': key,
            'exercise_name_vi': cfg['name_vi'],
            'is_multihead': False,
            'is_correct': is_correct,
            'class_id': top1_idx,
            'class_code': top1_code,
            'class_name_vi': top1_detail['name_vi'],
            'feedback_vi': top1_detail['feedback'],
            'confidence': top1_prob,
            'has_multiple_errors': False,
            'probabilities': {classes[i]: float(raw_probs[i]) for i in range(len(classes))},
            'latency_ms': round(latency_ms, 2),
            'camera_view': view_info['view_code'],
            'camera_view_vi': view_info['view_name_vi'],
            'is_side_view': is_side_view,
            'view_note': "",
            'biomechanics': biomechanics
        }
