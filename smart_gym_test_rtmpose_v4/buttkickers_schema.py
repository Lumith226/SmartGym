"""All 14 original Qualcomm butt-kickers labels; visibility is not a form error."""
import numpy as np
from squat_schema import sample_video as base_sample,write_json,sha256,video_id
from running_features import FRAMES,CONTEXT_SIZE,prepare_running_input,contract

SCHEMA_VERSION='qualcomm-buttkickers-14-192frames-context48-v1'
LABELS=[]
for suffix,name,kind in [
    ('bringing knees forward','Đưa gối ra trước thay vì bàn chân ra sau','error'),
    ('feet stay below knees','Bàn chân nâng thấp, còn dưới gối','error'),
    ('stepping','Bước từng chân một','attribute'),
    ('looking at feet','Nhìn xuống bàn chân','attribute'),
    ('not in place','Di chuyển khỏi vị trí','error'),
    ('feet disappear behind knees','Bàn chân khuất sau gối','attribute'),
    ('not visible','Không thấy đầy đủ người','context'),
    ('early stopping','Dừng bài sớm','context')]:
    LABELS.append((suffix.replace(' ','_'),suffix,name,'Chuyển động',kind,False))
for value in [1.,1.2,1.6,2.,2.5,3.]:
    suffix=f'speed={value:.2f} rps'
    LABELS.append(('speed_'+f'{value:.2f}'.replace('.','_'),suffix,f'Tốc độ: mức {value:g} rps','Tốc độ gốc','attribute',False))
RAW_LABELS=['buttkickers - '+r[1] for r in LABELS]
KEYS=[r[0] for r in LABELS]
def encode_labels(raw):return np.array([float(l in raw) for l in RAW_LABELS],dtype=np.float32)
def sample_video(path,count=FRAMES):return base_sample(path,count)
def prepare_input(raw,duration_seconds):return prepare_running_input(raw,duration_seconds)
def default_contract():return contract(SCHEMA_VERSION,LABELS,RAW_LABELS)
