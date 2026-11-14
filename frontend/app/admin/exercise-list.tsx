'use client';

import * as React from 'react';
import Link from 'next/link';
import { Archive, ChevronLeft, ChevronRight, Dumbbell, Eye, EyeOff, Globe, PencilLine, RotateCcw } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { dateLabel, type Exercise, type Page } from './cms';
import { cn } from '../../lib/utils';
import { DeleteArchivedExercise } from './delete-exercise';
import { cmsFilter, cmsInput, cmsPanel, cmsTableHead } from './cms-design';
import { LoadError, useCmsPage } from './cms-request';
import { toast } from '../../lib/toast';
import { actionLabels, canApply, ExerciseListActionDialog, type ActionRequest, type ActionResult, type ListAction } from './exercise-list-actions';

const listActions = Object.keys(actionLabels) as ListAction[];
const rowActions = listActions.filter(action => action !== 'delete');
const actionIcons = { publish: Globe, unpublish: EyeOff, archive: Archive, restore: RotateCcw };
const rowAction = 'inline-grid size-8 place-items-center rounded-md align-middle text-muted-foreground hover:bg-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-primary';

function StatusBadge({ status }: { status: Exercise['status'] }) {
  const isPub = status === 'PUBLISHED';
  const isDraft = status === 'DRAFT';
  const label = isPub ? 'Đang công khai' : isDraft ? 'Bản nháp' : 'Đã gỡ';

  return (
    <span
      className={cn(
        'cms-badge inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium border',
        isPub
          ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
          : isDraft
          ? 'border-amber-500/25 bg-amber-500/10 text-amber-400'
          : 'border-slate-500/25 bg-slate-500/10 text-slate-400',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-1.5 rounded-full',
          isPub
            ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]'
            : isDraft
            ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]'
            : 'bg-slate-400',
        )}
      />
      {label}
    </span>
  );
}

export function ExerciseList({
  search, status, sort, page = 1, muscleLabels, recent = false, stats,
}: {
  search?: string;
  status?: string;
  sort?: string;
  page?: number;
  muscleLabels: Record<string, string>;
  recent?: boolean;
  stats?: React.ReactNode;
}) {
  const params = new URLSearchParams();
  if (recent) params.set('limit', '5');
  if (search) params.set('q', search);
  if (status) params.set('status', status);
  if (sort) params.set('sort', sort);
  const first = params.toString();
  if (!recent) params.set('page', String(page));
  const { data, error, retry } = useCmsPage<Page<Exercise> & { pagination?: ExercisePagination }>('/exercises?' + params);
  const [notice, setNotice] = React.useState('');
  const [selection, setSelection] = React.useState<string[]>([]);
  const [request, setRequest] = React.useState<ActionRequest>();
  const [result, setResult] = React.useState<ActionResult>();
  const [statsVersion, setStatsVersion] = React.useState(0);
  const items = data?.items ?? [];
  const selected = items.filter(item => selection.includes(item.id));
  const allSelected = items.length > 0 && selected.length === items.length;
  const pageCheckbox = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (pageCheckbox.current) pageCheckbox.current.indeterminate = selected.length > 0 && !allSelected;
  }, [selected.length, allSelected]);

  function refresh() {
    retry();
    setStatsVersion(value => value + 1);
  }

  function complete(next: ActionResult) {
    setRequest(undefined);
    setNotice('');
    setSelection(next.failed.map(item => item.exercise.id));
    setResult(next);
    refresh();
  }

  return (
    <div className="space-y-4">
      <React.Fragment key={statsVersion}>{stats}</React.Fragment>
      {notice && <p role="status" className="rounded-md border border-border bg-card px-4 py-2 text-sm">{notice}</p>}
      {result && <div className="space-y-2 rounded-md border border-border bg-card px-4 py-3 text-sm">
        <p role="status">Thành công {result.succeeded} bài{result.failed.length > 0 && ` · Chưa xử lý được ${result.failed.length} bài`}</p>
        {result.failed.length > 0 && <ul className="list-disc space-y-1 pl-5">
          {result.failed.map(({ exercise, message }) => <li key={exercise.id}>
            <Link href={'/admin/bai-tap/' + exercise.id} className="font-medium text-primary underline">{exercise.nameVi}</Link> · {message}
          </li>)}
        </ul>}
      </div>}
      {!recent && <form action="/admin/bai-tap" method="get" className={cmsFilter}>
        <label className="min-w-48 flex-1 space-y-1 text-sm">
          <span className="font-medium">Tìm bài tập</span>
          <input type="search" name="q" defaultValue={search} maxLength={100} placeholder="Tên, mã hoặc slug"
            className={cmsInput} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Trạng thái</span>
          <select name="status" defaultValue={status ?? ''} className={cmsInput}>
            <option value="">Tất cả</option>
            <option value="DRAFT">Bản nháp</option>
            <option value="PUBLISHED">Đang công khai</option>
            <option value="ARCHIVED">Đã gỡ</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Sắp xếp</span>
          <select name="sort" defaultValue={sort ?? 'updated_desc'} className={cmsInput}>
            <option value="updated_desc">Mới cập nhật</option>
            <option value="name_asc">Tên A–Z</option>
          </select>
        </label>
        <button type="submit" className="h-9 rounded-md border border-border px-3 text-sm font-semibold hover:bg-muted">Áp dụng</button>
        {(search || status || sort === 'name_asc') && <Link href="/admin/bai-tap" className="px-2 py-2 text-sm text-primary">Xóa bộ lọc</Link>}
      </form>}
      <div className={cmsPanel + " overflow-hidden"}>
      {error ? <div className="px-4"><LoadError error={error} retry={retry} /></div> : !data ? (
        <p role="status" className="p-5 text-sm text-muted-foreground">Đang tải bài tập…</p>
      ) : !data.items.length ? (
        <div className="p-8 text-center">
          <h2 className="font-semibold">{search || status ? 'Không tìm thấy bài phù hợp' : 'Kho chưa có bài tập'}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{search || status ? 'Thay đổi bộ lọc để tìm bài khác.' : 'Thêm bài đầu tiên và lưu bản nháp để bắt đầu.'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          {!recent && selected.length > 0 && <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <span className="mr-2 text-sm font-medium">Đã chọn {selected.length} bài</span>
            {listActions.map(action => {
              const eligible = selected.filter(item => canApply(action, item));
              if (!eligible.length) return null;
              return <Button key={action} type="button" variant="outline" size="sm"
                className={action === 'delete' ? 'text-destructive' : undefined}
                onClick={() => setRequest({ action, exercises: eligible })}>{actionLabels[action]} ({eligible.length})</Button>;
            })}
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelection([])}>Bỏ chọn</Button>
          </div>}
          <table className="w-full min-w-[660px] text-left text-sm" aria-label="Danh sách bài tập">
            <thead className={cmsTableHead}>
              <tr>
                {!recent && <th scope="col" className="w-10 pl-4">
                  <input ref={pageCheckbox} type="checkbox" aria-label="Chọn tất cả bài trên trang" className="size-4 accent-primary"
                    checked={allSelected} onChange={event => setSelection(event.target.checked ? items.map(item => item.id) : [])} />
                </th>}
                {['Bài tập', 'Nhóm cơ chính', 'Trạng thái', 'Cập nhật', 'Thao tác'].map(title => <th key={title} scope="col" className="px-4 py-3 font-medium">{title}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.items.map(exercise => {
                const draftPending = exercise.status === 'PUBLISHED' && exercise.draftVersion > (exercise.publishedVersion ?? 0);
                const edit = '/admin/bai-tap/' + exercise.id;
                return <tr key={exercise.id} className="hover:bg-muted/50 transition-colors group">
                  {!recent && <td className="pl-4">
                    <input type="checkbox" aria-label={'Chọn ' + exercise.nameVi} className="size-4 accent-primary"
                      checked={selection.includes(exercise.id)} onChange={event => {
                        const checked = event.target.checked;
                        setSelection(previous => checked ? [...previous, exercise.id] : previous.filter(id => id !== exercise.id));
                      }} />
                  </td>}
                  <th scope="row" className="px-4 py-3 font-normal">
                    <div className="flex items-center gap-3">
                      <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                        <Dumbbell className="size-4" />
                      </span>
                      <div>
                        <Link href={edit} className="font-semibold text-foreground hover:text-primary transition-colors">
                          {exercise.nameVi}
                        </Link>
                        <span className="block text-[11px] font-mono text-muted-foreground">{exercise.id}</span>
                      </div>
                    </div>
                  </th>
                  <td className="px-4 py-3 text-muted-foreground">
                    <div className="flex flex-wrap gap-1">
                      {exercise.primaryMuscleIds.length ? exercise.primaryMuscleIds.map(id => (
                        <span key={id} className="rounded-md border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground">
                          {muscleLabels[id] ?? id}
                        </span>
                      )) : <span className="text-xs text-muted-foreground/60">Chưa chọn</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={exercise.status} />
                    {draftPending && <span className="mt-1 block text-[11px] font-mono text-amber-600 dark:text-amber-400">Có bản nháp mới</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground font-mono">{dateLabel(exercise.updatedAt)}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link href={edit} aria-label={'Mở ' + exercise.nameVi} title="Chỉnh sửa bài tập" className={rowAction}>
                      <PencilLine aria-hidden="true" className="size-4" />
                    </Link>
                    <Link href={edit + '/xem-truoc'} aria-label={'Xem trước ' + exercise.nameVi} title="Xem trước" className={rowAction}>
                      <Eye aria-hidden="true" className="size-4" />
                    </Link>
                    {!recent && rowActions.filter(action => canApply(action, exercise)).map(action => {
                      const Icon = actionIcons[action];
                      return <button key={action} type="button" aria-label={actionLabels[action] + ' ' + exercise.nameVi}
                        title={actionLabels[action]} className={rowAction} onClick={() => setRequest({ action, exercises: [exercise] })}>
                        <Icon aria-hidden="true" className="size-4" />
                      </button>;
                    })}
                    {!recent && exercise.status === 'ARCHIVED' && <DeleteArchivedExercise exercise={exercise} onDeleted={name => { setNotice('Đã xóa bài tập: ' + name); setResult(undefined); toast.success('Đã xóa bài tập', name); refresh(); }} />}
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      )}
      {!recent && data?.pagination && data.pagination.total > 0 && <ExercisePages pagination={data.pagination} filters={first} />}
      </div>
      {request && <ExerciseListActionDialog request={request} onClose={() => setRequest(undefined)} onComplete={complete} />}
    </div>
  );
}

type ExercisePagination = { page: number; pageSize: number; total: number };

function ExercisePages({ pagination, filters }: { pagination: ExercisePagination; filters: string }) {
  const { page, pageSize, total } = pagination;
  const last = Math.ceil(total / pageSize);
  const pages = [1];
  for (let number = Math.max(2, page - 1); number <= Math.min(last - 1, page + 1); number++) {
    pages.push(number);
  }
  if (last > 1) pages.push(last);

  function href(number: number) {
    const params = new URLSearchParams(filters);
    if (number > 1) params.set('page', String(number));
    return '/admin/bai-tap' + (params.size ? '?' + params : '');
  }

  const button = 'inline-flex size-8 items-center justify-center rounded-md border border-border text-sm hover:bg-muted';
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
    <p className="text-sm text-muted-foreground">
      {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} / {total} bài tập
    </p>
    {last > 1 && <nav aria-label="Phân trang bài tập" className="flex flex-wrap items-center gap-1">
      {page > 1 && <Link href={href(page - 1)} aria-label="Trang trước" className={button}><ChevronLeft aria-hidden="true" className="size-4" /></Link>}
      {pages.map((number, index) => <React.Fragment key={number}>
        {index > 0 && number - pages[index - 1] > 1 && <span aria-hidden="true" className="px-1 text-muted-foreground">…</span>}
        {number === page
          ? <span aria-current="page" aria-label={'Trang ' + number} className="inline-flex size-8 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">{number}</span>
          : <Link href={href(number)} aria-label={'Trang ' + number} className={button}>{number}</Link>}
      </React.Fragment>)}
      {page < last && <Link href={href(page + 1)} aria-label="Trang tiếp theo" className={button}><ChevronRight aria-hidden="true" className="size-4" /></Link>}
    </nav>}
  </div>;
}
