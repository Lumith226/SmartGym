export const profileChoices = {
  category: { strength: 'Sức mạnh', cardio: 'Tim mạch', stretching: 'Giãn cơ', plyometrics: 'Bật nhảy', olympic: 'Cử tạ Olympic' },
  forceType: { static: 'Giữ tĩnh', dynamic: 'Chuyển động', pull: 'Kéo', push: 'Đẩy' },
  mechanic: { compound: 'Đa khớp', isolation: 'Đơn khớp' },
  bodyPart: { upper_legs: 'Đùi', core: 'Vùng lõi', full_body: 'Toàn thân', back: 'Lưng', chest: 'Ngực', shoulders: 'Vai', upper_arms: 'Cánh tay', lower_legs: 'Cẳng chân', lower_arms: 'Cẳng tay' },
} as const;

export const imageRoleLabels = { main: 'Ảnh một tư thế', start: 'Tư thế bắt đầu', peak: 'Tư thế ở điểm cao nhất' } as const;
export type ExerciseImageRole = keyof typeof imageRoleLabels;
export type ExerciseImageRoles = Partial<Record<ExerciseImageRole, string>>;
type Translation = { name?: string; description?: string; instructions?: string[]; tips?: string[] };
export type ExerciseProfile = {
  [K in keyof typeof profileChoices]?: keyof (typeof profileChoices)[K];
} & {
  goals?: string[];
  tags?: string[];
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  isUnilateral?: boolean;
  isBodyweight?: boolean;
  met?: number;
  variationGroup?: string;
  tips?: string[];
  translations?: Partial<Record<'en' | 'de' | 'es', Translation>>;
};
