"""All 31 original Qualcomm high-knees labels; never merge with high-knees march."""
import numpy as np
from squat_schema import sample_video as base_sample,write_json,sha256,video_id
from running_features import FRAMES,CONTEXT_SIZE,prepare_running_input,contract

SCHEMA_VERSION='qualcomm-highknees-31-192frames-context48-v1'
LABELS=[]
for suffix,name,kind in [
    ('not straight','Gối không di chuyển thẳng lên xuống','error'),
    ('not in place','Di chuyển khỏi vị trí','error'),
    ('arms down','Hai tay hạ xuống','error'),
    ('not jumping','Bước chân, không bật nhảy','error'),
    ('only left leg','Chỉ nâng chân trái','attribute'),
    ('only right leg','Chỉ nâng chân phải','attribute'),
    ('single repetition','Chỉ thực hiện một lượt','context'),
    ('early stopping','Dừng bài sớm','context')]:
    LABELS.append((suffix.replace(' ','_'),suffix,name,'Chuyển động',kind,False))
for value in [30.,37.5,45.,52.5,60.,75.,90.,97.5,105.]:
    suffix=f'angle={value:.1f} degrees'
    LABELS.append(('angle_'+str(value).replace('.','_'),suffix,f'Góc: mức {value:g}° theo nguồn','Góc gốc','attribute',False))
for value in [.5,1.,1.25,1.5,1.75,2.,2.25,2.5,2.75,3.,3.25,3.5,3.75,4.]:
    suffix=f'speed={value:.2f} rps'
    LABELS.append(('speed_'+f'{value:.2f}'.replace('.','_'),suffix,f'Tốc độ: mức {value:g} rps','Tốc độ gốc','attribute',False))
RAW_LABELS=['high knees - '+r[1] for r in LABELS]
KEYS=[r[0] for r in LABELS]
def encode_labels(raw):return np.array([float(l in raw) for l in RAW_LABELS],dtype=np.float32)
def sample_video(path,count=FRAMES):return base_sample(path,count)
def prepare_input(raw,duration_seconds):return prepare_running_input(raw,duration_seconds)
def default_contract():return contract(SCHEMA_VERSION,LABELS,RAW_LABELS)
