"""All 19 reverse-crunch labels; not conventional sit-ups."""
import numpy as np
from squat_schema import sample_video as base_sample, write_json, sha256, video_id
from floor_features import prepare_floor

SCHEMA_VERSION='qualcomm-reverse-crunch-19-128frames-context32-v1'
FRAMES=128
CONTEXT_SIZE=32
PREFIX='reverse crunches - '
LABELS=[
 ('range_90','90 degrees','Co chân đến 90°','Biên độ','attribute',True),
 ('range_over_90','over 90 degrees','Co chân vượt 90°','Biên độ','attribute',True),
 ('range_below_90','below 90 degrees','Co chân chưa đến 90°','Biên độ','error',True),
 ('not_raising_hips','not raising hips','Chưa nâng hông khỏi sàn','Hông','error',True),
 ('extending_legs','extending legs','Duỗi chân','Chân','attribute',True),
 ('feet_down','feet down','Bàn chân đặt trên sàn','Chân','attribute',True),
 ('thighs_not_moving','thighs not moving','Đùi không chuyển động','Chân','error',True),
 ('head_up','head up','Đầu nâng lên','Đầu','attribute',True),
 ('frontal','frontal','Bàn chân hướng về camera','Góc nhìn','attribute',True),
 ('not_moving','not moving','Không chuyển động','Trạng thái video','context',False),
 ('getting_into_position','getting into position','Đang vào tư thế','Trạng thái video','context',False),
 ('slow','slow','Thực hiện chậm','Tốc độ','attribute',False),
 ('fast','fast','Thực hiện nhanh','Tốc độ','attribute',False),
 ('not_visible','not visible','Không nhìn thấy rõ','Quan sát','visibility',True),
]+[(f'height_{i}',f'height={i}',f'Mức nâng {i}','Mức nâng gốc','attribute',True) for i in range(1,6)]
RAW_LABELS=[PREFIX+row[1] for row in LABELS]
KEYS=[row[0] for row in LABELS]
def encode_labels(raw):return np.asarray([float(label in raw) for label in RAW_LABELS],np.float32)
def sample_video(path,count=FRAMES):return base_sample(path,count)
def prepare_input(raw,duration_seconds):return prepare_floor(raw,duration_seconds,'crunch',FRAMES)
def default_contract():
 return {'schema_version':SCHEMA_VERSION,'frames':FRAMES,'context_size':CONTEXT_SIZE,
         'coordinate_system':'x/image_height,y/image_height,confidence','normalization':'sequence_median_pelvis_and_torso',
         'target_semantics':'presence_of_Qualcomm_annotation; absence_is_not_verified_correctness',
         'labels':[dict(zip(['key','suffix','name_vi','group_vi','kind','rep_supported'],row),raw_label=RAW_LABELS[i],threshold=.5) for i,row in enumerate(LABELS)]}
