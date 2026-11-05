"""Hợp đồng squat V4 dùng chung cho dữ liệu, huấn luyện và suy luận."""
from pathlib import Path
import hashlib
import json
import re
import cv2
import numpy as np

SCHEMA_VERSION = 'qualcomm-squat-14-clipbatch-v1'
FRAMES = 64
CONTEXT_SIZE = 16
# key, nhãn gốc, tên Việt, nhóm, loại, có ngữ cảnh trong một rep
LABELS = [
    ('depth_90', '90 degrees', 'Gập gối 90°', 'Độ sâu', 'attribute', True),
    ('depth_over_90', 'over 90 degrees', 'Gập gối vượt 90°', 'Độ sâu', 'attribute', True),
    ('shallow', 'shallow', 'Xuống nông', 'Độ sâu', 'error', True),
    ('insufficient', 'insufficient', 'Biên độ chưa đủ', 'Độ sâu', 'error', True),
    ('back_not_straight', 'back not straight', 'Lưng không thẳng', 'Lưng', 'error', True),
    ('shoulder_width', 'shoulder-width', 'Chân rộng bằng vai', 'Khoảng cách chân', 'attribute', True),
    ('wide', 'wide', 'Chân rộng', 'Khoảng cách chân', 'attribute', True),
    ('narrow', 'narrow', 'Chân hẹp', 'Khoảng cách chân', 'attribute', True),
    ('plie', 'plie', 'Kiểu đứng plié', 'Kiểu chân', 'attribute', True),
    ('knees_over_toes', 'knees over toes', 'Vị trí gối: nhãn gốc mâu thuẫn', 'Vị trí gối', 'attribute', True),
    ('no_obvious_issue', 'no obvious issue', 'Không thấy vấn đề rõ ràng', 'Nhận xét gốc', 'positive', True),
    ('not_visible', 'not visible', 'Không nhìn thấy rõ', 'Quan sát', 'visibility', True),
    ('hold', 'hold', 'Giữ tư thế', 'Trạng thái video', 'context', False),
    ('starting_late', 'starting late', 'Bắt đầu muộn', 'Trạng thái video', 'context', False),
]
RAW_LABELS = ['squats - ' + row[1] for row in LABELS]
KEYS = [row[0] for row in LABELS]


def write_json(path, value):
    path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    tmp.replace(path)


def sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''): digest.update(block)
    return digest.hexdigest()


def video_id(name):
    match = re.search(r'(\d{8})(?=\.[^.]+$)', Path(name).name)
    return match.group(1) if match else Path(name).stem.lower()


def encode_labels(raw):
    return np.array([float(label in raw) for label in RAW_LABELS], dtype=np.float32)


def sample_video(path, count=FRAMES):
    """Lấy mẫu toàn video, giữ đoạn chờ; không nạp toàn bộ ảnh vào RAM."""
    cap = cv2.VideoCapture(str(path))
    try:
        if not cap.isOpened(): raise ValueError(f'Không mở được video: {path}')
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)); fps = float(cap.get(cv2.CAP_PROP_FPS))
        if total < 2 or not np.isfinite(fps) or fps <= 0: raise ValueError(f'Metadata video lỗi: {path}')
        wanted = np.linspace(0, total - 1, count).astype(int)
        selected = set(wanted.tolist()); decoded = {}
        for index in range(total):
            if not cap.grab(): break
            if index in selected:
                ok, frame = cap.retrieve()
                if not ok or frame is None: raise ValueError(f'Không đọc được frame {index}: {path}')
                decoded[index] = frame
        if not selected.issubset(decoded): raise ValueError(f'Video bị cắt hoặc hỏng: {path}')
        frames = [decoded[index] for index in wanted]
        return frames, {'duration_seconds': total / fps, 'fps': fps, 'frame_count': total,
                        'sample_times': (wanted / fps).tolist()}
    finally: cap.release()


def resample(raw, count=FRAMES):
    raw = np.asarray(raw, dtype=np.float32)
    if raw.ndim != 3 or raw.shape[1:] != (3, 17) or len(raw) < 2:
        raise ValueError('Khung xương phải có dạng (T, 3, 17), T >= 2')
    if not np.isfinite(raw).all(): raise ValueError('Khung xương chứa NaN hoặc vô cực')
    indices = np.linspace(0, len(raw) - 1, count)
    lo = np.floor(indices).astype(int); hi = np.ceil(indices).astype(int)
    alpha = (indices - lo).astype(np.float32)[:, None, None]
    return raw[lo] * (1 - alpha) + raw[hi] * alpha


def angle(a, b, c):
    u, v = a - b, c - b
    den = np.linalg.norm(u, axis=-1) * np.linalg.norm(v, axis=-1)
    return np.degrees(np.arccos(np.clip((u * v).sum(-1) / np.maximum(den, 1e-6), -1, 1)))


def prepare_input(raw, duration_seconds, count=FRAMES):
    """raw dùng x/image_height,y/image_height: cùng tỷ lệ hai trục.

    Tâm/scale cố định toàn chuỗi giữ chuyển vị hông và pha chờ.
    """
    seq = resample(raw, count); conf = np.clip(seq[:, 2, :], 0, 1)
    xy = seq[:, :2, :].transpose(0, 2, 1).copy()
    anchor_valid = (conf[:, [5, 6, 11, 12]] >= .2).all(1)
    hips = (xy[:, 11] + xy[:, 12]) * .5; shoulders = (xy[:, 5] + xy[:, 6]) * .5
    valid_frames = (conf[:, [5, 6, 11, 12, 13, 14, 15, 16]] >= .2).sum(1) >= 5
    if anchor_valid.any():
        center = np.median(hips[anchor_valid], axis=0)
        scale = max(float(np.median(np.linalg.norm((shoulders - hips)[anchor_valid], axis=1))), .05)
    else: center, scale = np.array([.5, .5], np.float32), .25
    norm = np.clip((xy - center) / scale, -8, 8); norm[conf < .2] = 0
    motion = np.linalg.norm(np.diff(norm, axis=0), axis=2)
    pair_valid = (conf[1:] >= .2) & (conf[:-1] >= .2)
    energy = (motion * pair_valid).sum(1) / np.maximum(pair_valid.sum(1), 1)
    active = energy > max(float(np.percentile(energy, 80)) * .2, .03)
    first_active = float(np.argmax(active) / len(active)) if active.any() else 1.
    knee_angles, hip_angles, lean = [], [], []
    for sh, hip, knee, ank in [(5, 11, 13, 15), (6, 12, 14, 16)]:
        good = (conf[:, [hip, knee, ank]] >= .2).all(1)
        if good.any(): knee_angles.extend(angle(xy[good, hip], xy[good, knee], xy[good, ank]).tolist())
        good = (conf[:, [sh, hip, knee]] >= .2).all(1)
        if good.any(): hip_angles.extend(angle(xy[good, sh], xy[good, hip], xy[good, knee]).tolist())
    if anchor_valid.any():
        delta = (shoulders - hips)[anchor_valid]
        lean = np.degrees(np.arctan2(np.abs(delta[:, 0]), np.abs(delta[:, 1]) + 1e-6)).tolist()
    def width(a, b):
        good = (conf[:, a] >= .2) & (conf[:, b] >= .2)
        return float(np.median(np.linalg.norm(xy[good, a] - xy[good, b], axis=1)) / scale) if good.any() else 0.
    ranges = np.ptp(hips[anchor_valid] / scale, axis=0) if anchor_valid.any() else np.zeros(2)
    features = np.array([
        np.log1p(max(float(duration_seconds), .01)) / 5, conf.mean(), valid_frames.mean(),
        first_active, energy.mean(), energy.std(), ranges[0], ranges[1],
        width(5, 6), width(13, 14), width(15, 16),
        min(knee_angles, default=180.) / 180, max(lean, default=0.) / 90,
        min(hip_angles, default=180.) / 180, 1 - active.mean(), energy[-max(1, len(energy)//4):].mean(),
    ], dtype=np.float32)
    tensor = np.concatenate([norm.transpose(2, 0, 1), conf[None]], axis=0).astype(np.float32)
    quality = {'valid_frame_ratio': round(float(valid_frames.mean()), 4),
               'mean_confidence': round(float(conf.mean()), 4), 'usable': bool(valid_frames.mean() >= .35),
               'min_knee_angle': round(min(knee_angles), 1) if knee_angles else None,
               'max_torso_lean': round(max(lean), 1) if lean else None}
    return tensor, np.clip(features, 0, 10), quality


def default_contract():
    return {'schema_version': SCHEMA_VERSION, 'frames': FRAMES, 'context_size': CONTEXT_SIZE,
            'coordinate_system': 'x/image_height,y/image_height,confidence',
            'normalization': 'sequence_median_pelvis_and_torso',
            'target_semantics': 'presence_of_Qualcomm_annotation; absence_is_not_verified_correctness',
            'labels': [dict(zip(['key', 'suffix', 'name_vi', 'group_vi', 'kind', 'rep_supported'], row),
                            raw_label=RAW_LABELS[i], threshold=.5) for i, row in enumerate(LABELS)]}
