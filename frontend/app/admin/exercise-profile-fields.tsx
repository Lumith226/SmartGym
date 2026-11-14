import { profileChoices, type ExerciseProfile } from '../exercise-profile';
import { cmsInput } from './cms-design';

const technicalFields = [
  ['forceType', 'Kiểu lực'],
  ['mechanic', 'Cơ chế chuyển động'],
] as const;
const textareaClass = 'w-full rounded-md border border-input bg-background p-2 text-sm';

export function ExerciseTechnicalFields({ profile }: { profile?: ExerciseProfile }) {
  return <details className="border-t border-border pt-3">
    <summary className="cursor-pointer text-sm font-medium">Thông tin kỹ thuật <span className="font-normal text-muted-foreground">(tùy chọn)</span></summary>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {technicalFields.map(([key, label]) => <label key={key} className="grid gap-1 text-sm">{label}
        <select className={cmsInput} name={'profile-' + key} defaultValue={profile?.[key] ?? ''}>
          <option value="">Chưa chọn</option>
          {Object.entries(profileChoices[key]).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select>
      </label>)}
      <label className="grid gap-1 text-sm">Thực hiện từng bên
        <select className={cmsInput} name="profile-isUnilateral" defaultValue={profile?.isUnilateral === undefined ? '' : String(profile.isUnilateral)}>
          <option value="">Chưa chọn</option><option value="true">Có</option><option value="false">Không</option>
        </select>
      </label>
    </div>
  </details>;
}

export function ExerciseTranslationFields({ profile, nameEn }: { profile?: ExerciseProfile; nameEn?: string }) {
  const translation = profile?.translations?.en;
  return <div className="space-y-3">
    <label className="grid gap-1 text-sm">Tên bài tập (Tiếng Anh)
      <input className={cmsInput} name="nameEn" maxLength={120} defaultValue={nameEn} />
    </label>
    <label className="grid gap-1 text-sm">Mô tả (Tiếng Anh)
      <textarea className={textareaClass} name="profile-en-description" rows={2} maxLength={2000} defaultValue={translation?.description} />
    </label>
    <label className="grid gap-1 text-sm">Hướng dẫn (Tiếng Anh, mỗi bước một dòng)
      <textarea className={textareaClass} name="profile-en-instructions" rows={3} defaultValue={translation?.instructions?.join('\n')} />
    </label>
    <label className="grid gap-1 text-sm">Lưu ý (Tiếng Anh, mỗi mục một dòng)
      <textarea className={textareaClass} name="profile-en-tips" rows={2} defaultValue={translation?.tips?.join('\n')} />
    </label>
  </div>;
}

export function readExerciseProfile(get: (name: string) => string, splitLines: (value: string) => string[],
  storedProfile?: ExerciseProfile): ExerciseProfile {
  const list = (key: string) => {
    const values = splitLines(get(key));
    if (values.length > 30 || values.some(value => value.length > 2000))
      throw new Error('Mỗi danh sách chỉ được có tối đa 30 mục, mỗi mục tối đa 2000 ký tự.');
    return values.length ? values : undefined;
  };
  const description = get('profile-en-description') || undefined;
  const instructions = list('profile-en-instructions');
  const tips = list('profile-en-tips');
  const translations = { ...storedProfile?.translations };
  if (description || instructions || tips) translations.en = { description, instructions, tips };
  else delete translations.en;
  const unilateral = get('profile-isUnilateral');
  return {
    ...storedProfile,
    ...Object.fromEntries(technicalFields.map(([key]) => [key, get('profile-' + key) || undefined])),
    isUnilateral: unilateral ? unilateral === 'true' : undefined,
    tips: list('profile-tips'),
    translations: Object.keys(translations).length ? translations : undefined,
  };
}
