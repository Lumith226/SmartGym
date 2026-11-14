-- Migration 012: Thêm cờ enabled bật/tắt cho bài tập trong Phòng tập AI
ALTER TABLE catalog_pose_exercise_links ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;
ALTER TABLE catalog_pose_exercise_links ALTER COLUMN exercise_id DROP NOT NULL;

-- Đảm bảo các bài tập chuẩn V4 có sẵn bản ghi cấu hình bật/tắt
INSERT INTO catalog_pose_exercise_links (pose_id, enabled)
VALUES ('squat', true), ('push_up', true), ('jump_jack', true), ('situp', true)
ON CONFLICT (pose_id) DO NOTHING;
