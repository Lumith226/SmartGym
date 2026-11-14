import { Filter } from 'lucide-react';
import { AuditPanel } from '../audit-panel';
import { identifier, type AuditEntry } from '../cms';
import { supportNames } from '../support-types';
import { CmsHeading, cmsFilter } from '../cms-design';

const types = {
  exercise: 'Bài tập',
  ...supportNames,
  'exercise-variant': 'Biến thể cũ',
  import: 'Nhập KB',
} satisfies Record<AuditEntry['contentType'], string>;
const uuid = '[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}';
function dateAtUtc(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value > '9999-12-30')
    return undefined;
  const time = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(time.getTime()) || !time.toISOString().startsWith(value)) return undefined;
  return time;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { type, id, actor, from, to } = await searchParams;
  const contentType =
    typeof type === 'string' && Object.hasOwn(types, type)
      ? (type as AuditEntry['contentType'])
      : undefined;
  const contentId = typeof id === 'string' && identifier.test(id) ? id : undefined;
  const actorId =
    typeof actor === 'string' && new RegExp('^' + uuid + '$').test(actor) ? actor : undefined;
  const first = dateAtUtc(from),
    last = dateAtUtc(to);
  const invalid = (!!from && !first) || (!!to && !last) || (first && last && first > last);
  const invalidFilter = (!!type && !contentType) || (!!id && !contentId) || (!!actor && !actorId);
  const before = last && new Date(last.getTime() + 86400000).toISOString();

  return (
    <section className="space-y-6">
      <CmsHeading title="Nhật ký quản trị" description="Tra cứu các thay đổi nội dung, người thực hiện và lịch sử công bố." />

        <form
          method="get"
          action="/admin/nhat-ky"
          className={cmsFilter.replace("flex flex-wrap", "grid") + " sm:grid-cols-2 lg:grid-cols-3"}
        >
          <div className="space-y-1.5">
            <label htmlFor="audit-type" className="text-xs font-semibold text-foreground">Loại nội dung</label>
            <select
              id="audit-type"
              name="type"
              defaultValue={contentType ?? ''}
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Tất cả loại nội dung</option>
              {Object.entries(types).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="audit-id" className="text-xs font-semibold text-foreground">Mã nội dung (ID)</label>
            <input
              id="audit-id"
              name="id"
              defaultValue={contentId}
              maxLength={80}
              pattern="[a-z][a-z0-9_]{0,79}"
              placeholder="Mã bài tập / danh mục..."
              className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="audit-actor" className="text-xs font-semibold text-foreground">Mã người thực hiện (UUID)</label>
            <input
              id="audit-actor"
              name="actor"
              defaultValue={actorId}
              maxLength={36}
              pattern={uuid}
              placeholder="UUID người dùng..."
              className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="audit-from" className="text-xs font-semibold text-foreground">Từ ngày (UTC)</label>
            <input
              type="date"
              id="audit-from"
              name="from"
              max="9999-12-30"
              defaultValue={first?.toISOString().slice(0, 10)}
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="audit-to" className="text-xs font-semibold text-foreground">Đến hết ngày (UTC)</label>
            <input
              type="date"
              id="audit-to"
              name="to"
              max="9999-12-30"
              defaultValue={last?.toISOString().slice(0, 10)}
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <button
            type="submit"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-all"
          >
            <Filter className="size-3.5" />
            Lọc nhật ký
          </button>
        </form>

        {invalid || invalidFilter ? (
          <p
            role="alert"
            className="form-error rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-xs font-semibold text-destructive"
          >
            {invalid ? 'Khoảng ngày không hợp lệ.' : 'Bộ lọc nhật ký không hợp lệ.'}
          </p>
        ) : (
          <AuditPanel
            table
            id={contentId}
            contentType={contentType}
            actor={actorId}
            from={first?.toISOString()}
            to={before}
            key={`${contentType}:${contentId}:${actorId}:${first?.toISOString()}:${before}`}
          />
        )}

    </section>
  );
}
