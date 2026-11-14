export type V4LabelKind = 'attribute' | 'error' | 'positive' | 'visibility' | 'context' | 'legacy';

export type V4LabelContract = {
  key: string;
  name_vi: string;
  kind: V4LabelKind;
  threshold: number | null;
  rep_supported?: boolean;
  calibrated?: boolean;
};

export type V4ExerciseConfig = {
  id: 'squat' | 'push_up' | 'jump_jack' | 'situp';
  name: string;
  subtitle: string;
  version: string;
  label_count: number;
  catalogSlug: string;
  labels: V4LabelContract[];
};

export const POSE_SKELETON_PAIRS: [number, number][] = [
  [0, 1],
  [0, 2],
  [1, 3],
  [2, 4],
  [5, 6],
  [5, 7],
  [7, 9],
  [6, 8],
  [8, 10],
  [5, 11],
  [6, 12],
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
];

export const DEFAULT_V4_EXERCISES: V4ExerciseConfig[] = [
  {
    id: 'squat',
    name: 'Squat',
    subtitle: 'Gánh đùi không tạ',
    version: 'V4',
    label_count: 14,
    catalogSlug: 'squat-khong-ta',
    labels: [
      { key: 'depth_90', name_vi: 'Gập gối 90°', kind: 'attribute', threshold: 0.4, rep_supported: true, calibrated: true },
      { key: 'depth_over_90', name_vi: 'Gập gối vượt 90°', kind: 'attribute', threshold: 0.825, rep_supported: true, calibrated: true },
      { key: 'shallow', name_vi: 'Xuống nông', kind: 'error', threshold: 0.575, rep_supported: true, calibrated: true },
      { key: 'insufficient', name_vi: 'Biên độ chưa đủ', kind: 'error', threshold: 0.3, rep_supported: true, calibrated: true },
      { key: 'back_not_straight', name_vi: 'Lưng không thẳng', kind: 'error', threshold: 0.325, rep_supported: true, calibrated: true },
      { key: 'shoulder_width', name_vi: 'Chân rộng bằng vai', kind: 'attribute', threshold: 0.625, rep_supported: true, calibrated: true },
      { key: 'wide', name_vi: 'Chân rộng', kind: 'attribute', threshold: 0.575, rep_supported: true, calibrated: true },
      { key: 'narrow', name_vi: 'Chân hẹp', kind: 'attribute', threshold: 0.175, rep_supported: true, calibrated: true },
      { key: 'plie', name_vi: 'Kiểu đứng plié', kind: 'attribute', threshold: 0.35, rep_supported: true, calibrated: true },
      { key: 'knees_over_toes', name_vi: 'Vị trí gối: nhãn gốc mâu thuẫn', kind: 'attribute', threshold: 0.325, rep_supported: true, calibrated: true },
      { key: 'no_obvious_issue', name_vi: 'Không thấy vấn đề rõ ràng', kind: 'positive', threshold: 0.4, rep_supported: true, calibrated: true },
      { key: 'not_visible', name_vi: 'Không nhìn thấy rõ', kind: 'visibility', threshold: 0.75, rep_supported: true, calibrated: true },
      { key: 'hold', name_vi: 'Giữ tư thế', kind: 'context', threshold: 0.775, rep_supported: false, calibrated: true },
      { key: 'starting_late', name_vi: 'Bắt đầu muộn', kind: 'context', threshold: 0.9, rep_supported: false, calibrated: true },
    ],
  },
  {
    id: 'push_up',
    name: 'Chống đẩy',
    subtitle: 'Kiểm soát thân trên & hông',
    version: 'V4',
    label_count: 21,
    catalogSlug: 'chong-day',
    labels: [
      { key: 'depth_90', name_vi: 'Khuỷu gập 90°', kind: 'attribute', threshold: 0.6, rep_supported: true, calibrated: true },
      { key: 'too_deep', name_vi: 'Xuống quá sâu', kind: 'error', threshold: 0.35, rep_supported: true, calibrated: true },
      { key: 'shallow', name_vi: 'Xuống nông', kind: 'error', threshold: 0.5, rep_supported: true, calibrated: true },
      { key: 'insufficient', name_vi: 'Thực hiện chưa đầy đủ', kind: 'error', threshold: 0.55, rep_supported: true, calibrated: true },
      { key: 'shoulder_width', name_vi: 'Tay rộng bằng vai', kind: 'attribute', threshold: 0.55, rep_supported: true, calibrated: true },
      { key: 'wide', name_vi: 'Tay mở rộng', kind: 'attribute', threshold: 0.6, rep_supported: true, calibrated: true },
      { key: 'very_wide', name_vi: 'Đặt tay quá rộng', kind: 'error', threshold: 0.5, rep_supported: true, calibrated: true },
      { key: 'narrow', name_vi: 'Đặt tay quá hẹp', kind: 'error', threshold: 0.45, rep_supported: true, calibrated: true },
      { key: 'elevated_hips', name_vi: 'Hông nâng quá cao', kind: 'error', threshold: 0.775, rep_supported: true, calibrated: true },
      { key: 'butt_sinking', name_vi: 'Hông bị võng xuống', kind: 'error', threshold: 0.15, rep_supported: true, calibrated: true },
      { key: 'legs_on_floor', name_vi: 'Chân nằm trên sàn', kind: 'error', threshold: 0.325, rep_supported: true, calibrated: true },
      { key: 'side_to_side', name_vi: 'Người dịch chuyển sang hai bên', kind: 'error', threshold: 0.5, rep_supported: true, calibrated: true },
      { key: 'child_pose_cheat', name_vi: 'Chuyển sang tư thế em bé', kind: 'error', threshold: 0.5, rep_supported: true, calibrated: true },
      { key: 'sloppy', name_vi: 'Dáng tập thiếu ổn định', kind: 'error', threshold: 0.45, rep_supported: true, calibrated: true },
      { key: 'moving_head', name_vi: 'Đầu chuyển động', kind: 'attribute', threshold: 0.7, rep_supported: true, calibrated: true },
      { key: 'head_down', name_vi: 'Đầu cúi xuống', kind: 'attribute', threshold: 0.875, rep_supported: true, calibrated: true },
      { key: 'head_out_of_frame', name_vi: 'Đầu ra vào khung hình', kind: 'visibility', threshold: 0.5, rep_supported: false, calibrated: true },
      { key: 'waiting_position', name_vi: 'Tư thế chờ chống tay', kind: 'context', threshold: 0.55, rep_supported: false, calibrated: true },
      { key: 'early_stopping', name_vi: 'Dừng sớm', kind: 'context', threshold: 0.575, rep_supported: false, calibrated: true },
      { key: 'fast', name_vi: 'Thực hiện nhanh', kind: 'attribute', threshold: 0.525, rep_supported: false, calibrated: true },
      { key: 'not_visible', name_vi: 'Không nhìn thấy rõ', kind: 'visibility', threshold: 0.425, rep_supported: true, calibrated: true },
    ],
  },
  {
    id: 'jump_jack',
    name: 'Jumping jacks',
    subtitle: 'Bật nhảy vung tay chân',
    version: 'V4',
    label_count: 29,
    catalogSlug: 'bat-nhay-vung-tay',
    labels: [
      { key: 'only_arms', name_vi: 'Chỉ chuyển động tay', kind: 'error', threshold: 0.5, rep_supported: true, calibrated: true },
      { key: 'only_legs', name_vi: 'Chỉ chuyển động chân', kind: 'error', threshold: 0.625, rep_supported: true, calibrated: true },
      { key: 'not_jumping', name_vi: 'Không bật nhảy', kind: 'error', threshold: 0.475, rep_supported: true, calibrated: true },
      { key: 'puppet_dance', name_vi: 'Chuyển động kiểu múa rối', kind: 'error', threshold: 0.5, rep_supported: true, calibrated: true },
      { key: 'opposite', name_vi: 'Tay chân chuyển động ngược pha', kind: 'error', threshold: 0.1, rep_supported: true, calibrated: true },
      { key: 'not_synchronized', name_vi: 'Tay chân không đồng bộ', kind: 'error', threshold: 0.175, rep_supported: true, calibrated: true },
      { key: 'single_repetition', name_vi: 'Chỉ thực hiện một lần', kind: 'context', threshold: 0.4, rep_supported: false, calibrated: true },
      { key: 'early_stopping', name_vi: 'Dừng sớm', kind: 'context', threshold: 0.2, rep_supported: false, calibrated: true },
      { key: 'arms_rom_1_0', name_vi: 'Tay: mức biên độ 1', kind: 'attribute', threshold: 0.875, rep_supported: true, calibrated: true },
      { key: 'arms_rom_1_5', name_vi: 'Tay: mức biên độ 1.5', kind: 'attribute', threshold: 0.45, rep_supported: true, calibrated: true },
      { key: 'arms_rom_2_0', name_vi: 'Tay: mức biên độ 2', kind: 'attribute', threshold: 0.3, rep_supported: true, calibrated: true },
      { key: 'arms_rom_2_5', name_vi: 'Tay: mức biên độ 2.5', kind: 'attribute', threshold: 0.5, rep_supported: true, calibrated: true },
      { key: 'arms_rom_3_0', name_vi: 'Tay: mức biên độ 3', kind: 'attribute', threshold: 0.675, rep_supported: true, calibrated: true },
      { key: 'arms_rom_3_5', name_vi: 'Tay: mức biên độ 3.5', kind: 'attribute', threshold: 0.425, rep_supported: true, calibrated: true },
      { key: 'arms_rom_4_0', name_vi: 'Tay: mức biên độ 4', kind: 'attribute', threshold: 0.175, rep_supported: true, calibrated: true },
      { key: 'legs_rom_1_0', name_vi: 'Chân: mức biên độ 1', kind: 'attribute', threshold: 0.875, rep_supported: true, calibrated: true },
      { key: 'legs_rom_1_5', name_vi: 'Chân: mức biên độ 1.5', kind: 'attribute', threshold: 1.01, rep_supported: true, calibrated: false },
      { key: 'legs_rom_2_0', name_vi: 'Chân: mức biên độ 2', kind: 'attribute', threshold: 0.425, rep_supported: true, calibrated: true },
      { key: 'legs_rom_2_5', name_vi: 'Chân: mức biên độ 2.5', kind: 'attribute', threshold: 0.5, rep_supported: true, calibrated: true },
      { key: 'legs_rom_3_0', name_vi: 'Chân: mức biên độ 3', kind: 'attribute', threshold: 0.525, rep_supported: true, calibrated: true },
      { key: 'legs_rom_3_5', name_vi: 'Chân: mức biên độ 3.5', kind: 'attribute', threshold: 1.01, rep_supported: true, calibrated: false },
      { key: 'legs_rom_4_0', name_vi: 'Chân: mức biên độ 4', kind: 'attribute', threshold: 0.1, rep_supported: true, calibrated: true },
      { key: 'speed_0_25', name_vi: 'Tốc độ 0.25 lần/giây', kind: 'attribute', threshold: 0.5, rep_supported: false, calibrated: true },
      { key: 'speed_0_50', name_vi: 'Tốc độ 0.5 lần/giây', kind: 'attribute', threshold: 0.9, rep_supported: false, calibrated: true },
      { key: 'speed_0_75', name_vi: 'Tốc độ 0.75 lần/giây', kind: 'attribute', threshold: 0.1, rep_supported: false, calibrated: true },
      { key: 'speed_1_00', name_vi: 'Tốc độ 1 lần/giây', kind: 'attribute', threshold: 0.875, rep_supported: false, calibrated: true },
      { key: 'speed_1_25', name_vi: 'Tốc độ 1.25 lần/giây', kind: 'attribute', threshold: 0.15, rep_supported: false, calibrated: true },
      { key: 'speed_1_50', name_vi: 'Tốc độ 1.5 lần/giây', kind: 'attribute', threshold: 0.4, rep_supported: false, calibrated: true },
      { key: 'speed_1_75', name_vi: 'Tốc độ 1.75 lần/giây', kind: 'attribute', threshold: 1.01, rep_supported: false, calibrated: false },
    ],
  },
  {
    id: 'situp',
    name: 'Gập bụng ngược',
    subtitle: 'Kiểm soát cơ bụng & nâng hông',
    version: 'V4',
    label_count: 19,
    catalogSlug: 'gap-bung-nguoc',
    labels: [
      { key: 'range_90', name_vi: 'Co chân đến 90°', kind: 'attribute', threshold: 0.475, rep_supported: true, calibrated: true },
      { key: 'range_over_90', name_vi: 'Co chân vượt 90°', kind: 'attribute', threshold: 0.6, rep_supported: true, calibrated: true },
      { key: 'range_below_90', name_vi: 'Co chân chưa đến 90°', kind: 'error', threshold: 0.325, rep_supported: true, calibrated: true },
      { key: 'not_raising_hips', name_vi: 'Chưa nâng hông khỏi sàn', kind: 'error', threshold: 0.725, rep_supported: true, calibrated: true },
      { key: 'extending_legs', name_vi: 'Duỗi chân', kind: 'attribute', threshold: 0.875, rep_supported: true, calibrated: true },
      { key: 'feet_down', name_vi: 'Bàn chân đặt trên sàn', kind: 'attribute', threshold: 0.75, rep_supported: true, calibrated: true },
      { key: 'thighs_not_moving', name_vi: 'Đùi không chuyển động', kind: 'error', threshold: 0.825, rep_supported: true, calibrated: true },
      { key: 'head_up', name_vi: 'Đầu nâng lên', kind: 'attribute', threshold: 0.4, rep_supported: true, calibrated: true },
      { key: 'frontal', name_vi: 'Bàn chân hướng về camera', kind: 'attribute', threshold: 0.65, rep_supported: true, calibrated: true },
      { key: 'not_moving', name_vi: 'Không chuyển động', kind: 'context', threshold: 0.9, rep_supported: false, calibrated: true },
      { key: 'getting_into_position', name_vi: 'Đang vào tư thế', kind: 'context', threshold: 0.55, rep_supported: false, calibrated: true },
      { key: 'slow', name_vi: 'Thực hiện chậm', kind: 'attribute', threshold: 0.625, rep_supported: false, calibrated: true },
      { key: 'fast', name_vi: 'Thực hiện nhanh', kind: 'attribute', threshold: 0.35, rep_supported: false, calibrated: true },
      { key: 'not_visible', name_vi: 'Không nhìn thấy rõ', kind: 'visibility', threshold: 0.5, rep_supported: true, calibrated: true },
      { key: 'height_1', name_vi: 'Mức nâng 1', kind: 'attribute', threshold: 0.625, rep_supported: true, calibrated: true },
      { key: 'height_2', name_vi: 'Mức nâng 2', kind: 'attribute', threshold: 0.3, rep_supported: true, calibrated: true },
      { key: 'height_3', name_vi: 'Mức nâng 3', kind: 'attribute', threshold: 0.5, rep_supported: true, calibrated: true },
      { key: 'height_4', name_vi: 'Mức nâng 4', kind: 'attribute', threshold: 0.375, rep_supported: true, calibrated: true },
      { key: 'height_5', name_vi: 'Mức nâng 5', kind: 'attribute', threshold: 0.6, rep_supported: true, calibrated: true },
    ],
  },
];
