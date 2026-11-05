"""Mirror-invariant floor-exercise context; no invented coordinates or EMA."""
import numpy as np
from squat_schema import prepare_input as base_prepare, resample, angle


def prepare_floor(raw, duration, exercise, count=128):
    skeleton, base, quality = base_prepare(raw, duration, count=count)
    points = skeleton[:2].transpose(1, 2, 0)
    confidence = skeleton[2]
    def valid(joints):
        return (confidence[:, joints] >= .2).all(axis=1)
    def angle_values(triples):
        result = []
        for a,b,c in triples:
            mask = valid([a,b,c])
            result.extend((angle(points[mask,a],points[mask,b],points[mask,c])/180).tolist())
        return np.asarray(result, dtype=np.float32)
    def stats(values, default=0.):
        if not len(values): return [default]*4
        return [float(np.percentile(values,10)),float(np.median(values)),
                float(np.percentile(values,90)),float(np.ptp(values))]
    def median(values):
        return float(np.median(values)) if len(values) else 0.
    elbows = angle_values([(5,7,9),(6,8,10)])
    hips = angle_values([(5,11,13),(6,12,14)])
    knees = angle_values([(11,13,15),(12,14,16)])
    torso = angle_values([(5,11,15),(6,12,16)])
    shoulder = (points[:,5]+points[:,6])/2
    hip = (points[:,11]+points[:,12])/2
    ankle = (points[:,15]+points[:,16])/2
    wrist = (points[:,9]+points[:,10])/2
    core = valid([5,11,13]) | valid([6,12,14])
    arms = valid([5,7,9]) | valid([6,8,10])
    feet = valid([11,13,15]) | valid([12,14,16])
    required = (valid([5,7,9,11]) | valid([6,8,10,12])) if exercise=='pushup' else core
    quality['valid_frame_ratio'] = round(float(required.mean()),4)
    quality['usable'] = bool(required.mean()>=.35)
    quality['joint_group_ratios'] = {'arms':round(float(arms.mean()),4),
                                    'core':round(float(core.mean()),4),
                                    'legs':round(float(feet.mean()),4)}
    base[2] = required.mean()
    mid_core = valid([5,6,11,12])
    head_ok = valid([0,5,6])
    head_height = shoulder[head_ok,1]-points[head_ok,0,1]
    hip_range = float(np.ptp(hip[mid_core,1])) if mid_core.any() else 0.
    if exercise=='pushup':
        body_ok = valid([5,6,11,12,15,16]) & (np.abs(ankle[:,0]-shoulder[:,0])>.1)
        # Vertical distance from the shoulder-ankle line is unchanged by mirror.
        x_fraction = np.divide(hip[:,0]-shoulder[:,0],ankle[:,0]-shoulder[:,0],
                               out=np.zeros(count),where=np.abs(ankle[:,0]-shoulder[:,0])>.1)
        deviation = (hip[:,1]-(shoulder[:,1]+x_fraction*(ankle[:,1]-shoulder[:,1])))[body_ok]
        hand_ok = valid([5,6,9,10])
        shoulder_width = np.linalg.norm(points[:,5]-points[:,6],axis=1)
        hand_ratio = np.linalg.norm(points[:,9]-points[:,10],axis=1)/np.maximum(shoulder_width,.1)
        reach_ok = hand_ok & valid([15,16])
        direction = ankle-shoulder
        reach = ((wrist-shoulder)*direction).sum(1)/np.maximum(np.linalg.norm(direction,axis=1),.1)
        both_elbows = valid([5,7,9,6,8,10])
        corr = 0.
        if both_elbows.sum()>=4:
            left=angle(points[both_elbows,5],points[both_elbows,7],points[both_elbows,9])
            right=angle(points[both_elbows,6],points[both_elbows,8],points[both_elbows,10])
            if min(np.std(left),np.std(right))>1e-4:corr=float(np.corrcoef(left,right)[0,1])
        extras = stats(elbows)+stats(torso)[:3]+[
            float(deviation.mean()) if len(deviation) else 0.,
            float(deviation.min()) if len(deviation) else 0.,
            float(deviation.max()) if len(deviation) else 0.,
            median(hand_ratio[hand_ok]),median(reach[reach_ok]),median(head_height),
            corr,hip_range,float(arms.mean())]
    else:
        ankle_ok = mid_core & valid([15,16])
        hip_height = shoulder[mid_core,1]-hip[mid_core,1]
        leg_height = hip[ankle_ok,1]-ankle[ankle_ok,1]
        symmetry_ok = valid([11,12,13,14,15,16])
        symmetry=np.linalg.norm((points[:,13]-points[:,11])-(points[:,14]-points[:,12]),axis=1)
        pairs = mid_core[1:] & mid_core[:-1]
        speed = np.abs(np.diff(hip[:,1]))/max(float(duration)/(count-1),.001)
        extras=stats(hips)+stats(knees)[:3]+[
            median(hip_height),float(np.ptp(hip_height)) if len(hip_height) else 0.,
            median(leg_height),float(np.ptp(leg_height)) if len(leg_height) else 0.,
            median(symmetry[symmetry_ok]),median(head_height),hip_range,
            float(speed[pairs].mean()) if pairs.any() else 0.,float(core.mean())]
    assert len(extras)==16
    context=np.concatenate([base,np.asarray(extras,dtype=np.float32)])
    if not np.isfinite(context).all():raise ValueError('Đặc trưng không hữu hạn')
    return skeleton,np.clip(context,-10,10),quality
