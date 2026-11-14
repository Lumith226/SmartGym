"""Shared pose/timing features for running drills, without rule-generated labels."""
import numpy as np
from squat_schema import prepare_input as base_prepare, angle

FRAMES=192
CONTEXT_SIZE=48


def prepare_running_input(raw,duration_seconds):
    skeleton,base,quality=base_prepare(raw,duration_seconds,count=FRAMES)
    p=skeleton[:2].transpose(1,2,0)
    conf=skeleton[2]
    signals=[];valid_ratios=[]
    for side in [(5,11,13,15),(6,12,14,16)]:
        sh,hip,knee,ankle=side
        definitions=[([hip,knee],p[:,hip,1]-p[:,knee,1]),
                     ([knee,ankle],p[:,knee,1]-p[:,ankle,1]),
                     ([hip,knee,ankle],angle(p[:,hip],p[:,knee],p[:,ankle])/180),
                     ([sh,hip,knee],angle(p[:,sh],p[:,hip],p[:,knee])/180)]
        for joints,values in definitions:
            good=(conf[:,joints]>=.2).all(1)
            valid_ratios.append(float(good.mean()))
            signal=np.interp(np.arange(FRAMES),np.flatnonzero(good),values[good]) if good.sum()>=3 else np.zeros(FRAMES)
            signals.append(signal)
    extras=[]
    # 8 signals * 3 statistics = 24 values. Keep each side separate.
    for signal in signals:
        extras.extend([float(np.percentile(signal,10)),float(np.percentile(signal,90)),float(np.std(signal))])
    def frequency(signal):
        centered=(signal-signal.mean())*np.hanning(FRAMES)
        power=np.abs(np.fft.rfft(centered))**2
        hz=np.fft.rfftfreq(FRAMES,d=max(float(duration_seconds),.01)/(FRAMES-1))
        mask=(hz>=.3)&(hz<=5.)
        if not mask.any() or power[mask].sum()<1e-8:return 0.,0.
        index=np.flatnonzero(mask)[np.argmax(power[mask])]
        return float(hz[index]),float(power[index]/max(power.sum(),1e-8))
    # Alternating movement can have a different count convention than source rps.
    # Frequencies are learned inputs, never labels or direct speed judgements.
    for signal in [signals[0],signals[4],signals[1],signals[5]]:
        extras.extend(frequency(signal))
    context=np.concatenate([base,np.asarray(extras,dtype=np.float32)])
    quality['lower_body_visible_ratio']=round(float(np.mean(valid_ratios)),4)
    assert context.shape==(CONTEXT_SIZE,)
    return skeleton,np.clip(context,-10,10),quality


def contract(schema_version,labels,raw_labels):
    return {'schema_version':schema_version,'frames':FRAMES,'context_size':CONTEXT_SIZE,
            'coordinate_system':'x/image_height,y/image_height,confidence',
            'normalization':'sequence_median_pelvis_and_torso',
            'target_semantics':'presence_of_Qualcomm_annotation; absence_is_not_verified_correctness',
            'speed_note':'Source rps and angle levels retain source semantics; no rule-based correct label.',
            'labels':[dict(zip(['key','suffix','name_vi','group_vi','kind','rep_supported'],row),
                           raw_label=raw_labels[i],threshold=.5,window_supported=row[4]!='context') for i,row in enumerate(labels)]}
