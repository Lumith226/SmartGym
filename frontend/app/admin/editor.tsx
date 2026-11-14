'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Save,
  Globe,
  Archive,
  RotateCcw,
  Eye,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  FileText,
  ImageIcon,
  ListChecks,
  Settings2,
  RefreshCw,
} from 'lucide-react';
import { toast } from '../../lib/toast';
import { DeleteArchivedExercise } from './delete-exercise';
import { AuditPanel } from './audit-panel';
import { LoadError } from './cms-request';
import { CmsHeading, cmsAction, cmsPanel } from './cms-design';
import { RevisionPanel, revisionPath } from './revisions';
import { MediaReferences } from './publication-references';
import { ExerciseTechnicalFields, ExerciseTranslationFields, readExerciseProfile } from './exercise-profile-fields';
import { imageRoleLabels, type ExerciseImageRoles } from '../exercise-profile';
import {
  CmsError,
  cms,
  errorMessage,
  exercisePath,
  statusNames,
  type Draft,
  type Exercise,
} from './cms';
import { Card } from '../../components/ui/card';
import { cn } from '../../lib/utils';

type Option = { id: string; labelVi: string };
export type Taxonomy = { groups: Option[]; equipment: Option[] };
const editorInput = 'block h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary';
type Loaded = { exercise: Exercise; etag: string };
const emptyDraft: Draft = {
  id: '',
  slug: '',
  nameVi: '',
  summary: '',
  instructions: [],
  primaryMuscleIds: [],
  equipmentIds: [],
};
const stringFields = ['slug', 'nameVi', 'nameEn', 'summary', 'sourceRef'] as const;
const lineFields = ['instructions', 'commonMistakes', 'mediaIds'] as const;
const taxonomyFields = ['primaryMuscleIds', 'secondaryMuscleIds', 'equipmentIds'] as const;
const slugOf = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').slice(0, 100).replace(/^-|-$/g, '');
const publicationFields = [
  ['workoutType', 'Chọn loại hình tập luyện.'],
  ['focusArea', 'Chọn trọng tâm.'],
  ['difficulty', 'Chọn độ khó.'],
] as const;
const lines = (values?: string[]) => values?.join('\n') ?? '';
const split = (value: string) =>
  value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

function readDraft(form: HTMLFormElement, original: Draft, editing: boolean) {
  const values = new FormData(form);
  const get = (name: string) => String(values.get(name) ?? '').trim();
  const changes: Partial<Draft> = {};
  const same = (a: object, b: object) => {
    const ordered = (_key: string, value: unknown) => value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value;
    return JSON.stringify(a, ordered) === JSON.stringify(b, ordered);
  };
  const profile = readExerciseProfile(get, split, original.profile);
  if (!same(profile, original.profile ?? {})) changes.profile = profile;
  const imageRoles: ExerciseImageRoles = {};
  for (const role of Object.keys(imageRoleLabels) as (keyof ExerciseImageRoles)[]) {
    const id = get('image-role-' + role);
    if (id) imageRoles[role] = id;
  }
  if (!same(imageRoles, original.imageRoles ?? {})) changes.imageRoles = imageRoles;
  for (const key of stringFields) {
    const value = get(key);
    if (!editing || value !== (original[key] ?? '')) {
      if (value || !['nameEn', 'sourceRef'].includes(key)) changes[key] = value;
      else if (editing && original[key])
        throw new Error('Các trường tên tiếng Anh và nguồn đã lưu cần có giá trị khi chỉnh sửa.');
    }
  }
  for (const key of lineFields) {
    const raw = get(key);
    if (!editing || raw !== lines(original[key]).trim()) changes[key] = split(raw);
  }
  for (const key of taxonomyFields) {
    const checked = values.getAll(key).map(String);
    if (
      !editing ||
      [...checked].sort().join(',') !== [...(original[key] ?? [])].sort().join(',')
    )
      changes[key] = checked;
  }
  const workoutType = get('workoutType') as Draft['workoutType'] | '';
  if (workoutType && (!editing || workoutType !== original.workoutType))
    changes.workoutType = workoutType;
  const focusArea = get('focusArea') as Draft['focusArea'] | '';
  if (focusArea && (!editing || focusArea !== original.focusArea))
    changes.focusArea = focusArea;
  const difficultyRaw = Number(get('difficulty') || '0');
  if (
    difficultyRaw >= 1 &&
    difficultyRaw <= 5 &&
    (!editing || difficultyRaw !== original.difficulty)
  ) {
    changes.difficulty = difficultyRaw as 1 | 2 | 3 | 4 | 5;
  }
  const restRaw = get('restSeconds');
  if (restRaw !== '') {
    const restNum = Number(restRaw);
    if (
      Number.isInteger(restNum) &&
      restNum >= 0 &&
      restNum <= 600 &&
      (!editing || restNum !== original.restSeconds)
    ) {
      changes.restSeconds = restNum;
    }
  }
  const s1 = Number(get('levelSet1') || '0');
  const s2 = Number(get('levelSet2') || '0');
  const s3 = Number(get('levelSet3') || '0');
  if (s1 > 0 && s2 > 0 && s3 > 0) {
    const nextSets: [number, number, number] = [s1, s2, s3];
    if (!editing || nextSets.join(',') !== (original.levelSets ?? []).join(',')) {
      changes.levelSets = nextSets;
    }
  }
  const result = { ...original, ...changes };
  if (
    !result.nameVi ||
    !result.summary ||
    !result.instructions.length ||
    !result.primaryMuscleIds.length
  ) {
    throw new Error('Điền tên, tóm tắt, ít nhất một bước hướng dẫn và chọn nhóm cơ chính.');
  }
  if (
    result.secondaryMuscleIds?.some(id => result.primaryMuscleIds.includes(id))
  )
    throw new Error('Một nhóm cơ chỉ được chọn làm cơ chính hoặc cơ phụ.');
  return changes;
}

function Choices({
  label,
  name,
  items,
  selected,
  required,
}: {
  label: string;
  name: string;
  items: Option[];
  selected?: string[];
  required?: boolean;
}) {
  const missing = (selected ?? []).filter(id => !items.some(option => option.id === id));
  return (
    <fieldset className="cms-choices space-y-2 rounded-xl border border-border/70 bg-card p-4">
      <legend className="px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {label} {required && <span aria-hidden="true" className="text-destructive">*</span>}
      </legend>
      <div className="flex flex-wrap gap-2 pt-1">
        {[
          ...items,
          ...missing.map(id => ({ id, labelVi: id + ' (chưa công bố)' })),
        ].map(item => {
          const isChecked = selected?.includes(item.id);
          return (
            <label
              key={item.id}
              className={cn(
                'inline-flex cursor-pointer select-none items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all',
                isChecked
                  ? 'border-primary/50 bg-primary/10 text-primary'
                  : 'border-border/80 bg-background text-foreground hover:bg-muted',
              )}
            >
              <input
                type="checkbox"
                name={name}
                value={item.id}
                defaultChecked={isChecked}
                className="size-3.5 rounded border-border text-primary focus:ring-1 focus:ring-primary"
              />
              <span>{item.labelVi}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function TextField({
  label,
  name,
  value,
  rows,
  required,
  maxLength,
}: {
  label: string;
  name: string;
  value: string;
  rows: number;
  required?: boolean;
  maxLength?: number;
}) {
  const id = React.useId();
  return (
    <div className="cms-text-field space-y-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-foreground">
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        required={required}
        maxLength={maxLength}
        rows={rows}
        defaultValue={value}
        className="w-full rounded-xl border border-border bg-background p-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  );
}

export function ExerciseEditor({ id, taxonomy }: { id?: string; taxonomy: Taxonomy }) {
  const [loaded, setLoaded] = React.useState<Loaded>();
  const [loadError, setLoadError] = React.useState<unknown>();
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLoadError(undefined);
    cms<Exercise>(exercisePath(id), { signal: controller.signal })
      .then(({ data, etag }) => {
        if (!etag) throw new Error('Missing ETag');
        if (!controller.signal.aborted) setLoaded({ exercise: data, etag });
      })
      .catch(error => {
        if (!controller.signal.aborted) setLoadError(error);
      });
    return () => controller.abort();
  }, [id, attempt]);

  if (id && !loaded) {
    return loadError ? (
      <LoadError error={loadError} retry={() => setAttempt(value => value + 1)} />
    ) : (
      <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground" role="status">
        <RefreshCw className="size-4 animate-spin" />
        Đang tải bản nháp…
      </div>
    );
  }

  return <EditorForm taxonomy={taxonomy} initial={loaded} />;
}

function EditorForm({ taxonomy, initial }: { taxonomy: Taxonomy; initial?: Loaded }) {
  const [loaded, setLoaded] = React.useState(initial);
  const [ready, setReady] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const slugInput = React.useRef<HTMLInputElement>(null);
  const slugEdited = React.useRef(false);
  const settings = React.useRef<HTMLElement>(null);
  const [dirty, setDirty] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState('');
  const [conflict, setConflict] = React.useState(false);
  const [notice, setNotice] = React.useState('');
  const [confirm, setConfirm] = React.useState<'publish' | 'unpublish'>();
  const [reason, setReason] = React.useState('');
  const [formKey, setFormKey] = React.useState(0);
  const [auditKey, setAuditKey] = React.useState(0);
  const active = React.useRef(false);
  const retry = React.useRef<{ fingerprint: string; key: string } | null>(null);
  const confirmation = React.useRef<HTMLButtonElement>(null);
  const exercise = loaded?.exercise;
  const draft = exercise ?? emptyDraft;
  const archived = exercise?.status === 'ARCHIVED';
  const published = exercise?.status === 'PUBLISHED';
  const changesPending = published && exercise.draftVersion > (exercise.publishedVersion ?? 0);
  const hasMedia = !!exercise?.mediaIds?.length;


  React.useEffect(() => {
    setReady(true);
  }, []);
  React.useEffect(() => {
    if (confirm) confirmation.current?.focus();
  }, [confirm]);

  async function execute(action: () => Promise<void>, success: string) {
    if (active.current) return;
    active.current = true;
    setPending(true);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(success);
      toast.success(success);
    } catch (failure) {
      if (failure instanceof CmsError && failure.status === 412) setConflict(true);
      if (failure instanceof CmsError && failure.code === 'MEDIA_NOT_APPROVED') {
        setFieldErrors({ mediaIds: 'Kiểm tra quyền sử dụng và trạng thái công bố của media đã gắn.' });
        setConfirm(undefined);
      }
      const msg = errorMessage(failure);
      setError(msg);
      toast.error('Lỗi thao tác bài tập', msg);
    } finally {
      active.current = false;
      setPending(false);
    }
  }

  function accept(data: Exercise, etag: string | null) {
    if (!etag) throw new Error('Missing ETag');
    setLoaded({ exercise: data, etag });
    setDirty(false);
    setFieldErrors({});
    setConflict(false);
    setFormKey(value => value + 1);
    setAuditKey(value => value + 1);
  }

  function keyFor(action: string, body?: object) {
    const fingerprint = JSON.stringify([action, loaded?.etag, body]);
    if (retry.current?.fingerprint !== fingerprint)
      retry.current = { fingerprint, key: crypto.randomUUID() };
    return retry.current.key;
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let body;
    try {
      body = readDraft(event.currentTarget, draft, !!exercise);
    } catch (failure) {
      setNotice('');
      setError((failure as Error).message);
      return;
    }
    if (!Object.keys(body).length) {
      setError('');
      setDirty(false);
      setNotice('Bản nháp chưa có thay đổi mới.');
      toast.info('Thông báo', 'Bản nháp chưa có thay đổi mới.');
      return;
    }
    await execute(async () => {
      if (!exercise) {
        const key = keyFor('create', body);
        const { data } = await cms<Exercise>('/exercises', {
          method: 'POST',
          body: { ...body, id: 'exercise_' + key.replaceAll('-', '') },
          key,
        });
        window.location.replace('/admin/bai-tap/' + data.id + '?da-tao=1');
        return;
      }
      const { data, etag } = await cms<Exercise>(exercisePath(exercise.id), {
        method: 'PATCH',
        body,
        match: loaded?.etag,
      });
      accept(data, etag);
    }, 'Đã lưu bản nháp.');
  }

  function requestPublication() {
    const missing = publicationFields.filter(([field]) => !draft[field]);
    if (!missing.length) {
      setConfirm('publish');
      return;
    }
    setFieldErrors(Object.fromEntries(missing));
    settings.current?.querySelector<HTMLSelectElement>('[name="' + missing[0][0] + '"]')?.focus();
  }

  async function publishOrRemove(action: 'publish' | 'unpublish') {
    if (!exercise || dirty || conflict || (action === 'unpublish' && !reason.trim())) return;
    const body = action === 'unpublish' ? { reason: reason.trim() } : undefined;
    await execute(
      async () => {
        const { data, etag } = await cms<Exercise>(exercisePath(exercise.id) + '/' + action, {
          method: 'POST',
          body,
          match: loaded?.etag,
          key: keyFor(action, body),
        });
        accept(data, etag);
        setConfirm(undefined);
        setReason('');
      },
      action === 'publish'
        ? 'Bài tập đã được công bố.'
        : published ? 'Bài tập đã được gỡ khỏi thư viện.' : 'Đã lưu trữ bản nháp.',
    );
  }

  return (
    <div className="space-y-5">
      {!exercise ? <CmsHeading title="Thêm bài tập" description="Tạo bài tập mới để bổ sung vào thư viện SmartGym." /> : (
      <>
      {/* Heading Bar */}
      <div className="cms-heading flex flex-col gap-3 rounded-2xl border border-border/80 bg-card p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="eyebrow text-xs font-semibold uppercase tracking-wider text-primary">Nội dung bài tập</p>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            {exercise ? exercise.nameVi : 'Tạo bài tập mới'}
          </h1>
          {exercise && (
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
              <span
                className={cn(
                  'cms-badge rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
                  exercise.status === 'PUBLISHED'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : exercise.status === 'DRAFT'
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      : 'border-zinc-500/30 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400',
                )}
              >
                {statusNames[exercise.status]}
              </span>
              <span>·</span>
              <span>Bản nháp v{exercise.draftVersion}</span>
              {exercise.publishedVersion ? (
                <>
                  <span>·</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    Công khai v{exercise.publishedVersion}
                  </span>
                </>
              ) : null}
            </div>
          )}
        </div>

        {exercise && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Link
              href={'/admin/bai-tap/' + exercise.id + '/xem-truoc'}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted"
            >
              <Eye className="size-3.5" />
              Xem trước bản nháp
            </Link>
          </div>
        )}
      </div>

      </>)}

      {changesPending && (
        <div className="cms-note flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs font-medium text-amber-700 dark:text-amber-400">
          <AlertTriangle className="size-4 shrink-0" />
          <p>Thư viện đang hiển thị bản đã công bố. Công bố lại để cập nhật nội dung mới.</p>
        </div>
      )}

      {archived && (
        <div className="cms-note flex items-center gap-2 rounded-xl border border-zinc-500/30 bg-zinc-500/10 p-4 text-xs font-medium text-zinc-700 dark:text-zinc-400">
          <Archive className="size-4 shrink-0" />
          <p>Bài tập đã được gỡ khỏi thư viện. Bản nháp vẫn có thể xem trước.</p>
        </div>
      )}

      {/* Editor Form */}
      <form
        key={'editor-' + formKey}
        className="space-y-4"
        method="post"
        onSubmit={save}
        onChange={() => setDirty(true)}
        aria-busy={pending}
      >
        <fieldset
          disabled={!ready || pending || archived || !!confirm}
          className="min-w-0 space-y-4 disabled:opacity-60"
        >

          <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-4">
              <section aria-labelledby="exercise-basic" className={cmsPanel + ' space-y-4 p-4 sm:p-5'}>
                <h2 id="exercise-basic" className="flex items-center gap-2 text-base font-semibold"><FileText className="size-4" aria-hidden="true" />Thông tin cơ bản</h2>
                <div className="space-y-1.5">
                  <label htmlFor="exercise-name" className="text-sm font-medium">Tên tiếng Việt <span aria-hidden="true" className="text-destructive">*</span></label>
                  <input id="exercise-name" name="nameVi" required maxLength={120} defaultValue={draft.nameVi}
                    placeholder="Ví dụ: Squat (Ngồi xổm)" className={editorInput}
                    onChange={event => {
                      if (!exercise && !slugEdited.current && slugInput.current) slugInput.current.value = slugOf(event.target.value);
                    }} />
                </div>
                <TextField label="Tóm tắt" name="summary" required maxLength={500} rows={3} value={draft.summary} />
                <details className="border-t border-border pt-3">
                  <summary className="cursor-pointer text-sm font-medium">Đường dẫn bài tập</summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label htmlFor="exercise-slug" className="text-sm font-medium">Đường dẫn (slug)</label>
                      <input id="exercise-slug" ref={slugInput} name="slug" required maxLength={100}
                        pattern="[a-z0-9]+(?:-[a-z0-9]+)*" defaultValue={draft.slug} className={editorInput}
                        onInvalid={event => {
                          const details = event.currentTarget.closest('details');
                          if (details) details.open = true;
                        }}
                        onChange={() => { slugEdited.current = true; }} />
                    </div>
                  </div>
                </details>
              </section>

              <section aria-labelledby="exercise-guide" className={cmsPanel + ' space-y-4 p-4 sm:p-5'}>
                <h2 id="exercise-guide" className="flex items-center gap-2 text-base font-semibold"><ListChecks className="size-4" aria-hidden="true" />Hướng dẫn tiếng Việt</h2>
                <TextField label="Các bước hướng dẫn (mỗi bước một dòng)" name="instructions" required rows={5} value={lines(draft.instructions)} />
                <TextField label="Lưu ý kỹ thuật (mỗi mục một dòng)" name="profile-tips" rows={3} value={lines(draft.profile?.tips)} />
                <TextField label="Lỗi thường gặp (mỗi lỗi một dòng)" name="commonMistakes" rows={3} value={lines(draft.commonMistakes)} />
                <div className="space-y-1.5">
                  <label htmlFor="exercise-source" className="text-sm font-medium">Tham chiếu nguồn</label>
                  <input id="exercise-source" name="sourceRef" maxLength={500} defaultValue={draft.sourceRef} className={editorInput} />
                </div>
              </section>

              <section aria-labelledby="exercise-translations" className={cmsPanel + ' space-y-4 p-4 sm:p-5'}>
                <h2 id="exercise-translations" className="text-base font-semibold">Nội dung tiếng Anh</h2>
                <ExerciseTranslationFields profile={draft.profile} nameEn={draft.nameEn} />
              </section>

              <section aria-labelledby="exercise-media" className={cmsPanel + ' space-y-3 p-4 sm:p-5'}>
                <div>
                  <h2 id="exercise-media" className="flex items-center gap-2 text-base font-semibold"><ImageIcon className="size-4" aria-hidden="true" />Media</h2>
                </div>
                <MediaReferences initial={draft.mediaIds} initialRoles={draft.imageRoles} onChange={() => {
                  setFieldErrors(previous => ({ ...previous, mediaIds: '' }));
                  setDirty(true);
                }} />
                {fieldErrors.mediaIds && <p id="exercise-error-mediaIds" className="text-sm text-destructive">{fieldErrors.mediaIds}</p>}
              </section>
            </div>

            <section ref={settings} aria-labelledby="exercise-settings" className={cmsPanel + ' min-w-0 space-y-4 p-4 sm:p-5'}>
              <h2 id="exercise-settings" className="flex items-center gap-2 text-base font-semibold"><Settings2 className="size-4" aria-hidden="true" />Cài đặt bài tập</h2>
              <div role="group" aria-labelledby="exercise-muscles" className="space-y-3 border-t border-border pt-3">
                <h3 id="exercise-muscles" className="text-sm font-semibold">Cơ tham gia và dụng cụ</h3>
                <p className="text-xs text-muted-foreground">Chọn nhóm cơ để bài tập xuất hiện đúng vùng trên bản đồ và bộ lọc.</p>
                <Choices label="Nhóm cơ chính" name="primaryMuscleIds" items={taxonomy.groups} selected={draft.primaryMuscleIds} required />
                <Choices label="Nhóm cơ phụ" name="secondaryMuscleIds" items={taxonomy.groups} selected={draft.secondaryMuscleIds} />
                <Choices label="Dụng cụ" name="equipmentIds" items={taxonomy.equipment} selected={draft.equipmentIds} />
              </div>
              <h3 className="border-t border-border pt-3 text-sm font-semibold">Phân loại trong thư viện</h3>
              <div className="cms-fields grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="exercise-workoutType" className="text-xs font-semibold text-foreground">Loại hình tập luyện</label>
                  <select
                    id="exercise-workoutType"
                    name="workoutType"
                    aria-invalid={!!fieldErrors.workoutType}
                    aria-describedby={fieldErrors.workoutType ? "exercise-error-workoutType" : undefined}
                    defaultValue={draft.workoutType ?? ''}
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">Chưa chọn</option>
                    <option value="STRENGTH">Strength (Sức mạnh)</option>
                    <option value="CARDIO">Cardio (Tim mạch)</option>
                    <option value="HIIT">HIIT (Cường độ cao)</option>
                    <option value="CORE">Core / Abs (Cơ trọng tâm)</option>
                    <option value="STRETCHING">Stretching (Giãn cơ)</option>
                  </select>
                  {fieldErrors.workoutType && <p id="exercise-error-workoutType" className="text-xs text-destructive">{fieldErrors.workoutType}</p>}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="exercise-focusArea" className="text-xs font-semibold text-foreground">Trọng tâm</label>
                  <select
                    id="exercise-focusArea"
                    name="focusArea"
                    aria-invalid={!!fieldErrors.focusArea}
                    aria-describedby={fieldErrors.focusArea ? "exercise-error-focusArea" : undefined}
                    defaultValue={draft.focusArea ?? ''}
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">Chưa chọn</option>
                    <option value="FULL_BODY">Full Body (Toàn thân)</option>
                    <option value="UPPER_BODY">Upper Body (Thân trên)</option>
                    <option value="LOWER_BODY">Lower Body (Thân dưới)</option>
                    <option value="ABS">Abs / Core (Bụng)</option>
                  </select>
                  {fieldErrors.focusArea && <p id="exercise-error-focusArea" className="text-xs text-destructive">{fieldErrors.focusArea}</p>}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="exercise-difficulty" className="text-xs font-semibold text-foreground">Độ khó (1–5)</label>
                  <select
                    id="exercise-difficulty"
                    name="difficulty"
                    aria-invalid={!!fieldErrors.difficulty}
                    aria-describedby={fieldErrors.difficulty ? "exercise-error-difficulty" : undefined}
                    defaultValue={draft.difficulty ?? ''}
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">Chưa chọn</option>
                    <option value="1">Level I (Light / Nhẹ)</option>
                    <option value="2">Level II (Easy / Cơ bản)</option>
                    <option value="3">Level III (Normal / Vừa)</option>
                    <option value="4">Level IV (Hard / Nặng)</option>
                    <option value="5">Level V (Advanced / Nâng cao)</option>
                  </select>
                  {fieldErrors.difficulty && <p id="exercise-error-difficulty" className="text-xs text-destructive">{fieldErrors.difficulty}</p>}
                </div>

              </div>
              <ExerciseTechnicalFields profile={draft.profile} />
              <details className="border-t border-border pt-3">
                <summary className="cursor-pointer text-sm font-medium">Tùy chọn nâng cao</summary>
                <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="exercise-levelSet1" className="text-xs font-semibold text-foreground">Hiệp Cấp I</label>
                  <input
                    type="number"
                    id="exercise-levelSet1"
                    name="levelSet1"
                    min={1}
                    max={20}
                    defaultValue={draft.levelSets?.[0] ?? ''}
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="exercise-levelSet2" className="text-xs font-semibold text-foreground">Hiệp Cấp II</label>
                  <input
                    type="number"
                    id="exercise-levelSet2"
                    name="levelSet2"
                    min={1}
                    max={20}
                    defaultValue={draft.levelSets?.[1] ?? ''}
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="exercise-levelSet3" className="text-xs font-semibold text-foreground">Hiệp Cấp III</label>
                  <input
                    type="number"
                    id="exercise-levelSet3"
                    name="levelSet3"
                    min={1}
                    max={20}
                    defaultValue={draft.levelSets?.[2] ?? ''}
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="exercise-restSeconds" className="text-xs font-semibold text-foreground">Nghỉ giữa hiệp (giây)</label>
                  <input
                    type="number"
                    id="exercise-restSeconds"
                    name="restSeconds"
                    min={0}
                    max={600}
                    defaultValue={draft.restSeconds ?? ''}
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                </div>
              </details>
            </section>
          </div>

          {/* Form Save Button */}
          {!archived && (
            <div className="sticky bottom-0 z-10 flex justify-end gap-3 border-t border-border bg-background/95 py-3">
              <button
                type="submit"
                disabled={conflict || pending}
                className={cmsAction + " disabled:opacity-60"}
              >
                {pending ? (
                  <>
                    <RefreshCw className="size-4 animate-spin" />
                    Đang xử lý…
                  </>
                ) : (
                  <>
                    <Save className="size-4" />
                    {exercise ? 'Lưu bản nháp' : 'Tạo bản nháp'}
                  </>
                )}
              </button>
            </div>
          )}
        </fieldset>
      </form>

      {/* Notifications / Alerts */}
      {dirty && exercise && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs font-medium text-amber-700 dark:text-amber-400">
          Hãy lưu bản nháp trước khi công bố hoặc gỡ công bố.
        </p>
      )}

      {hasMedia && (
        <p className="cms-note rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground" role="status">
          Media cần được duyệt. Catalog kiểm tra tệp và quyền công bố khi xác nhận.
        </p>
      )}

      {error && (
        <p className="form-error rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-semibold text-destructive" role="alert" aria-label="Lỗi quản trị">
          {error}
        </p>
      )}

      {notice && (
        <p className="form-success rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400" role="status">
          {notice}
        </p>
      )}

      {conflict && exercise && (
        <button
          type="button"
          className="cms-secondary inline-flex h-9 items-center gap-2 rounded-lg border border-destructive/40 bg-card px-4 text-xs font-semibold text-destructive hover:bg-muted"
          disabled={pending}
          onClick={() =>
            void execute(async () => {
              const { data, etag } = await cms<Exercise>(exercisePath(exercise.id));
              accept(data, etag);
              setConfirm(undefined);
            }, 'Đã tải phiên bản mới nhất.')
          }
        >
          <RotateCcw className="size-3.5" />
          Bỏ nội dung đang nhập và tải phiên bản mới
        </button>
      )}

      {/* Publication Controls Card */}
      {exercise && !archived && (
        <Card aria-label="Thao tác công bố" className="cms-publication p-5 sm:p-6 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border/70 pb-3">
            <div>
              <h2 className="text-base font-bold text-foreground">Công bố trên thư viện</h2>
              <p className="text-xs text-muted-foreground">
                Đưa bài tập ra thư viện công khai hoặc gỡ bài khỏi danh mục hiển thị
              </p>
            </div>
            {published && !changesPending && (
              <p>
                <Link
                  href={'/bai-tap/' + exercise.slug}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  <Globe className="size-3.5" />
                  Xem bài đang công khai
                </Link>
              </p>
            )}
          </div>

          <div className="cms-actions flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={dirty || pending || conflict || !!confirm || (published && !changesPending)}
              onClick={requestPublication}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              <Globe className="size-3.5" />
              Công bố bài tập
            </button>
            {published && (
              <button
                type="button"
                className="cms-secondary inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-4 text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                disabled={dirty || pending || conflict || !!confirm}
                onClick={() => setConfirm('unpublish')}
              >
                <Archive className="size-3.5" />
                Gỡ công bố
              </button>
            )}
            {!published && (
              <button type="button"
                className="cms-secondary inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-4 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                disabled={dirty || pending || conflict || !!confirm}
                onClick={() => setConfirm('unpublish')}>
                <Archive className="size-3.5" aria-hidden="true" />
                Lưu trữ bản nháp
              </button>
            )}
          </div>

          {/* Confirm Dialog Card */}
          {confirm && (
            <fieldset className="cms-confirm space-y-3 rounded-2xl border border-border bg-muted/30 p-5">
              <legend className="px-2 text-sm font-bold text-foreground">
                {confirm === 'publish' ? 'Xác nhận công bố' : published ? 'Xác nhận gỡ công bố' : 'Xác nhận lưu trữ bản nháp'}
              </legend>
              <p className="text-xs text-muted-foreground">
                {confirm === 'publish'
                  ? 'Bản nháp đã lưu sẽ hiển thị công khai trên thư viện.'
                  : published ? 'Bài tập và đường dẫn cũ sẽ ngừng hiển thị trên thư viện.'
                    : 'Bản nháp chuyển sang Đã gỡ để có thể khôi phục hoặc xóa.'}
              </p>
              {confirm === 'unpublish' && (
                <div className="space-y-1.5">
                  <label htmlFor="exercise-unpublish-reason" className="text-xs font-semibold text-foreground">{published ? 'Lý do gỡ công bố' : 'Lý do lưu trữ'}</label>
                  <textarea
                    id="exercise-unpublish-reason"
                    maxLength={500}
                    value={reason}
                    onChange={event => setReason(event.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              )}
              <div className="cms-actions flex items-center gap-2 pt-2">
                <button
                  type="button"
                  ref={confirmation}
                  className="cms-secondary inline-flex h-8 items-center rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted"
                  disabled={pending}
                  onClick={() => setConfirm(undefined)}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  className={cn(
                    'inline-flex h-8 items-center rounded-lg px-3 text-xs font-semibold text-white transition-colors disabled:opacity-50',
                    confirm === 'publish' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-destructive hover:bg-destructive/90',
                  )}
                  disabled={pending || conflict || (confirm === 'unpublish' && !reason.trim())}
                  onClick={() => void publishOrRemove(confirm)}
                >
                  {confirm === 'publish' ? 'Xác nhận công bố' : published ? 'Xác nhận gỡ' : 'Xác nhận lưu trữ'}
                </button>
              </div>
            </fieldset>
          )}
        </Card>
      )}

      {/* Restore archived exercise */}
      {exercise && archived && (
        <Card aria-label="Khôi phục bài đã gỡ" className="p-5 sm:p-6 space-y-3">
          <h2 className="text-base font-bold text-foreground">Khôi phục bài đã gỡ</h2>
          <p className="text-xs text-muted-foreground">
            Bài trở về trạng thái bản nháp để có thể kiểm tra trước khi công bố lại.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="cms-secondary inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-4 text-xs font-semibold text-foreground hover:bg-muted"
              disabled={pending || conflict}
              onClick={() =>
                void execute(async () => {
                  const { data, etag } = await cms<Exercise>(exercisePath(exercise.id) + '/restore', {
                    method: 'POST',
                    match: loaded?.etag,
                    key: keyFor('restore'),
                  });
                  accept(data, etag);
                }, 'Đã khôi phục bản nháp.')
              }
            >
              <RotateCcw className="size-3.5" />
              Khôi phục bài thành bản nháp
            </button>
            <DeleteArchivedExercise exercise={exercise} expectedVersion={loaded?.etag} showLabel disabled={pending || conflict}
              onDeleted={name => {
                toast.success('Đã xóa bài tập', name);
                window.location.replace('/admin/bai-tap?status=ARCHIVED');
              }} />
          </div>
        </Card>
      )}

      {/* Revisions History Panel */}
      {exercise && (
        <Card className="p-5 sm:p-6">
          <RevisionPanel
            contentType="exercise"
            id={exercise.id}
            current={exercise.draftVersion}
            disabled={dirty || pending || conflict || !!confirm}
            restore={(version, reason) =>
              execute(async () => {
                const body = { version, reason };
                await cms(revisionPath('exercise', exercise.id) + '/restore', {
                  method: 'POST',
                  body,
                  match: loaded?.etag,
                  key: keyFor('restore-revision', body),
                });
                const { data, etag } = await cms<Exercise>(exercisePath(exercise.id));
                accept(data, etag);
              }, 'Đã khôi phục thành bản nháp.')
            }
          />
        </Card>
      )}

      {/* Audit Log Panel */}
      {exercise && (
        <Card className="p-5 sm:p-6">
          <AuditPanel id={exercise.id} contentType="exercise" key={'audit-' + auditKey} />
        </Card>
      )}
    </div>
  );
}
