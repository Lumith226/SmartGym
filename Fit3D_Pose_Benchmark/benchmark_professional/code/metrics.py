"""Pose metrics against projected MoCap, with missing detections penalized."""
import numpy as np
from dataset import COCO,FIT,NAMES,PAIRS

def evaluate(pred,gt,image_size,ids):
    p=pred[:,COCO,:2];conf=pred[:,COCO,2];g=gt[:,FIT]
    width,height=image_size
    # A common body scale for all models; no predicted-scale advantage.
    shoulders=(g[:,0]+g[:,1])/2;hips=(g[:,6]+g[:,7])/2
    torso=np.maximum(np.linalg.norm(shoulders-hips,axis=-1),20)
    inframe=(g[...,0]>=0)&(g[...,0]<width)&(g[...,1]>=0)&(g[...,1]<height)
    finite=np.isfinite(p).all(-1)&(conf>0)&(np.linalg.norm(p,axis=-1)>0)
    d=np.linalg.norm(p-g,axis=-1)/torso[:,None]
    pck=(d<=.2)&finite
    geometric_recall=np.sum(pck&inframe)/max(inframe.sum(),1)
    normalized_error=np.where(finite,np.minimum(d,2),2)
    # Scores are not calibrated across families. Confidence-based coverage is
    # descriptive only; geometric PCK does not use an arbitrary .3 threshold.
    score_coverage=np.sum((conf>=.3)&finite&inframe)/max(inframe.sum(),1)
    err=(p-g)/torso[:,None,None]
    dt=np.diff(ids)
    # Measure change in error on the common sampling grid, not body motion.
    delta=np.linalg.norm(np.diff(err,axis=0),axis=-1)
    pairs_valid=finite[1:]&finite[:-1]&inframe[1:]&inframe[:-1]
    jitter=float(np.mean(delta[pairs_valid])) if pairs_valid.any() else None
    swaps=[]
    for a,b in PAIRS:
        direct=np.linalg.norm(p[:,a]-g[:,a],axis=-1)+np.linalg.norm(p[:,b]-g[:,b],axis=-1)
        swapped=np.linalg.norm(p[:,a]-g[:,b],axis=-1)+np.linalg.norm(p[:,b]-g[:,a],axis=-1)
        valid=finite[:,a]&finite[:,b]&inframe[:,a]&inframe[:,b]&(np.linalg.norm(g[:,a]-g[:,b],axis=-1)>.1*torso)
        swaps.extend(((swapped+.1*torso<direct)&valid)[valid].tolist())
    return {
        'pck_torso_020_pct':float(100*geometric_recall),
        'normalized_error_capped2':float(normalized_error[inframe].mean()),
        'error_jitter_torso_per_sample':jitter,
        'missing_joint_pct':float(100*np.sum(~finite&inframe)/max(inframe.sum(),1)),
        'score_coverage_030_pct':float(100*score_coverage),
        'all_required_joints_correct_pct':float(100*np.mean(np.all(pck|~inframe,axis=-1))),
        'lr_confusion_candidate_pct':float(100*np.mean(swaps)) if swaps else None,
        'per_joint_pck':{name:float(100*np.sum(pck[:,j]&inframe[:,j])/max(inframe[:,j].sum(),1)) for j,name in enumerate(NAMES)},
        'evaluated_joint_count':int(inframe.sum()),
    }
