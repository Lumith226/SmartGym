"""Skeleton-only preprocessing shared by rep training and runtime. No context."""
import numpy as np

VERSION='rep-skeleton64-v1'


def prepare_skeleton(raw,count=64):
    raw=np.asarray(raw,np.float32)
    if raw.ndim!=3 or raw.shape[1:]!=(3,17) or len(raw)<2 or not np.isfinite(raw).all():raise ValueError('Invalid raw rep')
    grid=np.linspace(0,len(raw)-1,count)
    low=np.floor(grid).astype(int);high=np.ceil(grid).astype(int);w=(grid-low)[:,None,None]
    seq=raw[low]*(1-w)+raw[high]*w
    conf=np.clip(seq[:,2],0,1);xy=seq[:,:2].transpose(0,2,1).copy()
    hips=(xy[:,11]+xy[:,12])/2;shoulders=(xy[:,5]+xy[:,6])/2
    good=(conf[:,[5,6,11,12]]>=.2).all(1)
    center=np.median(hips[good],axis=0) if good.any() else np.array([.5,.5])
    scale=max(float(np.median(np.linalg.norm((shoulders-hips)[good],axis=1))),.05) if good.any() else .25
    normalized=np.clip((xy-center)/scale,-8,8);normalized[conf<.2]=0
    tensor=np.concatenate([normalized.transpose(2,0,1),conf[None]],axis=0).astype(np.float32)
    # Group quality is reported, not an additional learned model input.
    body_valid=(conf[:,[5,6,11,12,13,14,15,16]]>=.2).sum(1)>=5
    arms=(conf[:,[5,6,7,8,9,10]]>=.2).sum(1)>=3
    ratio=float(np.maximum(body_valid,arms).mean())
    return tensor,dict(valid_frame_ratio=ratio,mean_confidence=float(conf.mean()),usable=ratio>=.35,
                       min_knee_angle=None,max_torso_lean=None)
