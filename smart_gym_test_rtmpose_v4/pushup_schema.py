"""All 21 original Qualcomm pushups labels; ordinary pushups only."""
import numpy as np
from squat_schema import sample_video as base_sample, write_json, sha256, video_id
from floor_features import prepare_floor

SCHEMA_VERSION='qualcomm-pushup-21-128frames-context32-v1'
FRAMES=128
CONTEXT_SIZE=32
PREFIX='pushups - '
LABELS=[
 ('depth_90','90 degrees','Khuỷu gập 90°','Độ sâu','attribute',True),
 ('too_deep','deep','Xuống quá sâu','Độ sâu','error',True),
 ('shallow','shallow','Xuống nông','Độ sâu','error',True),
 ('insufficient','insufficient','Thực hiện chưa đầy đủ','Chuyển động','error',True),
 ('shoulder_width','shoulder-width','Tay rộng bằng vai','Khoảng cách tay','attribute',True),
 ('wide','wide','Tay mở rộng','Khoảng cách tay','attribute',True),
 ('very_wide','very wide','Đặt tay quá rộng','Khoảng cách tay','error',True),
 ('narrow','narrow','Đặt tay quá hẹp','Khoảng cách tay','error',True),
 ('elevated_hips','elevated hips','Hông nâng quá cao','Hông','error',True),
 ('butt_sinking','butt sinking','Hông bị võng xuống','Hông','error',True),
 ('legs_on_floor','legs on the floor','Chân nằm trên sàn','Chân','error',True),
 ('side_to_side','side to side','Người dịch chuyển sang hai bên','Chuyển động','error',True),
 ('child_pose_cheat','child pose cheat','Chuyển sang tư thế em bé','Chuyển động','error',True),
 ('sloppy','sloppy','Dáng tập thiếu ổn định','Chuyển động','error',True),
 ('moving_head','moving head','Đầu chuyển động','Đầu','attribute',True),
 ('head_down','head down','Đầu cúi xuống','Đầu','attribute',True),
 ('head_out_of_frame','head moving in an out of frame','Đầu ra vào khung hình','Quan sát','visibility',False),
 ('waiting_position','waiting position','Tư thế chờ chống tay','Trạng thái video','context',False),
 ('early_stopping','early stopping','Dừng sớm','Trạng thái video','context',False),
 ('fast','fast','Thực hiện nhanh','Tốc độ','attribute',False),
 ('not_visible','not visible','Không nhìn thấy rõ','Quan sát','visibility',True),
]
RAW_LABELS=[PREFIX+row[1] for row in LABELS]
KEYS=[row[0] for row in LABELS]
def encode_labels(raw):return np.asarray([float(label in raw) for label in RAW_LABELS],np.float32)
def sample_video(path,count=FRAMES):return base_sample(path,count)
def prepare_input(raw,duration_seconds):return prepare_floor(raw,duration_seconds,'pushup',FRAMES)
def default_contract():
 return {'schema_version':SCHEMA_VERSION,'frames':FRAMES,'context_size':CONTEXT_SIZE,
         'coordinate_system':'x/image_height,y/image_height,confidence','normalization':'sequence_median_pelvis_and_torso',
         'target_semantics':'presence_of_Qualcomm_annotation; absence_is_not_verified_correctness',
         'labels':[dict(zip(['key','suffix','name_vi','group_vi','kind','rep_supported'],row),raw_label=RAW_LABELS[i],threshold=.5) for i,row in enumerate(LABELS)]}
