"""Rerun RTMPose with the audited SimCC decoder and publish comparable results."""
import csv
import hashlib
import json
from pathlib import Path

import numpy as np

from adapters import Engine, Pose, W, get_box
from dataset import COCO, FIT
from metrics import evaluate
from time import perf_counter

ROOT = Path(__file__).resolve().parents[1]
OLD = ROOT.parent / 'pose_benchmark' / 'results_full'
OUT = ROOT / 'results'
MODEL = 'RTMPose-m'
LITE = 'LitePose-Auto-S'
EXERCISES = ('squat', 'pushup')


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def write(path, data):
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(data, indent=2, ensure_ascii=False, allow_nan=False), encoding='utf-8')
    temp.replace(path)


def write_csv(path, rows):
    with path.open('w', newline='', encoding='utf-8-sig') as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def sha(path):
    with path.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def source_prediction(model, cid):
    root = OUT if model == MODEL else OLD
    return root / 'predictions' / (model + '__' + cid + '.npz')


def selected_frames(clip, ids):
    base = OLD / 'speed_frame_cache' / clip['id']
    meta = read(base.with_suffix('.json'))
    source = Path(clip['video'])
    status = source.stat()
    assert meta['frame_ids'] == ids.tolist()
    assert meta['source_bytes'] == status.st_size and meta['source_mtime_ns'] == status.st_mtime_ns
    frames = np.load(base.with_suffix('.npy'), mmap_mode='r')
    assert frames.shape == (len(ids), 900, 900, 3) and frames.dtype == np.uint8
    return frames


def measure_speed(clips):
    model = Pose(MODEL)
    detector = Engine(W / 'yolov8n.onnx')
    for clip in clips:
        cid = clip['id']
        with np.load(source_prediction(MODEL, cid)) as d:
            ix = np.linspace(0, len(d['ids']) - 1, 30, dtype=int)
            ids, gt, clean = d['ids'][ix], d['gt'][ix], d['pred'][ix]
        frames = selected_frames(clip, ids)
        frame = frames[0].copy()
        for _ in range(5):
            model(frame, get_box(frame, detector))
        durations, detector_ms, neural = [], [], []
        for cached in frames:
            frame = cached.copy()
            begin = perf_counter()
            box = get_box(frame, detector)
            detected = perf_counter()
            model(frame, box)
            durations.append((perf_counter() - begin) * 1000)
            detector_ms.append((detected - begin) * 1000)
            neural.append(model.inference_ms if box is not None else 0.0)
        good = [n for n in neural if n > 0]
        yield dict(model=MODEL, clip_id=cid, frame_ids=ids.tolist(), frames=len(ids),
                   pipeline_fps=1000 / np.mean(durations), pipeline_median_ms=float(np.median(durations)),
                   pipeline_p95_ms=float(np.percentile(durations, 95)),
                   neural_median_ms=float(np.median(good)) if good else None,
                   detector_median_ms=float(np.median(detector_ms)),
                   detector_missing_frames=len(neural) - len(good), pipeline_ms=durations, neural_ms=neural)
        print('SPEED', cid, round(1000 / np.mean(durations), 2), flush=True)


def occlusion_probe(clips):
    model = Pose(MODEL)
    detector = Engine(W / 'yolov8n.onnx')
    for clip in clips:
        cid = clip['id']
        if clip['exercise'] != 'pushup':
            continue
        with np.load(source_prediction(MODEL, cid)) as d:
            ix = np.linspace(0, len(d['ids']) - 1, 30, dtype=int)
            ids, gt, clean = d['ids'][ix], d['gt'][ix], d['pred'][ix]
        frames = selected_frames(clip, ids)
        with np.load(OLD / 'occlusion' / (cid + '.npz')) as old:
            assert np.array_equal(old['ids'], ids) and np.array_equal(old['gt'], gt)
        lo, hi = gt.reshape(-1, 2).min(0), gt.reshape(-1, 2).max(0)
        a = np.maximum(np.floor([lo[0] - 5, lo[1] + .7 * (hi[1] - lo[1])]).astype(int), 0)
        b = np.minimum(np.ceil(hi + 5).astype(int), 900)
        x0, y0 = a
        x1, y1 = b
        pts = gt[:, FIT]
        hidden = ((pts >= a) & (pts < b)).all(2)
        pred, durations, miss = [], [], 0
        for index, original in enumerate(frames):
            frame = original.copy()
            frame[y0:y1, x0:x1] = 64
            if index == 0:
                for _ in range(5):
                    model(frame, get_box(frame, detector))
            start = perf_counter()
            box = get_box(frame, detector)
            pred.append(model(frame, box))
            miss += box is None
            durations.append((perf_counter() - start) * 1000)
        pred = np.array(pred)
        p = pred[:, COCO]
        torso = np.maximum(np.linalg.norm((gt[:, 11] + gt[:, 14] - gt[:, 1] - gt[:, 4]) / 2, axis=1), 20)
        hit = ((np.linalg.norm(p[..., :2] - pts, axis=2) <= .2 * torso[:, None]) &
               (p[..., 2] > 0) & np.any(p[..., :2] != 0, axis=2))
        v = ((pts >= 0) & (pts < 900)).all(2)
        hidden &= v
        clean_pck = evaluate(clean, gt, (900, 900), ids)['pck_torso_020_pct']
        masked_pck = evaluate(pred, gt, (900, 900), ids)['pck_torso_020_pct']
        row = dict(model=MODEL, clip=clip, frame_ids=ids.tolist(), rectangle_xyxy=[int(x0), int(y0), int(x1), int(y1)],
                   clean_pck=clean_pck, occluded_pck=masked_pck, delta_pck=masked_pck-clean_pck,
                   hidden_joint_pck=100 * float(hit[hidden].mean()) if hidden.any() else None,
                   hidden_joint_samples=int(hidden.sum()), total_inframe_joint_samples=int(v.sum()),
                   detector_missing_pct=100 * miss / len(ids), pipeline_fps=1000 / np.mean(durations),
                   rep_mae=None, form_accuracy=None)
        np.savez_compressed(OUT / 'occlusion' / (cid + '.npz'), ids=ids, pred=pred, clean_pred=clean, gt=gt, hidden=hidden)
        print('MASK', cid, round(masked_pck, 2), flush=True)
        yield row


def comparison(rows, models, subjects):
    rng = np.random.default_rng(20261104)
    draws = rng.integers(len(subjects), size=(50000, len(subjects)))
    groups = {(exercise, model): [r for r in rows if r['clip']['exercise'] == exercise and r['model'] == model]
              for exercise in EXERCISES for model in models}
    p = {}
    summary = {e: [] for e in EXERCISES}
    camera_rows = []
    for (exercise, model), g in groups.items():
        p[exercise, model] = np.array([
            [np.mean([r[key] for r in g if r['clip']['subject'] == s]) for s in subjects]
            for key in ('pck', 'mae')])
        summary[exercise].append(dict(model=model, ranked=model != LITE,
            **{key: float(np.mean([r[key] for r in g])) for key in ('pck', 'mae', 'fps', 'fps_pose', 'jitter', 'missing')},
            exact_pct=100 * sum(r['mae'] == 0 for r in g) / len(g),
            skipped_frames=sum(r['speed_skipped'] for r in g), speed_frames=30 * len(g)))
        for camera in sorted({r['clip']['camera'] for r in g}):
            cg = [r for r in g if r['clip']['camera'] == camera]
            assert len(cg) == 8
            camera_rows.append(dict(exercise=exercise, model=model, camera=camera, ranked=model != LITE, clips=len(cg),
                **{key: float(np.mean([r[key] for r in cg])) for key in ('angle', 'pck', 'mae', 'fps', 'fps_pose', 'jitter', 'missing')},
                exact_pct=100 * sum(r['mae'] == 0 for r in cg) / len(cg), form_accuracy='N/A'))
    pairs = [('squat', 'RTMO-s', 'HRNet', 0), ('squat', 'RTMO-s', 'ViTPose-B', 0),
             ('pushup', MODEL, 'ViTPose-B', 0), ('pushup', 'RTMO-s', MODEL, 1)]
    paired = []
    for exercise, a, b, index in pairs:
        diff = p[exercise, a][index] - p[exercise, b][index]
        paired.append(dict(exercise=exercise, a=a, b=b, metric=('pck', 'mae')[index],
                           delta=float(diff.mean()), ci=np.percentile(diff[draws].mean(1), [2.5, 97.5]).tolist()))
    return summary, camera_rows, paired


def aggregate(new_speed, new_mask):
    manifest = read(OUT / 'run_manifest.json')
    clips, models = manifest['clips'], manifest['models']
    source = {(r['model'], r['clip']['id']): r for r in read(OLD / 'all_measured_results.json')}
    speed = {(r['model'], r['clip_id']): r for r in read(OLD / 'speed_results.json')}
    original_speed = speed.copy()
    for row in new_speed:
        speed[MODEL, row['clip_id']] = row
    rows = []
    for clip in clips:
        cid = clip['id']
        for model in models:
            legacy = source[model, cid]
            q = read(source_prediction(model, cid).with_suffix('.json')) if model == MODEL else legacy
            s = speed[model, cid]
            d = np.array(s['pipeline_ms'])
            successful = np.array(s['neural_ms']) > 0
            assert len(d) == 30 and successful.sum() > 0
            assert s['frame_ids'] == original_speed[model, cid]['frame_ids']
            assert q['application']['form_accuracy'] is None
            if model == MODEL:
                with np.load(source_prediction(model, cid)) as fresh, np.load(OLD / 'predictions' / (model + '__' + cid + '.npz')) as old:
                    assert np.array_equal(fresh['ids'], old['ids']) and np.array_equal(fresh['gt'], old['gt'])
                    assert np.isfinite(fresh['pred']).all()
                    score = evaluate(fresh['pred'], fresh['gt'], (900, 900), fresh['ids'])
                    assert np.isclose(score['pck_torso_020_pct'], q['pck_torso_020_pct'])
            rows.append(dict(model=model, clip=clip, pck=q['pck_torso_020_pct'],
                mae=q['application']['rep_absolute_error'], fps=s['pipeline_fps'], fps_pose=float(1000 / d[successful].mean()),
                jitter=q['error_jitter_torso_per_sample'], missing=q['missing_joint_pct'], speed_skipped=int((~successful).sum()),
                angle=legacy['relative_azimuth_deg'], view=legacy['view_category'], form_accuracy=None,
                counted=q['application']['predicted_reps_in_annotated_window'], gt_reps=q['application']['gt_complete_intervals']))
    summary, camera_rows, paired = comparison(rows, models, manifest['subjects'])
    masks = [r for r in read(OLD / 'occlusion' / 'results.json') if r['clip']['exercise'] == 'squat'] + new_mask
    assert len(rows) == len(speed) == 640 and len(camera_rows) == 80 and len(masks) == 64
    write(OUT / 'summary.json', summary)
    write(OUT / 'comparison_by_clip.json', rows)
    write(OUT / 'paired_bootstrap.json', paired)
    write(OUT / 'occlusion' / 'results.json', masks)
    write(OUT / 'speed_results.json', list(speed.values()))
    write_csv(OUT / 'comparison_camera_summary.csv', camera_rows)
    tracked = [OLD / n for n in ('MODEL_PROVENANCE.json', 'INPUT_FINGERPRINTS.json',
                  'all_measured_results.json', 'speed_results.json', 'occlusion/results.json')]
    write(OUT / 'provenance_revision.json', dict(
        reevaluated_model=MODEL, rtmo_mask_reused=True, unchanged_model_rows=576,
        checkpoint='rtmpose-m_simcc-body7_pt-body7_420e-256x192-e48f03d0_20230504',
        gpu='AMD Radeon RX 5600 XT / DirectML device 0 with CPU fallback',
        adapter_sha256=sha(ROOT / 'code' / 'adapters.py'), artifact_sha256=sha(W / 'rtmpose_m.onnx'),
        detector_sha256=sha(W / 'yolov8n.onnx'), source_sha256={str(x.relative_to(OLD)): sha(x) for x in tracked},
        litepose_scope='Historical heatmap-only adapter, exploratory and excluded from main ranks',
        speed_scope='RTMPose rerun separately using the original 30-frame clip grids and protocol, other rows retained',
        bootstrap_seed=20261104, bootstrap_resamples=50000))
    print('FINAL', len(rows), len(camera_rows), len(masks), flush=True)


if __name__ == '__main__':
    clips = read(OUT / 'run_manifest.json')['clips']
    for c in clips:
        path = source_prediction(MODEL, c['id'])
        assert path.is_file() and path.with_suffix('.json').is_file(), path
    speed_path = OUT / 'rtmpose_speed.json'
    mask_path = OUT / 'occlusion' / 'rtmpose_mask.json'
    speed = list(measure_speed(clips))
    write(speed_path, speed)
    masked = list(occlusion_probe(clips))
    write(mask_path, masked)
    aggregate(speed, masked)
