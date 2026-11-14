'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  RefreshCw,
  Clock,
  User,
  ChevronLeft,
  ChevronRight,
  FileEdit,
  Eye,
  CheckCircle2,
  Sparkles,
  Info,
  Search,
  Calendar,
  Trash2,
  Dumbbell,
  SlidersHorizontal,
  PlusCircle,
} from 'lucide-react';
import {
  cms,
  dateLabel,
  errorMessage,
  exercisePath,
  statusNames,
  type AuditEntry,
  type Exercise,
  type Page,
} from './cms';
import { cn } from '../../lib/utils';
import { Card } from '../../components/ui/card';

export function LoadError({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="cms-feedback my-3 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive">
      <AlertCircle className="mt-0.5 size-5 shrink-0" />
      <div className="flex-1 text-sm">
        <p role="alert" className="form-error font-medium">
          {errorMessage(error)}
        </p>
      </div>
      {retry && (
        <button
          type="button"
          className="cms-secondary inline-flex h-8 items-center gap-1.5 rounded-lg border border-destructive/40 bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
          onClick={retry}
        >
          <RefreshCw className="size-3.5" />
          Thử tải lại
        </button>
      )}
    </div>
  );
}

export function useCmsPage<T>(path: string) {
  const [attempt, setAttempt] = React.useState(0);
  const [result, setResult] = React.useState<{ data: T; etag: string | null }>();
  const [error, setError] = React.useState<unknown>();

  React.useEffect(() => {
    const controller = new AbortController();
    setResult(undefined);
    setError(undefined);
    cms<T>(path, { signal: controller.signal })
      .then(response => {
        if (!controller.signal.aborted) setResult(response);
      })
      .catch(reason => {
        if (!controller.signal.aborted) setError(reason);
      });
    return () => controller.abort();
  }, [path, attempt]);

  return { ...result, error, retry: () => setAttempt(value => value + 1) };
}

function StatusBadge({ status }: { status: Exercise['status'] }) {
  const styles: Record<Exercise['status'], string> = {
    PUBLISHED: 'bg-emerald-50 text-emerald-700 border-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/40',
    DRAFT: 'bg-amber-50 text-amber-700 border-amber-200/70 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/40',
    ARCHIVED: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  };

  const s = styles[status] ?? 'bg-slate-100 text-slate-600 border-slate-200';
  const label = status === 'PUBLISHED' ? 'Công bố' : status === 'DRAFT' ? 'Bản nháp' : 'Lưu trữ';

  return (
    <span
      className={cn(
        'cms-badge inline-flex items-center px-2.5 py-0.5 text-[11px] font-semibold rounded-md border',
        s,
      )}
    >
      {label}
    </span>
  );
}

export function ExerciseList({
  search,
  status,
  sort,
  cursor,
  compact = false,
}: {
  search?: string;
  status?: string;
  sort?: string;
  cursor?: string;
  compact?: boolean;
}) {
  const params = new URLSearchParams();
  if (search) params.set('q', search);
  if (status) params.set('status', status);
  if (sort) params.set('sort', sort);
  if (compact) params.set('limit', '5');
  const first = params.toString();
  if (cursor) params.set('cursor', cursor);

  const { data, error, retry } = useCmsPage<Page<Exercise>>('/exercises?' + params);

  if (error) return <LoadError error={error} retry={retry} />;
  if (!data) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status">
        <RefreshCw className="size-4 animate-spin" />
        Đang tải bài tập…
      </div>
    );
  }

  if (!data.items.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-[#121520]">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-purple-50 text-[#635BFF] dark:bg-purple-950/40">
          <Dumbbell className="size-6" />
        </div>
        <h3 className="mt-4 text-base font-bold text-slate-900 dark:text-white">
          Chưa có bài tập nào trong hệ thống
        </h3>
        <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
          {search || status ? 'Không có bài tập nào phù hợp với bộ lọc hiện tại.' : 'Danh mục bài tập đang trống. Hãy tạo bài tập đầu tiên để bắt đầu xây dựng thư viện tập luyện của phòng tập.'}
        </p>
        <div className="mt-5">
          <Link
            href="/admin/bai-tap/moi"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#635BFF] px-4 text-xs font-semibold text-white shadow-xs hover:bg-[#5249e0] transition-colors"
          >
            <PlusCircle className="size-4" />
            Tạo bài tập mới
          </Link>
        </div>
      </div>
    );
  }

  // Chế độ thu gọn (Dashboard Tổng quan)
  if (compact) {
    return (
      <div className="space-y-4">
        <ul className="cms-list space-y-2.5" aria-label="Danh sách bài tập">
          {data.items.map(exercise => (
            <li
              key={exercise.id}
              className="flex flex-col justify-between gap-3 rounded-xl border border-border/70 bg-card p-3.5 transition-all hover:border-primary/40 hover:shadow-xs sm:flex-row sm:items-center"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Link
                    href={'/admin/bai-tap/' + exercise.id}
                    className="font-semibold text-foreground hover:text-primary transition-colors hover:underline"
                  >
                    <strong>{exercise.nameVi}</strong>
                  </Link>
                  {exercise.draftVersion > 0 && (
                    <span className="text-[11px] font-medium text-muted-foreground">
                      (v{exercise.draftVersion})
                    </span>
                  )}
                </div>
                <small className="block font-mono text-xs text-muted-foreground">{exercise.id}</small>
              </div>

              <div className="cms-list-meta flex flex-wrap items-center gap-2.5">
                <StatusBadge status={exercise.status} />
                <small className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="size-3.5" />
                  {dateLabel(exercise.updatedAt)}
                </small>
                <div className="flex items-center gap-1">
                  <Link
                    href={'/admin/bai-tap/' + exercise.id}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground hover:bg-muted"
                    title="Chỉnh sửa bài tập"
                  >
                    <FileEdit className="size-3.5" />
                    Sửa
                  </Link>
                  <Link
                    href={'/admin/bai-tap/' + exercise.id + '/xem-truoc'}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground hover:bg-muted"
                    title="Xem trước bài tập"
                  >
                    <Eye className="size-3.5" />
                    Xem trước
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Chế độ Modern SaaS Data Table chuẩn SmartGym
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-slate-800/60 dark:bg-[#121520] space-y-5 w-full">
      {/* Top Header & Filter Toolbar */}
      <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            Danh mục bài tập Catalog
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Quản lý thư viện bài tập thể hình, phân loại giải phẫu và tư thế tập luyện
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search Input */}
          <form action="/admin/bai-tap" method="get" className="relative">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-slate-400" />
            <input
              name="q"
              defaultValue={search}
              placeholder="Tìm bài tập, ID..."
              className="h-8.5 rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#635BFF] focus:outline-none focus:ring-1 focus:ring-[#635BFF] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
            />
          </form>

          {/* Date Range Button */}
          <button
            type="button"
            className="flex h-8.5 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-[#121520] dark:text-slate-300"
          >
            <Calendar className="size-3.5 text-slate-400" />
            <span>Khoảng ngày</span>
          </button>

          {/* Category Dropdown */}
          <Link
            href="/admin/noi-dung/muscle-group"
            className="flex h-8.5 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-[#121520] dark:text-slate-300"
          >
            <span>Nhóm cơ ∨</span>
          </Link>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="cms-list w-full text-left border-collapse text-xs" aria-label="Danh sách bài tập">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-slate-400">
              <th scope="col" className="py-2.5 pl-1 pr-3 w-8">
                <input type="checkbox" className="rounded border-slate-300 text-[#635BFF] focus:ring-[#635BFF]" />
              </th>
              <th scope="col" className="py-2.5 px-3">Bài tập</th>
              <th scope="col" className="py-2.5 px-3">Mã ID</th>
              <th scope="col" className="py-2.5 px-3">Phân loại</th>
              <th scope="col" className="py-2.5 px-3">Độ khó</th>
              <th scope="col" className="py-2.5 px-3">Nghỉ hiệp</th>
              <th scope="col" className="py-2.5 px-3">Trạng thái</th>
              <th scope="col" className="py-2.5 pl-3 pr-1 text-center">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {data.items.map(exercise => (
              <tr key={exercise.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors group">
                {/* Column 0: Checkbox */}
                <td className="py-3 pl-1 pr-3">
                  <input type="checkbox" className="rounded border-slate-300 text-[#635BFF] focus:ring-[#635BFF]" />
                </td>

                {/* Column 1: Tên bài tập */}
                <td className="py-3 px-3">
                  <div className="flex items-center gap-2.5">
                    <div className="size-9 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/60 flex items-center justify-center shrink-0 text-[#635BFF]">
                      <Dumbbell className="size-4.5" />
                    </div>
                    <div className="min-w-0">
                      <Link
                        href={'/admin/bai-tap/' + exercise.id}
                        className="font-bold text-slate-900 hover:text-[#635BFF] transition-colors text-xs hover:underline block truncate max-w-[200px] sm:max-w-[260px] dark:text-slate-100"
                      >
                        <strong>{exercise.nameVi}</strong>
                      </Link>
                      <span className="text-[11px] text-slate-400 block truncate max-w-[220px]">
                        {exercise.nameEn || exercise.slug || 'Tiêu chuẩn kỹ thuật'}
                        {exercise.draftVersion > 0 && ` · v${exercise.draftVersion}`}
                      </span>
                    </div>
                  </div>
                </td>

                {/* Column 2: Mã định danh */}
                <td className="py-3 px-3 whitespace-nowrap">
                  <span className="font-mono text-xs text-slate-600 dark:text-slate-400 font-medium">
                    {exercise.id}
                  </span>
                </td>

                {/* Column 3: Phân loại */}
                <td className="py-3 px-3 whitespace-nowrap text-slate-600 dark:text-slate-300 text-xs">
                  {exercise.workoutType ?? 'Chưa phân loại'}
                </td>

                {/* Column 4: Độ khó */}
                <td className="py-3 px-3 whitespace-nowrap text-slate-700 dark:text-slate-200 text-xs font-semibold">
                  {exercise.difficulty ?? 'Chưa đặt'}
                </td>

                {/* Column 5: Nghỉ hiệp */}
                <td className="py-3 px-3 whitespace-nowrap text-slate-600 dark:text-slate-400 text-xs">
                  {exercise.restSeconds === undefined ? 'Chưa đặt' : `${exercise.restSeconds}s`}
                </td>

                {/* Column 6: Trạng thái */}
                <td className="py-3 px-3 whitespace-nowrap">
                  <StatusBadge status={exercise.status} />
                  {exercise.status === 'PUBLISHED' && exercise.draftVersion > (exercise.publishedVersion ?? 0) && (
                    <span className="block text-xs text-muted-foreground">Có bản nháp chưa công bố</span>
                  )}
                </td>

                {/* Column 7: Thao tác */}
                <td className="py-3 pl-3 pr-1 text-center whitespace-nowrap">
                  <div className="inline-flex items-center gap-1.5">
                    {/* Xem trước */}
                    <Link
                      href={'/admin/bai-tap/' + exercise.id + '/xem-truoc'}
                      className="flex size-7 items-center justify-center rounded-md bg-[#e6faf8] text-[#0d9488] hover:bg-[#ccfbf1] transition-colors shadow-2xs dark:bg-teal-950/40 dark:text-teal-400"
                      title="Xem trước"
                    >
                      <Eye className="size-3.5" />
                    </Link>
                    {/* Chỉnh sửa */}
                    <Link
                      href={'/admin/bai-tap/' + exercise.id}
                      className="flex size-7 items-center justify-center rounded-md bg-[#eff6ff] text-[#2563eb] hover:bg-[#dbeafe] transition-colors shadow-2xs dark:bg-blue-950/40 dark:text-blue-400"
                      title="Chỉnh sửa"
                    >
                      <FileEdit className="size-3.5" />
                    </Link>
                    {/* Lưu trữ */}
                    <Link
                      href={'/admin/bai-tap/' + exercise.id}
                      className="flex size-7 items-center justify-center rounded-md bg-[#fef2f2] text-[#ef4444] hover:bg-[#fee2e2] transition-colors shadow-2xs dark:bg-red-950/40 dark:text-red-400"
                      title="Lưu trữ / Xóa"
                    >
                      <Trash2 className="size-3.5" />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Real Pagination Footer */}
      <nav aria-label="Phân trang bài tập" className="cms-actions flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
        <div className="text-xs text-slate-500 dark:text-slate-400">
          Hiển thị <span className="font-semibold text-slate-800 dark:text-slate-100">{data.items.length}</span> bài tập
        </div>

        <div className="flex items-center gap-2">
          {cursor ? (
            <Link
              href={'/admin/bai-tap' + (first ? '?' + first : '')}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors dark:border-slate-800 dark:bg-[#121520] dark:text-slate-300"
            >
              <ChevronLeft className="size-3.5" />
              Về trang đầu
            </Link>
          ) : null}

          {data.nextCursor && (
            <Link
              href={
                '/admin/bai-tap?' +
                new URLSearchParams({
                  ...Object.fromEntries(new URLSearchParams(first)),
                  cursor: data.nextCursor,
                })
              }
              className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#635BFF] px-3.5 text-xs font-semibold text-white hover:bg-[#5249e0] transition-colors"
            >
              Trang tiếp theo
              <ChevronRight className="size-3.5" />
            </Link>
          )}
        </div>
      </nav>
    </div>
  );
}

const actions: Record<AuditEntry['action'], string> = {
  CREATE_DRAFT: 'Tạo bản nháp',
  UPDATE_DRAFT: 'Lưu bản nháp',
  PUBLISH: 'Công bố',
  UNPUBLISH: 'Gỡ công bố',
  ARCHIVE: 'Lưu trữ',
  DELETE: 'Xóa bản ghi',
  RESTORE: 'Khôi phục bản nháp',
  RESTORE_REVISION: 'Khôi phục phiên bản cũ',
  VALIDATE_IMPORT: 'Kiểm tra gói KB',
  APPLY_IMPORT: 'Áp dụng gói vào bản nháp',
};

export function AuditPanel({
  id,
  contentType,
  actor,
  from,
  to,
}: {
  id?: string;
  contentType?: AuditEntry['contentType'];
  actor?: string;
  from?: string;
  to?: string;
}) {
  const [cursors, setCursors] = React.useState<string[]>([]);
  const params = new URLSearchParams({ limit: '5' });
  if (id) params.set('contentId', id);
  if (contentType) params.set('contentType', contentType);
  if (actor) params.set('actorUserId', actor);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const cursor = cursors.at(-1);
  if (cursor) params.set('cursor', cursor);

  const { data, error, retry } = useCmsPage<Page<AuditEntry>>('/catalog-audit?' + params);

  return (
    <section aria-label="Nhật ký quản trị" className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
          Nhật ký quản trị & kiểm toán
        </h2>
      </div>

      {error ? (
        <LoadError error={error} retry={retry} />
      ) : !data ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground" role="status">
          <RefreshCw className="size-4 animate-spin" />
          Đang tải nhật ký…
        </div>
      ) : data.items.length ? (
        <ul className="cms-list space-y-2.5">
          {data.items.map(entry => (
            <li
              key={entry.id}
              className="flex flex-col justify-between gap-3 rounded-xl border border-border/70 bg-card p-4 transition-all hover:border-primary/40 sm:flex-row sm:items-start"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                    {actions[entry.action] ?? entry.action}
                  </span>
                  <span className="text-xs text-muted-foreground">·</span>
                  {entry.contentType === 'exercise' ? (
                    <Link
                      href={'/admin/bai-tap/' + entry.contentId}
                      className="font-mono text-xs font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {entry.contentId}
                    </Link>
                  ) : (
                    <span className="font-mono text-xs text-muted-foreground">
                      {entry.contentType} / {entry.contentId}
                    </span>
                  )}
                </div>

                {entry.reason && (
                  <p className="text-xs font-medium text-foreground">Lý do: {entry.reason}</p>
                )}
                {entry.sourceVersion && (
                  <p className="text-xs text-muted-foreground">Từ phiên bản {entry.sourceVersion}</p>
                )}
                <small className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <User className="size-3" />
                  Người thực hiện: <code className="font-mono">{entry.actorUserId}</code>
                </small>
              </div>

              <div className="cms-list-meta flex flex-col items-end gap-1 text-right">
                <time dateTime={entry.at} className="text-xs font-medium text-foreground">
                  {dateLabel(entry.at)}
                </time>
                <small className="rounded-sm bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {entry.afterVersion ? 'Phiên bản ' + entry.afterVersion : entry.revision}
                </small>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Chưa có thay đổi nào được ghi nhận.
        </Card>
      )}

      <div className="cms-actions flex items-center justify-between pt-2">
        {cursors.length > 0 ? (
          <button
            type="button"
            className="cms-secondary inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted"
            onClick={() => setCursors(previous => previous.slice(0, -1))}
          >
            <ChevronLeft className="size-3.5" />
            Trang trước
          </button>
        ) : (
          <span />
        )}

        {data?.nextCursor && (
          <button
            type="button"
            className="cms-secondary inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted"
            onClick={() => setCursors(previous => [...previous, data.nextCursor!])}
          >
            Trang tiếp theo
            <ChevronRight className="size-3.5" />
          </button>
        )}
      </div>
    </section>
  );
}

export function RecentActivityTable() {
  const { data, error, retry } = useCmsPage<Page<AuditEntry>>('/catalog-audit?limit=5');

  if (error) return <LoadError error={error} retry={retry} />;
  if (!data) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-slate-400" role="status">
        <RefreshCw className="size-4 animate-spin text-[#635BFF]" />
        Đang tải lịch sử hoạt động…
      </div>
    );
  }

  if (!data.items.length) {
    return (
      <div className="py-8 text-center text-xs text-slate-400">
        Chưa có hoạt động quản trị nào gần đây. Các thao tác tạo bài tập, lưu bản nháp hay công bố sẽ được tự động ghi lại tại đây.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-slate-400">
            <th className="py-2.5 pl-1 pr-3 w-8">
              <input type="checkbox" className="rounded border-slate-300 text-[#635BFF] focus:ring-[#635BFF]" />
            </th>
            <th className="py-2.5 px-3">Người thực hiện</th>
            <th className="py-2.5 px-3">Thao tác nghiệp vụ</th>
            <th className="py-2.5 px-3">Mã nội dung</th>
            <th className="py-2.5 pl-3 pr-1 text-right">Thời gian</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
          {data.items.map(entry => {
            const actorInitial = entry.actorUserId ? entry.actorUserId.slice(0, 2).toUpperCase() : 'AP';
            return (
              <tr key={entry.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
                <td className="py-3 pl-1 pr-3">
                  <input type="checkbox" className="rounded border-slate-300 text-[#635BFF] focus:ring-[#635BFF]" />
                </td>
                <td className="py-3 px-3 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <div className="flex size-7 items-center justify-center rounded-md bg-gradient-to-tr from-[#635BFF] to-[#918aff] text-white font-bold text-xs">
                      {actorInitial}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-slate-100 font-mono text-xs">
                        {entry.actorUserId.length > 12 ? entry.actorUserId.slice(0, 8) + '...' : entry.actorUserId}
                      </p>
                      <p className="text-[10px] text-slate-400">Quản trị viên</p>
                    </div>
                  </div>
                </td>
                <td className="py-3 px-3">
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    {actions[entry.action] ?? entry.action}
                  </span>
                  {entry.reason && (
                    <span className="text-[11px] text-slate-400 block truncate max-w-[200px]">
                      {entry.reason}
                    </span>
                  )}
                </td>
                <td className="py-3 px-3 whitespace-nowrap">
                  {entry.contentType === 'exercise' ? (
                    <Link
                      href={'/admin/bai-tap/' + entry.contentId}
                      className="font-mono text-xs text-[#635BFF] hover:underline font-medium"
                    >
                      {entry.contentId}
                    </Link>
                  ) : (
                    <span className="font-mono text-xs text-slate-500">
                      {entry.contentId}
                    </span>
                  )}
                </td>
                <td className="py-3 pl-3 pr-1 text-right whitespace-nowrap text-slate-400 text-xs">
                  {dateLabel(entry.at)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function DraftPreview({ id }: { id: string }) {
  const { data, error, retry } = useCmsPage<Exercise>(exercisePath(id));

  if (error) return <LoadError error={error} retry={retry} />;
  if (!data) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground" role="status">
        <RefreshCw className="size-4 animate-spin" />
        Đang tải bản xem trước…
      </div>
    );
  }

  return (
    <article className="cms-preview mx-auto max-w-3xl space-y-6 rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
      {/* Banner chế độ xem trước */}
      <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 px-3.5 py-2 text-xs font-semibold text-amber-600 dark:text-amber-400">
        <Sparkles className="size-4" />
        <p className="eyebrow">Bản xem trước riêng · Phiên bản nháp {data.draftVersion}</p>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{data.nameVi}</h1>
        {data.nameEn && <p className="mt-1 text-sm italic text-muted-foreground">{data.nameEn}</p>}
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">{data.summary}</p>
      </div>

      {/* Thông số kỹ thuật bài tập */}
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-border/80 bg-muted/40 p-4 sm:grid-cols-4">
        <div>
          <span className="block text-[11px] font-semibold uppercase text-muted-foreground">Loại hình</span>
          <span className="mt-0.5 block text-sm font-bold text-foreground">{data.workoutType ?? 'STRENGTH'}</span>
        </div>
        <div>
          <span className="block text-[11px] font-semibold uppercase text-muted-foreground">Trọng tâm</span>
          <span className="mt-0.5 block text-sm font-bold text-foreground">{data.focusArea ?? 'FULL_BODY'}</span>
        </div>
        <div>
          <span className="block text-[11px] font-semibold uppercase text-muted-foreground">Độ khó</span>
          <span className="mt-0.5 block text-sm font-bold text-foreground">Level {data.difficulty ?? 2}</span>
        </div>
        <div>
          <span className="block text-[11px] font-semibold uppercase text-muted-foreground">Nghỉ giữa hiệp</span>
          <span className="mt-0.5 block text-sm font-bold text-foreground">{data.restSeconds ?? 90} giây</span>
        </div>
      </div>

      {/* Hướng dẫn chi tiết */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-foreground">Cách thực hiện</h2>
        <ol className="space-y-2.5 rounded-2xl border border-border/60 bg-muted/20 p-5">
          {data.instructions.map((item, index) => (
            <li key={index} className="flex items-start gap-3 text-sm leading-relaxed text-foreground">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {index + 1}
              </span>
              <span className="pt-0.5">{item}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Lỗi thường gặp */}
      {!!data.commonMistakes?.length && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">Lỗi thường gặp</h2>
          <ul className="space-y-2 rounded-2xl border border-destructive/20 bg-destructive/5 p-5">
            {data.commonMistakes.map((item, index) => (
              <li key={index} className="flex items-start gap-2.5 text-sm text-foreground">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-destructive" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Notes */}
      {(!!data.mediaIds?.length || !!data.variantIds?.length) && (
        <div className="space-y-1 rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
          {!!data.mediaIds?.length && (
            <p className="flex items-center gap-1.5">
              <Info className="size-3.5 text-primary" />
              Catalog kiểm tra tệp và quyền media khi công bố.
            </p>
          )}
          {!!data.variantIds?.length && (
            <p className="flex items-center gap-1.5">
              <Info className="size-3.5 text-primary" />
              Biến thể phải được công bố và thuộc đúng bài tập.
            </p>
          )}
        </div>
      )}
    </article>
  );
}

export function AdminStatsCards() {
  const { data, error, retry } = useCmsPage<{ total: number; published: number; drafts: number; archived: number; unpublishedChanges: number }>('/stats');
  if (error) return <div role="alert">Không tải được thống kê kho bài tập. <button type="button" onClick={retry}>Thử lại</button></div>;
  if (!data) return <p role="status">Đang tải thống kê kho bài tập…</p>;
  const { total, published, drafts, archived, unpublishedChanges } = data;

  return (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {/* Card 1: Tổng bài tập */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-slate-800/60 dark:bg-[#121520] flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Tổng số bài tập
            </span>
            <span className="rounded-md bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-[#635BFF] dark:bg-purple-950/40">
              Kho bài tập
            </span>
          </div>
          <div className="mt-2">
            <h3 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {total}
            </h3>
            <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1 mt-0.5">
              {total === 0 ? 'Chưa có bài tập nào' : `${archived} bài đã gỡ khỏi thư viện`}
            </span>
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-400">Dữ liệu thực tế</span>
          <Link href="/admin/bai-tap" className="font-semibold text-[#635BFF] hover:underline">
            Xem danh sách &rarr;
          </Link>
        </div>
      </div>

      {/* Card 2: Đang xuất bản Live */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-slate-800/60 dark:bg-[#121520] flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Đang công bố (Live)
            </span>
            <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:bg-emerald-950/40">
              Trực tuyến
            </span>
          </div>
          <div className="mt-2">
            <h3 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {published}
            </h3>
            <span className="text-[11px] font-medium text-emerald-600 flex items-center gap-1 mt-0.5">
              <CheckCircle2 className="size-3" /> {unpublishedChanges} bài có chỉnh sửa chưa công bố
            </span>
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-400">Sẵn sàng tập luyện</span>
          <Link href="/admin/bai-tap?status=PUBLISHED" className="font-semibold text-emerald-600 hover:underline">
            Lọc bài công bố &rarr;
          </Link>
        </div>
      </div>

      {/* Card 3: Bản nháp */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-slate-800/60 dark:bg-[#121520] flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Bản nháp đang biên tập
            </span>
            <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:bg-amber-950/40">
              Chưa xuất bản
            </span>
          </div>
          <div className="mt-2">
            <h3 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {drafts}
            </h3>
            <span className="text-[11px] font-medium text-amber-600 flex items-center gap-1 mt-0.5">
              <FileEdit className="size-3" /> Bản nháp chưa công khai
            </span>
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-400">Đang hoàn thiện nội dung</span>
          <Link href="/admin/bai-tap?status=DRAFT" className="font-semibold text-amber-600 hover:underline">
            Xử lý bản nháp &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
