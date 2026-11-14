import { profileChoices, type ExerciseProfile } from './exercise-profile';

export function ExerciseProfileDetails({ profile, publicView = false }: { profile?: ExerciseProfile; publicView?: boolean }) {
  if (!profile) return null;
  const english = profile.translations?.en;
  const info: [string, string | number | false | undefined][] = [
    ['Danh mục', !publicView && profile.category && profileChoices.category[profile.category]],
    ['Kiểu lực', profile.forceType && profileChoices.forceType[profile.forceType]],
    ['Cơ chế', profile.mechanic && profileChoices.mechanic[profile.mechanic]],
    ['Vùng cơ thể', !publicView && profile.bodyPart && profileChoices.bodyPart[profile.bodyPart]],
    ['Từng bên', profile.isUnilateral === undefined ? undefined : profile.isUnilateral ? 'Có' : 'Không'],
    ['Trọng lượng cơ thể', !publicView && (profile.isBodyweight === undefined ? undefined : profile.isBodyweight ? 'Có' : 'Không')],
    ['MET', profile.met],
    ['Cơ chính', !publicView && profile.primaryMuscles?.join(', ')],
    ['Cơ phụ', !publicView && profile.secondaryMuscles?.join(', ')],
    ['Mục tiêu', !publicView && profile.goals?.join(', ')],
    ['Thẻ', !publicView && profile.tags?.join(', ')],
    ['Mã nhóm biến thể', !publicView && profile.variationGroup],
  ];
  const visibleInfo = info.filter(([, value]) => value !== false && value !== undefined && value !== '');
  if (!profile.tips?.length && !visibleInfo.length && !english) return null;
  return <div className="space-y-4">
    {!!profile.tips?.length && <section className="space-y-2 rounded-xl border border-border bg-card p-4">
      <h2 className="text-lg font-bold">Lưu ý kỹ thuật</h2>
      <ul className="list-disc space-y-1 pl-5 text-sm">{profile.tips.map((tip, index) => <li key={index}>{tip}</li>)}</ul>
    </section>}
    {visibleInfo.length > 0 && <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-lg font-bold">Đặc điểm bài tập</h2>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">{visibleInfo.map(([label, value]) =>
        <div key={label}><dt className="text-muted-foreground">{label}</dt><dd>{value}</dd></div>
      )}</dl>
    </section>}
    {english && <details className="rounded-xl border border-border bg-card p-4">
        <summary className="cursor-pointer font-semibold">Tiếng Anh</summary>
        <div lang="en" className="mt-3 space-y-2 text-sm">
          {english.description && <p>{english.description}</p>}
          {!!english.instructions?.length && <ol className="list-decimal space-y-1 pl-5">{english.instructions.map((step, index) => <li key={index}>{step}</li>)}</ol>}
          {!!english.tips?.length && <ul className="list-disc space-y-1 pl-5">{english.tips.map((tip, index) => <li key={index}>{tip}</li>)}</ul>}
        </div>
      </details>}
  </div>;
}
