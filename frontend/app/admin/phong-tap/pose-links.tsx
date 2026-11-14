'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../../../components/ui/button';
import { cms, errorMessage, type Exercise, type Page } from '../cms';
import { cmsInput, cmsPanel } from '../cms-design';

type Movement = { id: string; name: string; version: string };
type PoseLink = { poseId: string; exerciseId: string | null; nameVi: string; slug: string; published: boolean; enabled: boolean };
type Links = { items: PoseLink[] };
type Options = Page<Exercise> & { pagination?: { page: number; pageSize: number; total: number } };

export function PoseLinks({ movements }: { movements: Movement[] | null }) {
  const router = useRouter();
  const [links, setLinks] = useState<PoseLink[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    setLoadError('');
    cms<Links>('/pose-exercise-links', { signal: abort.signal }).then(({ data }) => {
      if (!abort.signal.aborted) setLinks(data.items);
    }).catch(error => {
      if (!abort.signal.aborted) setLoadError(errorMessage(error));
    });
    return () => abort.abort();
  }, [reload]);

  const [saving, setSaving] = useState(false);
  const rows = [...(movements ?? [])];
  for (const link of links ?? []) {
    if (!rows.some(row => row.id === link.poseId)) rows.push({ id: link.poseId, name: link.poseId, version: '' });
  }
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" disabled={saving} onClick={() => { router.refresh(); setReload(value => value + 1); }}>Cập nhật danh sách</Button>
        <Link className="text-sm text-primary underline" href="/admin/bai-tap/moi">Thêm bài tập vào thư viện</Link>
      </div>
      {movements === null && <p role="alert">Pose Engine đang gián đoạn. Bạn vẫn có thể xem hoặc gỡ liên kết đã lưu.</p>}
      {loadError && <p role="alert">{loadError}</p>}
      {!links && !loadError && <p role="status">Đang tải liên kết…</p>}
      {links && !rows.length && movements && <p>Pose Engine chưa công bố động tác nào.</p>}
      {links && rows.map(movement => (
        <PoseLinkRow key={movement.id} movement={movement}
          supported={!!movements?.some(item => item.id === movement.id)}
          link={links.find(item => item.poseId === movement.id)} saving={saving} onSaving={setSaving} onSaved={setLinks} />
      ))}
    </>
  );
}

function PoseLinkRow({ movement, supported, link, saving, onSaving, onSaved }: {
  movement: Movement; supported: boolean; link?: PoseLink; saving: boolean;
  onSaving: (saving: boolean) => void; onSaved: (links: PoseLink[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [options, setOptions] = useState<Options>();
  const [selection, setSelection] = useState<Exercise>();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const isEnabled = link ? link.enabled !== false : true;
  const hasLinkedExercise = Boolean(link?.exerciseId);

  useEffect(() => {
    if (!editing || !supported) return;
    const abort = new AbortController();
    const params = new URLSearchParams({ status: 'PUBLISHED', sort: 'name_asc', limit: '12', page: String(page) });
    if (search) params.set('q', search);
    cms<Options>('/exercises?' + params, { signal: abort.signal }).then(({ data }) => {
      if (!abort.signal.aborted) setOptions(data);
    }).catch(cause => {
      if (!abort.signal.aborted) setError(errorMessage(cause));
    });
    return () => abort.abort();
  }, [editing, page, search, supported]);

  async function toggleEnabled() {
    onSaving(true);
    setError('');
    setMessage('');
    try {
      const nextEnabled = !isEnabled;
      const { data } = await cms<Links>('/pose-exercise-links', {
        method: 'PUT',
        body: { poseId: movement.id, enabled: nextEnabled },
      });
      onSaved(data.items);
      setMessage(nextEnabled ? 'Đã bật bài tập trong Phòng tập AI.' : 'Đã tắt bài tập khỏi Phòng tập AI.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      onSaving(false);
    }
  }

  async function save(exerciseId: string | null) {
    onSaving(true);
    setError('');
    setMessage('');
    try {
      const { data } = await cms<Links>('/pose-exercise-links', { method: 'PUT', body: { poseId: movement.id, exerciseId } });
      onSaved(data.items);
      setEditing(false);
      setSelection(undefined);
      setMessage(exerciseId ? 'Đã lưu liên kết.' : 'Đã gỡ liên kết.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      onSaving(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const next = query.trim();
    if (next === search && page === 1) return;
    setError('');
    setOptions(undefined);
    setPage(1);
    setSearch(next);
  }

  function changePage(next: number) {
    setError('');
    setOptions(undefined);
    setPage(next);
  }
  const currentPage = options?.pagination?.page ?? page;
  const totalPages = options?.pagination ? Math.ceil(options.pagination.total / options.pagination.pageSize) : 1;

  return (
    <article className={cmsPanel + ' space-y-4 p-4'}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="font-semibold">{movement.name}</h2>
            <button
              type="button"
              role="switch"
              aria-checked={isEnabled}
              aria-label={isEnabled ? `Tắt ${movement.name}` : `Bật ${movement.name}`}
              title={isEnabled ? 'Bấm để tắt động tác khỏi phòng tập' : 'Bấm để bật động tác trong phòng tập'}
              disabled={saving}
              onClick={() => void toggleEnabled()}
              className={
                'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 disabled:opacity-50 ' +
                (isEnabled ? 'bg-primary' : 'bg-muted-foreground/30')
              }
            >
              <span
                className={
                  'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ' +
                  (isEnabled ? 'translate-x-4' : 'translate-x-0')
                }
              />
            </button>
            <span
              className={
                'rounded-full px-2 py-0.5 text-[10px] font-bold ' +
                (isEnabled
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  : 'bg-rose-500/15 text-rose-600 dark:text-rose-400')
              }
            >
              {isEnabled ? 'Đang bật' : 'Đã tắt'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{movement.id}{movement.version && ' · ' + movement.version}</p>
          <p className="mt-2 text-sm">
            {hasLinkedExercise ? (
              link?.published ? (
                <Link className="text-primary underline" href={'/bai-tap/' + encodeURIComponent(link.slug)}>{link.nameVi}</Link>
              ) : (
                <span className="text-muted-foreground">{link?.nameVi ? `${link.nameVi} · ` : ''}Đã gỡ khỏi thư viện</span>
              )
            ) : (
              <span className="text-muted-foreground">Chưa liên kết bài tập trong thư viện</span>
            )}
          </p>
          {!supported && <p className="text-sm text-muted-foreground">Động tác tạm thời không khả dụng trên Pose Engine.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {supported && (
            <Button
              variant="outline"
              disabled={saving}
              aria-expanded={editing}
              onClick={() => {
                setEditing(value => !value);
                setError('');
              }}
            >
              {editing ? 'Đóng' : hasLinkedExercise ? 'Đổi bài liên kết' : 'Chọn bài tập'}
            </Button>
          )}
          {hasLinkedExercise && (
            <Button variant="outline" disabled={saving} onClick={() => void save(null)}>
              Gỡ liên kết
            </Button>
          )}
        </div>
      </div>
      {editing && supported && (
        <div className="space-y-3 border-t border-border pt-3">
          <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
            <label className="min-w-48 flex-1 text-sm">Tìm bài tập đang công bố
              <input className={cmsInput + ' mt-1 w-full'} value={query} maxLength={100} onChange={event => setQuery(event.target.value)} />
            </label>
            <Button type="submit" variant="outline">Tìm</Button>
          </form>
          {!options && !error && <p role="status">Đang tải bài tập…</p>}
          {options && !options.items.length && <p>Không tìm thấy bài tập phù hợp.</p>}
          {!!options?.items.length && (
            <ul className="grid gap-2 sm:grid-cols-2">
              {options.items.map(exercise => (
                <li key={exercise.id}>
                  <Button className="h-auto w-full justify-start whitespace-normal text-left" variant={selection?.id === exercise.id ? 'default' : 'outline'}
                    aria-pressed={selection?.id === exercise.id} onClick={() => setSelection(exercise)}>{exercise.nameVi}</Button>
                </li>
              ))}
            </ul>
          )}
          {options && (currentPage > 1 || totalPages > currentPage) && (
            <div className="flex items-center gap-2 text-sm">
              <Button variant="outline" disabled={currentPage <= 1} onClick={() => changePage(currentPage - 1)}>Trang trước</Button>
              <span>Trang {currentPage} / {totalPages}</span>
              <Button variant="outline" disabled={currentPage >= totalPages} onClick={() => changePage(currentPage + 1)}>Trang sau</Button>
            </div>
          )}
          {selection && <p className="text-sm">Đã chọn <strong>{selection.nameVi}</strong></p>}
          <Button disabled={saving || !selection} onClick={() => selection && void save(selection.id)}>Lưu liên kết</Button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {message && <p role="status" className="text-sm">{message}</p>}
    </article>
  );
}
