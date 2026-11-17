"""Shared offline/streaming phase-confirmed SciPy cutter for six V4 exercises.

All coordinates are x/image_height,y/image_height,confidence. No error labels.
The first three signal/prominence settings come from the earlier RepCount
experiment. The three additional exercises use initial, unvalidated settings.
Phase/edge padding policy is versioned separately and needs its own evaluation.
"""
from collections import deque
import numpy as np
from scipy.signal import find_peaks
from scipy.ndimage import median_filter, gaussian_filter1d

VERSION='phase-confirmed-padding-v2-six-exercises'
CONFIGS={
 'squat':dict(signal='hip_height',prominence=.4,distance=.45,width=.12,padding=.15,ready_s=.08),
 'push_up':dict(signal='elbow',prominence=.25,distance=.7,width=.12,padding=.15,ready_s=.08),
 'jump_jack':dict(signal='arms',prominence=.4,distance=.45,width=.12,padding=.1,ready_s=.06),
 'situp':dict(signal='hip_flexion',prominence=.3,distance=.7,width=.12,padding=.15,ready_s=.08),
 'high_knees':dict(signal='knee_lift',prominence=.3,distance=.25,width=.06,padding=.08,ready_s=.04,smoothing_s=.04,max_gap_s=.15),
 'butt_kickers':dict(signal='knee_flexion',prominence=.35,distance=.25,width=.06,padding=.08,ready_s=.04,smoothing_s=.04,max_gap_s=.15),
}


def movement_signal(k,exercise):
    p=k[:,:2].transpose(0,2,1);c=k[:,2]
    shoulders=(p[:,5]+p[:,6])/2;hips=(p[:,11]+p[:,12])/2
    if exercise in ('push_up','situp'):
        triples=[(5,7,9),(6,8,10)] if exercise=='push_up' else [(5,11,13),(6,12,14)]
        ids=max(triples,key=lambda ids:np.mean(np.min(c[:,ids],axis=1)>=.3))
        a,b,d=ids;u=p[:,a]-p[:,b];v=p[:,d]-p[:,b]
        den=np.linalg.norm(u,axis=1)*np.linalg.norm(v,axis=1)
        angle=np.degrees(np.arccos(np.clip((u*v).sum(1)/np.maximum(den,1e-9),-1,1)))
        return (180-angle)/90,(np.min(c[:,ids],axis=1)>=.3)&(den>1e-9)
    torso=np.linalg.norm(shoulders-hips,axis=1)
    good=np.min(c[:,[5,6,11,12]],axis=1)>=.3
    scale=max(float(np.median(torso[good])) if good.any() else .2,.02)
    if exercise=='squat':return hips[:,1]/scale,good
    return (shoulders[:,1]-(p[:,9,1]+p[:,10,1])/2)/scale,np.min(c[:,[5,6,9,10,11,12]],axis=1)>=.3


def _leg_signals(k,exercise):
    p=k[:,:2].transpose(0,2,1);c=k[:,2];result=[]
    for side,shoulder,hip,knee,ankle in [('left',5,11,13,15),('right',6,12,14,16)]:
        ids=[shoulder,hip,knee] if exercise=='high_knees' else [hip,knee,ankle]
        valid=np.min(c[:,ids],axis=1)>=.3
        if exercise=='high_knees':
            torso=np.linalg.norm(p[:,shoulder]-p[:,hip],axis=1)
            scale=max(float(np.median(torso[valid])) if valid.any() else .2,.02)
            y=(p[:,hip,1]-p[:,knee,1])/scale;valid &= torso>1e-9
        else:
            u=p[:,hip]-p[:,knee];v=p[:,ankle]-p[:,knee]
            den=np.linalg.norm(u,axis=1)*np.linalg.norm(v,axis=1)
            angle=np.degrees(np.arccos(np.clip((u*v).sum(1)/np.maximum(den,1e-9),-1,1)))
            y=(180-angle)/90;valid &= den>1e-9
        result.append((side,y,valid))
    return result


def cut_reps(keypoints,times,exercise):
    if exercise not in CONFIGS:raise ValueError(exercise)
    k=np.asarray(keypoints,np.float32);t=np.asarray(times,float)
    if k.shape!=(len(t),3,17) or not np.isfinite(k).all() or not np.isfinite(t).all():raise ValueError('Invalid pose/timestamp array')
    if np.any(np.diff(t)<=0):raise ValueError('Timestamps must increase')
    if exercise in ('high_knees','butt_kickers'):
        all_events=[];signals={}
        for side,raw,valid in _leg_signals(k,exercise):
            events,y=_cut_signal(k,t,exercise,raw,valid)
            all_events.extend(dict(e,side=side) for e in events);signals[side]=y
        all_events.sort(key=lambda e:(e['core_end'],e['peak'],e['side']))
        for i,e in enumerate(all_events,1):e['rep_id']=i
        return all_events,signals
    raw,valid=movement_signal(k,exercise)
    return _cut_signal(k,t,exercise,raw,valid)


def _cut_signal(k,t,exercise,raw,valid):
    signal=np.full(len(t),np.nan);events=[]
    if len(t)<5:return events,signal
    cfg=CONFIGS[exercise]
    # Break on missing observations; never bridge camera gaps.
    gaps=np.r_[0,np.flatnonzero(np.diff(t)>.5)+1,len(t)]
    for ga,gb in zip(gaps[:-1],gaps[1:]):
        dt=float(np.mean(np.diff(t[ga:gb]))) if gb-ga>1 else .1
        bad=np.flatnonzero(np.diff(np.r_[False,~valid[ga:gb],False])).reshape(-1,2)
        for x,z in bad:
            a,b=ga+x,ga+z
            if a>ga and b<gb and t[b]-t[a]<=cfg.get('max_gap_s',.25):
                raw[a:b]=np.interp(t[a:b],[t[a-1],t[b]],[raw[a-1],raw[b]]);valid[a:b]=True
        spans=np.flatnonzero(np.diff(np.r_[False,valid[ga:gb],False])).reshape(-1,2)
        for sa,sb in spans:
            a,b=ga+sa,ga+sb
            if b-a<5:continue
            y=gaussian_filter1d(median_filter(raw[a:b],size=3,mode='nearest'),max(.3,cfg.get('smoothing_s',.08)/max(dt,1e-6)),mode='nearest')
            signal[a:b]=y;tt=t[a:b]
            peaks,props=find_peaks(y,prominence=cfg['prominence'],distance=max(1,round(cfg['distance']/dt)),width=max(1,cfg['width']/dt))
            last_end=-1
            for pi,peak in enumerate(peaks):
                # Local return level follows the current excursion rather than
                # imposing one standing height/angle over a whole recording.
                lb=int(props['left_bases'][pi]);rb=int(props['right_bases'][pi])
                baseline=float(min(y[lb],y[rb]));low=baseline+.3*float(props['prominences'][pi])
                ready=y<=low
                runs=np.flatnonzero(np.diff(np.r_[False,ready,False])).reshape(-1,2)
                stable=[(int(u),int(v)) for u,v in runs if tt[v-1]-tt[u]+dt+1e-8>=cfg['ready_s']]
                before=[(u,v) for u,v in stable if v-1<peak and v-1>=last_end]
                after=[(u,v) for u,v in stable if u>peak]
                if not before or not after:continue
                start=before[-1][1]-1;end=after[0][0]
                if end<=start or tt[end]-tt[start]>15:continue
                # A stable initial pose is observed BEFORE each accepted peak.
                events.append(dict(core_start=float(tt[start]),peak=float(tt[peak]),core_end=float(tt[end]),
                                   confirmed_at=float(tt[after[0][1]-1]),baseline=baseline,ready_level=low))
                last_end=end
    events.sort(key=lambda e:e['peak'])
    for i,e in enumerate(events):
        pad=cfg['padding']
        left=events[i-1]['core_end'] if i else float(t[0])
        right=events[i+1]['core_start'] if i+1<len(events) else float(t[-1])
        e.update(start=max(float(t[0]),e['core_start']-pad,left),
                 end=min(float(t[-1]),e['core_end']+pad,right),padding_s=pad,rep_id=i+1)
    return events,signal


class BufferedRepCutter:
    def __init__(self,exercise):self.exercise=exercise;self.reset()
    def reset(self):
        self.history=deque();self.last_peak=-float('inf');self.last_peaks={};self.count=0;self.last_analysis=-float('inf')
    def update(self,k,timestamp):
        now=float(timestamp)
        if self.history and (now<=self.history[-1][0] or now-self.history[-1][0]>.5):self.history.clear()
        self.history.append((now,np.asarray(k,np.float32).copy()))
        while self.history and now-self.history[0][0]>20:self.history.popleft()
        result=[]
        if len(self.history)>=5 and now-self.last_analysis>=.1:
            self.last_analysis=now
            ts=np.array([t for t,_ in self.history]);seq=np.array([p for _,p in self.history])
            events,_=cut_reps(seq,ts,self.exercise)
            for e in events:
                side=e.get('side','body')
                if e['peak']<=self.last_peaks.get(side,-float('inf'))+CONFIGS[self.exercise]['distance']:continue
                if now<max(e['confirmed_at'],e['core_end']+e['padding_s']):continue
                mask=(ts>=e['start'])&(ts<=e['end'])
                if mask.sum()<3:continue
                self.last_peak=e['peak'];self.last_peaks[side]=e['peak'];self.count+=1
                result.append(dict(e,rep_id=self.count,keypoints=seq[mask],times=ts[mask]))
        return result
