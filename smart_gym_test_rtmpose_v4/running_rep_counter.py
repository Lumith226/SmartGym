"""Estimated per-leg repetition counter; does not generate model error labels."""
from collections import deque
import numpy as np


class RunningRepCounter:
    def __init__(self):self.reset()

    def reset(self):
        self.history=[deque(),deque()]
        self.armed=[False,False];self.raised=[False,False]
        self.last_seen=[None,None];self.started=[None,None]
        self.count=0

    def update(self,points,confidence,timestamp,exercise):
        finished=False;available=False;indicators=[]
        for i,(shoulder,hip,knee,ankle) in enumerate([(5,11,13,15),(6,12,14,16)]):
            joints=[shoulder,hip,knee] if exercise=='high_knees' else [shoulder,hip,knee,ankle]
            if min(confidence[j] for j in joints)<.25:
                self.armed[i]=self.raised[i]=False
                self.history[i].clear();self.last_seen[i]=None
                continue
            if self.last_seen[i] is not None and (timestamp<=self.last_seen[i] or timestamp-self.last_seen[i]>.5):
                self.armed[i]=self.raised[i]=False;self.history[i].clear()
            self.last_seen[i]=timestamp;available=True
            scale=max(float(np.linalg.norm(points[:,shoulder]-points[:,hip])),.05)
            value=float((points[1,hip]-points[1,knee])/scale if exercise=='high_knees'
                        else (points[1,knee]-points[1,ankle])/scale)
            indicators.append(value)
            history=self.history[i];history.append((timestamp,value))
            while history and timestamp-history[0][0]>4.:history.popleft()
            if len(history)<8:continue
            values=np.array([v for _,v in history])
            lo,hi=np.percentile(values,[10,90])
            if hi-lo<.2:
                self.armed[i]=self.raised[i]=False
                continue
            lower=lo+.3*(hi-lo);upper=lo+.7*(hi-lo)
            if value<=lower:
                if self.raised[i] and timestamp-self.started[i]>=.08:
                    self.count+=1;finished=True
                self.armed[i]=True;self.raised[i]=False
            elif value>=upper and self.armed[i] and not self.raised[i]:
                self.raised[i]=True;self.started[i]=timestamp;self.armed[i]=False
        return {'rep_count':self.count,'state':'THEO DÕI TỪNG CHÂN' if available else 'CHỜ KHỚP CHÂN',
                'indicator':max(indicators) if indicators else None,'just_finished_rep':finished,
                'need_full_body':not available,'rep_count_estimated':True,
                'count_convention':'Mỗi lần một chân nâng/gập rồi hạ là một lượt ước lượng; không phải rps nguồn.'}
