'use client';

import * as React from 'react';
import {
  History,
  GitCompare,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Clock,
  User,
} from 'lucide-react';
import { dateLabel, type Draft, type Page } from './cms';
import { LoadError, useCmsPage } from './cms-request';
import { cn } from '../../lib/utils';
import { Card } from '../../components/ui/card';

type Revision = {
  version: number;
  at: string;
  actorUserId: string | null;
  reason?: string;
  sourceVersion?: number;
  action: 'CREATE' | 'EDIT' | 'PUBLISH' | 'ARCHIVE' | 'RESTORE' | 'RESTORE_REVISION';
  data: Draft | { id: string; contentType: string; data: Record<string, string | number> };
};
const labels: Record<Revision['action'], string> = {
  CREATE: 'Tạo mới',
  EDIT: 'Chỉnh sửa',
  PUBLISH: 'Công bố',
  ARCHIVE: 'Lưu trữ',
  RESTORE: 'Khôi phục',
  RESTORE_REVISION: 'Khôi phục phiên bản',
};
type Props = {
  contentType: string;
  id: string;
  current: number;
  disabled: boolean;
  restore: (version: number, reason: string) => Promise<void>;
};
export const revisionPath = (contentType: string, id: string) =>
  `/revisions/${contentType}/${encodeURIComponent(id)}`;

export function RevisionPanel(props: Props) {
  const [open, setOpen] = React.useState(false);

  return (
    <section aria-label="Lịch sử phiên bản" className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="size-4 text-primary" />
          <h2 className="text-base font-bold text-foreground">Lịch sử phiên bản</h2>
        </div>
        <button
          type="button"
          className="cms-secondary inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted"
          aria-expanded={open}
          onClick={() => setOpen(value => !value)}
        >
          {open ? (
            <>
              <ChevronUp className="size-3.5" /> Ẩn lịch sử
            </>
          ) : (
            <>
              <ChevronDown className="size-3.5" /> Xem lịch sử
            </>
          )}
        </button>
      </div>

      {open && <RevisionList {...props} key={props.current} />}
    </section>
  );
}

function Snapshot({ revision }: { revision: Revision }) {
  const snapshot =
    'contentType' in revision.data
      ? { id: revision.data.id, ...revision.data.data }
      : revision.data;

  return (
    <dl className="grid gap-2 rounded-xl border border-border/60 bg-muted/30 p-4 text-xs">
      {Object.entries(snapshot).map(([name, value]) => (
        <div key={name} className="grid grid-cols-[140px_1fr] gap-2 py-1 border-b border-border/40 last:border-0">
          <dt className="font-semibold text-muted-foreground">{name}</dt>
          <dd className="font-mono text-foreground break-words">
            {Array.isArray(value) ? (
              value.length ? (
                <ul className="list-inside list-disc space-y-0.5">
                  {value.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              ) : (
                '—'
              )
            ) : (
              String(value)
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function RevisionList({ contentType, id, current, disabled, restore }: Props) {
  const [selected, setSelected] = React.useState<number>();
  const [reason, setReason] = React.useState('');
  const [comparison, setComparison] = React.useState<number[]>([]);
  const { data, error, retry } = useCmsPage<Page<Revision>>(
    revisionPath(contentType, id) + '?limit=10',
  );
  const compared = comparison
    .map(version => data?.items.find(item => item.version === version))
    .filter(item => item !== undefined);

  return (
    <div className="space-y-4 pt-2">
      {error ? (
        <LoadError error={error} retry={retry} />
      ) : !data ? (
        <p role="status" className="text-xs text-muted-foreground">
          Đang tải lịch sử…
        </p>
      ) : (
        <ul className="cms-list space-y-3">
          {data.items.map(item => {
            const isCurrent = item.version === current;
            return (
              <li
                key={item.version}
                className={cn(
                  'rounded-xl border p-4 space-y-2 transition-all',
                  isCurrent
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-border/70 bg-card hover:border-primary/30',
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-bold text-foreground">
                      v{item.version}
                    </span>
                    <span className="text-xs font-semibold text-foreground">
                      {labels[item.action] ?? item.action}
                    </span>
                    {isCurrent && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                        Hiện tại
                      </span>
                    )}
                  </div>
                  <time dateTime={item.at} className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3" />
                    {dateLabel(item.at)}
                  </time>
                </div>

                {item.reason && (
                  <p className="text-xs font-medium text-foreground">Lý do: {item.reason}</p>
                )}
                {item.sourceVersion && (
                  <p className="text-xs text-muted-foreground">Phiên bản nguồn: {item.sourceVersion}</p>
                )}
                <small className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <User className="size-3" />
                  {item.actorUserId ? 'Người thực hiện: ' + item.actorUserId : 'Bản khởi tạo'}
                </small>

                <div className="pt-2 flex flex-wrap items-center gap-3">
                  <details className="text-xs">
                    <summary className="cursor-pointer font-semibold text-primary hover:underline">
                      Xem nội dung phiên bản {item.version}
                    </summary>
                    <div className="pt-2">
                      <Snapshot revision={item} />
                    </div>
                  </details>

                  {data.items.length > 1 && (
                    <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-foreground">
                      <input
                        type="checkbox"
                        checked={comparison.includes(item.version)}
                        disabled={comparison.length === 2 && !comparison.includes(item.version)}
                        onChange={event =>
                          setComparison(values =>
                            event.target.checked
                              ? [...values, item.version]
                              : values.filter(version => version !== item.version),
                          )
                        }
                        className="size-3.5 rounded border-border text-primary focus:ring-1 focus:ring-primary"
                      />
                      So sánh phiên bản {item.version}
                    </label>
                  )}

                  {!isCurrent && (
                    <button
                      type="button"
                      className="cms-secondary inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs font-semibold text-foreground hover:bg-muted"
                      disabled={disabled}
                      onClick={() => {
                        setSelected(item.version);
                        setReason('');
                      }}
                    >
                      <RotateCcw className="size-3" />
                      Khôi phục phiên bản {item.version}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Comparison Diff Box */}
      {compared.length === 2 && (
        <Card role="region" aria-label="So sánh phiên bản" className="cms-fields p-5 space-y-4 border-primary/30">
          <div className="flex items-center gap-2 border-b border-border/70 pb-3">
            <GitCompare className="size-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">
              Đối chiếu song song hai phiên bản (v{compared[0].version} ↔ v{compared[1].version})
            </h3>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {compared.map(item => (
              <article key={item.version} className="space-y-2 rounded-xl border border-border bg-muted/20 p-4">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Phiên bản v{item.version} ({dateLabel(item.at)})
                </h4>
                <Snapshot revision={item} />
              </article>
            ))}
          </div>
        </Card>
      )}

      {/* Restore Dialog Form */}
      {selected !== undefined && (
        <form
          className="cms-confirm space-y-3 rounded-2xl border border-primary/40 bg-card p-5 shadow-xs"
          onSubmit={event => {
            event.preventDefault();
            if (!disabled && reason.trim()) void restore(selected, reason.trim());
          }}
        >
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-foreground">
              Khôi phục về phiên bản v{selected}
            </h3>
            <p className="text-xs text-muted-foreground">
              Phiên bản {selected} sẽ được sao chép thành bản nháp mới. Bản đang công khai được giữ nguyên.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="revision-restore-reason" className="text-xs font-semibold text-foreground">
              Lý do khôi phục phiên bản
            </label>
            <textarea
              id="revision-restore-reason"
              required
              maxLength={500}
              value={reason}
              onChange={event => setReason(event.target.value)}
              rows={2}
              placeholder="Nhập lý do rollback..."
              className="w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              className="cms-secondary inline-flex h-8 items-center rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted"
              onClick={() => setSelected(undefined)}
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={disabled || !reason.trim()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <RotateCcw className="size-3" />
              Xác nhận khôi phục
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
