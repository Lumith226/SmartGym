"""Paired RTMPose speed check on a small, deterministic subset of source clips."""
import importlib.util
from time import perf_counter

import numpy as np

from adapters import Engine, Pose, W, get_box
from publish_results import MODEL, OLD, OUT, read, selected_frames, write


def main():
    spec = importlib.util.spec_from_file_location('legacy_adapter', OLD.parent / 'adapters.py')
    legacy = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(legacy)
    models = {'mean': legacy.Pose(MODEL), 'min': Pose(MODEL)}
    detector = Engine(W / 'yolov8n.onnx')
    cameras = ['50591643', '60457274']
    subjects = ['s03', 's08']
    clips = [c for c in read(OUT / 'run_manifest.json')['clips']
             if c['subject'] in subjects and c['camera'] in cameras]
    speeds = {r['clip_id']: r['frame_ids'] for r in read(OUT / 'rtmpose_speed.json')}
    records = []
    for clip in clips:
        ids = np.array(speeds[clip['id']])
        frames = selected_frames(clip, ids)
        for model in models.values():
            for _ in range(5):
                model(frames[0].copy(), get_box(frames[0], detector))
        elapsed = {k: [] for k in models}
        for i, cached in enumerate(frames):
            keys = list(models)
            if i % 2:
                keys.reverse()
            for key in keys:
                f = cached.copy()
                start = perf_counter()
                models[key](f, get_box(f, detector))
                elapsed[key].append((perf_counter() - start) * 1000)
        records.append(dict(clip=clip['id'], exercise=clip['exercise'], ms=elapsed,
                            fps={k: 1000 / float(np.mean(v)) for k, v in elapsed.items()}))
    summary = {ex: {k: float(np.mean([r['fps'][k] for r in records if r['exercise'] == ex]))
                    for k in models} for ex in ('squat', 'pushup')}
    write(OUT / 'paired_speed_control.json', dict(summary=summary, records=records,
          protocol='4 clips per exercise, 30 original probe frames per clip; alternate old/new per frame'))
    print(summary)


if __name__ == '__main__':
    main()
