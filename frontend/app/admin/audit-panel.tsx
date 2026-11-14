'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, FileText, Globe, PencilLine, RefreshCw, User } from 'lucide-react';
import { dateLabel, type AuditEntry, type Page } from './cms';
import { Card } from '../../components/ui/card';
import { CmsStat, cmsPanel, cmsTableHead } from './cms-design';
import { LoadError, useCmsPage } from './cms-request';

const actions: Record<AuditEntry['action'], string> = {
  CREATE_DRAFT: 'Tạo bản nháp',
  UPDATE_DRAFT: 'Lưu bản nháp',
  PUBLISH: 'Công bố',
  UNPUBLISH: 'Gỡ công bố',
  ARCHIVE: 'Lưu trữ',
  DELETE: 'Xóa bài tập',
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
  table = false,
}: {
  id?: string;
  contentType?: AuditEntry['contentType'];
  actor?: string;
  from?: string;
  to?: string;
  table?: boolean;
}) {
  const [cursors, setCursors] = React.useState<string[]>([]);
  const params = new URLSearchParams({ limit: table ? '20' : '5' });
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
      {table && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Thống kê nhật ký trên trang hiện tại">
        <CmsStat label="Bản ghi trên trang" value={data?.items.length ?? '—'} icon={<FileText />} />
        <CmsStat label="Lượt công bố" value={data?.items.filter(entry => entry.action === 'PUBLISH').length ?? '—'} icon={<Globe />} tone="green" />
        <CmsStat label="Lượt lưu nháp" value={data?.items.filter(entry => ['CREATE_DRAFT', 'UPDATE_DRAFT'].includes(entry.action)).length ?? '—'} icon={<PencilLine />} tone="amber" />
        <CmsStat label="Người thực hiện" value={data ? new Set(data.items.map(entry => entry.actorUserId)).size : '—'} icon={<User />} tone="purple" />
      </div>}
      {!table && <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
          Nhật ký quản trị & kiểm toán
        </h2>
      </div>}

      {error ? (
        <LoadError error={error} retry={retry} />
      ) : !data ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground" role="status">
          <RefreshCw className="size-4 animate-spin" />
          Đang tải nhật ký…
        </div>
      ) : table && data.items.length ? (
        <div className={cmsPanel + ' overflow-x-auto'}>
          <table aria-label="Các thay đổi đã ghi nhận" className="w-full min-w-[740px] text-left text-sm">
            <thead className={cmsTableHead}><tr>{['Thời gian', 'Người thực hiện', 'Hành động', 'Nội dung', 'Chi tiết'].map(title => <th key={title} scope="col" className="px-4 py-3">{title}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">
              {data.items.map(entry => <tr key={entry.id} className="align-top hover:bg-muted/40">
                <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground"><time dateTime={entry.at}>{dateLabel(entry.at)}</time></td>
                <td className="max-w-40 break-all px-4 py-3 font-mono text-xs text-muted-foreground">{entry.actorUserId}</td>
                <td className="px-4 py-3"><span className="inline-block rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{actions[entry.action]}</span></td>
                <td className="max-w-56 break-words px-4 py-3 text-xs">{entry.contentType === 'exercise'
                  ? <Link href={'/admin/bai-tap/' + entry.contentId} className="font-semibold text-primary hover:underline">{entry.contentId}</Link>
                  : <span>{entry.contentId}</span>}
                  <span className="block text-muted-foreground">{entry.contentType}</span>
                </td>
                <td className="max-w-56 break-words px-4 py-3 text-xs text-muted-foreground">
                  {entry.afterVersion ? 'Phiên bản ' + entry.afterVersion : entry.revision}
                  {entry.sourceVersion && <p>Từ phiên bản {entry.sourceVersion}</p>}
                  {entry.reason && <p>Lý do: {entry.reason}</p>}
                </td>
              </tr>)}
            </tbody>
          </table>
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
                  {entry.contentType === 'exercise' && entry.action !== 'DELETE' ? (
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

export function RecentActivityList() {
  const { data, error, retry } = useCmsPage<Page<AuditEntry>>('/catalog-audit?limit=5');
  if (error) return <LoadError error={error} retry={retry} />;
  if (!data) return <p role="status" className="py-5 text-sm text-muted-foreground">Đang tải hoạt động…</p>;
  if (!data.items.length) return <p className="py-5 text-sm text-muted-foreground">Chưa có hoạt động quản trị.</p>;
  return <ul className="divide-y divide-border">
    {data.items.map(entry => <li key={entry.id} className="flex gap-3 py-2.5">
      <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><PencilLine className="size-3.5" /></span>
      <div className="min-w-0 text-sm">
        <p className="font-semibold">{actions[entry.action]}</p>
        <p className="break-words text-xs text-muted-foreground">{entry.contentId} · {dateLabel(entry.at)}</p>
      </div>
    </li>)}
  </ul>;
}

export function ActivitySummary() {
  const { data, error, retry } = useCmsPage<Page<AuditEntry>>('/catalog-audit?limit=25');
  if (error) return <LoadError error={error} retry={retry} />;
  if (!data) return <p role="status" className="py-5 text-sm text-muted-foreground">Đang tải thống kê hoạt động…</p>;
  if (!data.items.length) return <p className="py-5 text-sm text-muted-foreground">Chưa có dữ liệu hoạt động.</p>;
  const counts = new Map<AuditEntry['action'], number>();
  for (const entry of data.items) counts.set(entry.action, (counts.get(entry.action) ?? 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 5);
  return <div className="space-y-3">
    <p className="text-xs text-muted-foreground">Theo loại thao tác, trong {data.items.length} bản ghi mới nhất.</p>
    <ul className="space-y-2.5">
      {top.map(([action, count]) => <li key={action} className="space-y-1 text-xs">
        <div className="flex justify-between gap-2"><span>{actions[action]}</span><strong>{count}</strong></div>
        <div aria-hidden="true" className="h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: (count / data.items.length) * 100 + '%' }} /></div>
      </li>)}
    </ul>
  </div>;
}
