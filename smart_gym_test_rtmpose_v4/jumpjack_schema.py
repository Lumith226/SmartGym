"""29 original Qualcomm labels; full-video pose and timing features for jumping jacks."""
import numpy as np
from squat_schema import (prepare_input as base_prepare, resample, sample_video as base_sample,
                          write_json, sha256, video_id)

SCHEMA_VERSION = 'qualcomm-jumpjack-29-128frames-context32-v1'
FRAMES = 128
CONTEXT_SIZE = 32
LABELS = []
for suffix, name, kind, rep in [
    ('only arms', 'Chỉ chuyển động tay', 'error', True),
    ('only legs', 'Chỉ chuyển động chân', 'error', True),
    ('not jumping', 'Không bật nhảy', 'error', True),
    ('puppet dance', 'Chuyển động kiểu múa rối', 'error', True),
    ('opposite', 'Tay chân chuyển động ngược pha', 'error', True),
    ('not synchronized', 'Tay chân không đồng bộ', 'error', True),
    ('single repetition', 'Chỉ thực hiện một lần', 'context', False),
    ('early stopping', 'Dừng sớm', 'context', False),
]:
    LABELS.append((suffix.replace(' ', '_'), suffix, name, 'Chuyển động', kind, rep))
for part, name in [('arms', 'Tay'), ('legs', 'Chân')]:
    for value in [1., 1.5, 2., 2.5, 3., 3.5, 4.]:
        suffix = f'{part}_rom={value:.1f}'
        LABELS.append((suffix.replace('=', '_').replace('.', '_'), suffix,
                       f'{name}: mức biên độ {value:g}', 'Biên độ gốc', 'attribute', True))
for speed in [.25, .5, .75, 1., 1.25, 1.5, 1.75]:
    suffix = f'speed={speed:.2f} rps'
    LABELS.append((f'speed_{speed:.2f}'.replace('.', '_'), suffix,
                   f'Tốc độ {speed:g} lần/giây', 'Tốc độ gốc', 'attribute', False))
RAW_LABELS = ['jumping jacks - ' + row[1] for row in LABELS]
KEYS = [row[0] for row in LABELS]


def encode_labels(raw):
    return np.array([float(label in raw) for label in RAW_LABELS], dtype=np.float32)


def sample_video(path, count=FRAMES):
    return base_sample(path, count)


def prepare_input(raw, duration_seconds):
    skeleton, base, quality = base_prepare(raw, duration_seconds, count=FRAMES)
    points = skeleton[:2].transpose(1, 2, 0)
    conf = skeleton[2]
    def signal(joints, compute):
        good = (conf[:, joints] >= .2).all(1)
        values = compute(points)
        if good.sum() < 3:
            return np.zeros(FRAMES, dtype=np.float32)
        return np.interp(np.arange(FRAMES), np.flatnonzero(good), values[good])
    arms = signal([5, 6, 9, 10], lambda p: (p[:, 5, 1]+p[:, 6, 1]-p[:, 9, 1]-p[:, 10, 1])/2)
    legs = signal([15, 16], lambda p: np.abs(p[:, 15, 0]-p[:, 16, 0]))
    hips = signal([11, 12], lambda p: (p[:, 11, 1]+p[:, 12, 1])/2)
    left = signal([5, 9], lambda p: p[:, 5, 1]-p[:, 9, 1])
    right = signal([6, 10], lambda p: p[:, 6, 1]-p[:, 10, 1])
    def corr(a, b):
        return float(np.corrcoef(a, b)[0, 1]) if min(np.std(a),np.std(b)) > 1e-5 else 0.
    dt = max(float(duration_seconds), .01)/(FRAMES-1)
    def frequency(values):
        centered = values - np.mean(values)
        power = np.abs(np.fft.rfft(centered*np.hanning(FRAMES)))**2
        frequencies = np.fft.rfftfreq(FRAMES, d=dt)
        valid = (frequencies >= .15) & (frequencies <= 2.)
        if not valid.any() or power[valid].sum() < 1e-8:
            return 0., 0.
        index = np.flatnonzero(valid)[np.argmax(power[valid])]
        return float(frequencies[index]), float(power[index]/max(power.sum(),1e-8))
    af, ac = frequency(arms); lf, lc = frequency(legs)
    extras = [np.ptp(arms), np.std(arms), np.max(arms), np.min(arms),
              np.ptp(legs), np.std(legs), np.max(legs), np.ptp(hips),
              corr(arms, legs), corr(left, right), af, ac, lf, lc,
              np.mean(np.abs(np.diff(arms)))/dt, np.mean(np.abs(np.diff(legs)))/dt]
    # Signed correlations and wrist elevation must retain their signs.
    context = np.concatenate([base, np.array(extras, dtype=np.float32)])
    return skeleton, np.clip(context, -10, 10), quality


def default_contract():
    return {'schema_version': SCHEMA_VERSION, 'frames': FRAMES, 'context_size': CONTEXT_SIZE,
            'coordinate_system': 'x/image_height,y/image_height,confidence',
            'normalization': 'sequence_median_pelvis_and_torso',
            'target_semantics': 'presence_of_Qualcomm_annotation; absence_is_not_verified_correctness',
            'labels': [dict(zip(['key','suffix','name_vi','group_vi','kind','rep_supported'],row),
                            raw_label=RAW_LABELS[i],threshold=.5) for i,row in enumerate(LABELS)]}
