'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Save,
  RotateCcw,
  Globe,
  Archive,
  Image as ImageIcon, Video, Layers, Wrench,
  FileEdit,
  RefreshCw,
} from 'lucide-react';
import {
  CmsError,
  cms,
  dateLabel,
  errorMessage,
  statusNames,
  type Page,
  type Status,
} from './cms';
import { AuditPanel } from './audit-panel';
import { LoadError, useCmsPage } from './cms-request';
import { MediaUpload } from './media-upload';
import { RevisionPanel, revisionPath } from './revisions';
import { supportApi, supportNames, supportPage, type SupportType } from './support-types';
import { Card } from '../../components/ui/card';
import { cn } from '../../lib/utils';
import { CmsStat, cmsPanel, cmsTableHead } from './cms-design';
import { toast } from '../../lib/toast';

type Data = Record<string, string | number>;
type Content = {
  id: string;
  data: Data;
  status: Status;
  editVersion: number;
  publishedVersion?: number;
  updatedAt: string;
};
type Field = {
  name: string;
  label: string;
  max?: number;
  pattern?: string;
  optional?: boolean;
  options?: Record<string, string>;
  kind?: 'number' | 'url' | 'textarea';
  initial?: string | number;
};
const stableId = '[a-z][a-z0-9_]{0,79}';
const nameVi = { name: 'nameVi', label: 'Tên tiếng Việt', max: 120 };
const slug = {
  name: 'slug',
  label: 'Đường dẫn (slug)',
  max: 100,
  pattern: '[a-z0-9]+(?:-[a-z0-9]+)*',
};
const fields: Record<SupportType, Field[]> = {
  'muscle-group': [
    nameVi,
    slug,
    {
      name: 'regionKey',
      label: 'Mã vùng SVG',
      max: 80,
      pattern: '[a-zA-Z][a-zA-Z0-9_\\-]{0,79}',
      optional: true,
    },
    {
      name: 'side',
      label: 'Mặt hiển thị',
      optional: true,
      options: { FRONT: 'Trước', BACK: 'Sau', BOTH: 'Cả hai' },
    },
    { name: 'sortOrder', label: 'Thứ tự', kind: 'number', initial: 0 },
  ],
  equipment: [nameVi, slug],
  media: [
    { name: 'kind', label: 'Loại tệp', options: { IMAGE: 'Ảnh', VIDEO: 'Video' } },
    { name: 'uploadId', label: 'Mã tệp đã kiểm tra', max: 80, pattern: stableId },
    { name: 'sourceUri', label: 'URL nguồn', kind: 'url', max: 2048, optional: true },
    { name: 'credit', label: 'Ghi công', max: 300, optional: true },
    { name: 'licenseRef', label: 'Tham chiếu giấy phép', max: 200, optional: true },
    { name: 'altText', label: 'Mô tả thay thế', max: 240, optional: true },
    {
      name: 'rightsStatus',
      label: 'Quyền công bố',
      options: { PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối' },
      initial: 'PENDING',
    },
  ],
};

function MediaTile({ item }: { item: Content }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [url, setUrl] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const video = item.data.kind === 'VIDEO';
  const upload = typeof item.data.uploadId === 'string' ? item.data.uploadId : '';
  const previewPath = '/media-uploads/' + encodeURIComponent(upload) + '/preview';
  const name = String(item.data.altText || item.id);

  React.useEffect(() => {
    const node = ref.current;
    if (!node || !upload || video) return;
    const controller = new AbortController();
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      void cms<{ url: string }>(previewPath, { signal: controller.signal })
        .then(result => { if (!controller.signal.aborted) setUrl(result.data.url); })
        .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    }, { rootMargin: '120px' });
    observer.observe(node);
    return () => { observer.disconnect(); controller.abort(); };
  }, [previewPath, upload, video]);

  async function loadVideo() {
    setLoading(true);
    setFailed(false);
    try {
      const { data } = await cms<{ url: string }>(previewPath);
      setUrl(data.url);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return <li className={cmsPanel + ' min-w-0 overflow-hidden'}>
    <div ref={ref} className="grid aspect-[16/10] place-items-center overflow-hidden bg-muted/60">
      {url && !failed ? video
        ? <video controls playsInline preload="metadata" aria-label={name} src={url} className="size-full min-h-0 object-contain" onError={() => setFailed(true)} />
        : <img src={url} alt={name} loading="lazy" referrerPolicy="no-referrer" className="size-full min-h-0 object-cover" onError={() => setFailed(true)} />
        : video && upload
          ? <button type="button" disabled={loading} onClick={() => void loadVideo()} className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-primary">
            <Video className="size-4" />{loading ? 'Đang tải…' : failed ? 'Thử mở lại' : 'Xem video'}
          </button>
          : <div className="grid justify-items-center gap-1 text-xs text-muted-foreground"><ImageIcon aria-hidden="true" className="size-6" />{failed || !upload ? 'Chưa xem được ảnh' : 'Ảnh minh họa'}</div>}
    </div>
    <div className="space-y-2 p-3">
      <Link href={supportPage('media') + '?' + new URLSearchParams({ id: item.id })} className="block break-words text-sm font-semibold hover:text-primary">{name}</Link>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded bg-muted px-2 py-0.5">{video ? 'Video' : 'Ảnh'}</span>
        <span>{statusNames[item.status]}</span>
      </div>
      <time dateTime={item.updatedAt} className="block text-xs text-muted-foreground">{dateLabel(item.updatedAt)}</time>
    </div>
  </li>;
}

export function SupportList({ type, search, status, cursor, filters }: {
  type: SupportType; search: string; status: string; cursor?: string; filters: React.ReactNode;
}) {
  const query = new URLSearchParams();
  if (search) query.set('q', search);
  if (status) query.set('status', status);
  const first = new URLSearchParams(query);
  if (cursor) query.set('cursor', cursor);
  const { data, error, retry } = useCmsPage<Page<Content>>(supportApi(type) + '?' + query);
  const items = data?.items ?? [];
  const next = new URLSearchParams(first);
  if (data?.nextCursor) next.set('cursor', data.nextCursor);
  const Icon = type === 'media' ? ImageIcon : type === 'equipment' ? Wrench : Layers;
  const count = (test: (item: Content) => boolean) => data ? items.filter(test).length : '—';

  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Thống kê trên trang hiện tại">
      <CmsStat label="Kết quả trên trang" value={data ? items.length : '—'} icon={<Icon />} />
      {type === 'media' ? <>
        <CmsStat label="Ảnh trên trang" value={count(item => item.data.kind === 'IMAGE')} icon={<ImageIcon />} tone="purple" />
        <CmsStat label="Video trên trang" value={count(item => item.data.kind === 'VIDEO')} icon={<Video />} tone="amber" />
      </> : <>
        <CmsStat label="Bản nháp trên trang" value={count(item => item.status === 'DRAFT')} icon={<FileEdit />} tone="amber" />
        <CmsStat label="Đã lưu trữ trên trang" value={count(item => item.status === 'ARCHIVED')} icon={<Archive />} tone="purple" />
      </>}
      <CmsStat label="Công bố trên trang" value={count(item => item.status === 'PUBLISHED')} icon={<Globe />} tone="green" />
    </div>
    {filters}
    {error ? <LoadError error={error} retry={retry} /> : !data
      ? <p role="status" className={cmsPanel + ' p-5 text-sm text-muted-foreground'}>Đang tải nội dung…</p>
      : !items.length
        ? <p className={cmsPanel + ' p-8 text-center text-sm text-muted-foreground'}>Chưa có nội dung phù hợp.</p>
        : type === 'media'
          ? <ul aria-label="Danh sách media" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {items.map(item => <MediaTile key={item.id} item={item} />)}
            </ul>
          : <div className={cmsPanel + ' overflow-x-auto'}>
              <table aria-label={'Danh sách ' + supportNames[type].toLowerCase()} className="w-full min-w-[560px] text-left text-sm">
                <thead className={cmsTableHead}><tr>{['Tên ' + supportNames[type].toLowerCase(), 'Đường dẫn (slug)', 'Trạng thái', 'Cập nhật', 'Thao tác'].map(title => <th key={title} scope="col" className="px-4 py-3">{title}</th>)}</tr></thead>
                <tbody className="divide-y divide-border">{items.map(item => {
                  const href = supportPage(type) + '?' + new URLSearchParams({ id: item.id });
                  return <tr key={item.id} className="hover:bg-muted/50 transition-colors group">
                    <th scope="row" className="px-4 py-3 text-left font-normal"><div className="flex items-center gap-3">
                      <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary border border-primary/20"><Icon className="size-4" /></span>
                      <div><Link href={href} className="font-semibold text-foreground hover:text-primary transition-colors">{item.data.nameVi ?? item.id}</Link><span className="block text-[11px] font-mono text-muted-foreground">{item.id}</span></div>
                    </div></th>
                    <td className="px-4 py-3"><code className="rounded border border-border bg-background px-2 py-0.5 font-mono text-xs text-muted-foreground">{item.data.slug ?? '—'}</code></td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs">
                      <span className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium border',
                        item.status === 'PUBLISHED' ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                        item.status === 'DRAFT' ? 'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400' :
                        'border-slate-500/25 bg-slate-500/10 text-slate-600 dark:text-slate-400'
                      )}>
                        <span aria-hidden="true" className={cn(
                          'size-1.5 rounded-full',
                          item.status === 'PUBLISHED' ? 'bg-emerald-500 shadow-[0_0_6px_rgba(52,211,153,0.8)]' :
                          item.status === 'DRAFT' ? 'bg-amber-500 shadow-[0_0_6px_rgba(251,191,36,0.8)]' :
                          'bg-slate-400'
                        )} />
                        {statusNames[item.status]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground font-mono"><time dateTime={item.updatedAt}>{dateLabel(item.updatedAt)}</time></td>
                    <td className="px-4 py-3"><Link href={href} aria-label={'Sửa ' + (item.data.nameVi ?? item.id)} className="inline-flex items-center rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-primary hover:border-primary/50 hover:bg-primary/10 transition-all">Sửa</Link></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>}
    {(cursor || data?.nextCursor) && <nav aria-label="Phân trang nội dung" className="flex flex-wrap justify-end gap-3 text-xs font-mono font-medium">
      {cursor && <Link href={supportPage(type) + '?' + first} className="inline-flex items-center rounded-lg border border-border bg-card px-3 py-1.5 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors">← Về trang đầu</Link>}
      {data?.nextCursor && <Link href={supportPage(type) + '?' + next} className="inline-flex items-center rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-primary hover:bg-primary/20 transition-colors">Trang tiếp theo →</Link>}
    </nav>}
  </div>;
}

export function SupportEditor({ type, id }: { type: SupportType; id?: string }) {
  if (id) return <ExistingSupport type={type} id={id} />;
  return <SupportForm type={type} />;
}

function ExistingSupport({ type, id }: { type: SupportType; id: string }) {
  const { data, etag, error, retry } = useCmsPage<Content>(supportApi(type, id));
  if (error) return <LoadError error={error} retry={retry} />;
  if (!data) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status">
        <RefreshCw className="size-4 animate-spin" />
        Đang tải bản nháp…
      </div>
    );
  }
  if (!etag) return <LoadError error={new Error('Missing ETag')} retry={retry} />;
  return <SupportForm type={type} initial={{ data, etag }} />;
}

type Loaded = { data: Content; etag: string };
type Transition = 'publish' | 'archive' | 'restore';
const transitions: Record<Transition, string> = {
  publish: 'Công bố',
  archive: 'Lưu trữ',
  restore: 'Khôi phục bản nháp',
};

function SupportForm({ type, initial }: { type: SupportType; initial?: Loaded }) {
  const [loaded, setLoaded] = React.useState(initial);
  const [formKey, setFormKey] = React.useState(0);
  const [dirty, setDirty] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [conflict, setConflict] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [confirmation, setConfirmation] = React.useState<Transition>();
  const [reason, setReason] = React.useState('');
  const newMediaId = React.useRef<string | null>(null);
  const [mediaFile, setMediaFile] = React.useState({
    id: String(initial?.data.data.uploadId ?? ''),
    kind: String(initial?.data.data.kind ?? ''),
  });
  const active = React.useRef(false);
  const last = React.useRef<{ fingerprint: string; key: string } | null>(null);
  const item = loaded?.data;
  const path = supportApi(type, item?.id);
  const blocked = dirty || pending || conflict || !!confirmation;

  function keyFor(action: string, body?: object) {
    const fingerprint = JSON.stringify([action, loaded?.etag, body]);
    if (last.current?.fingerprint !== fingerprint)
      last.current = { fingerprint, key: crypto.randomUUID() };
    return last.current.key;
  }

  async function execute(action: () => Promise<void>, message: string) {
    if (active.current) return;
    active.current = true;
    setPending(true);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(message);
      toast.success(message);
    } catch (failure) {
      if (failure instanceof CmsError && failure.status === 412) setConflict(true);
      const msg = errorMessage(failure);
      setError(msg);
      toast.error('Lỗi thao tác', msg);
    } finally {
      active.current = false;
      setPending(false);
    }
  }

  function accept(response: { data: Content; etag: string | null }) {
    if (!response.etag) throw new Error('Missing ETag');
    setLoaded({ data: response.data, etag: response.etag });
    setMediaFile({
      id: String(response.data.data.uploadId ?? ''),
      kind: String(response.data.data.kind ?? ''),
    });
    setDirty(false);
    setConflict(false);
    setConfirmation(undefined);
    setReason('');
    setFormKey(value => value + 1);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const changes: Data = {};
    if (type === 'media' && !item) {
      if (!mediaFile.id || !mediaFile.kind) {
        setError('Tải tệp và chọn Dùng tệp này trước khi lưu.');
        return;
      }
      changes.rightsStatus = 'APPROVED';
      changes.altText = String(values.get('altText') ?? '').trim() ||
        (mediaFile.kind === 'IMAGE' ? 'Ảnh minh họa' : 'Video minh họa');
    }
    for (const field of fields[type]) {
      if (!values.has(field.name)) continue;
      const raw = String(values.get(field.name)).trim();
      const previous = item?.data[field.name];
      if (!raw) {
        if (!field.optional || previous !== undefined) {
          setError(`Điền ${field.label.toLowerCase()} trước khi lưu.`);
          return;
        }
        continue;
      }
      const value = field.kind === 'number' ? Number(raw) : raw;
      if (value !== previous) changes[field.name] = value;
    }
    if (!Object.keys(changes).length) {
      setError('');
      setDirty(false);
      setNotice('Bản nháp chưa có thay đổi mới.');
      return;
    }
    const body = { contentType: type, data: changes };
    await execute(async () => {
      if (!item) {
        const id = type === 'media'
          ? (newMediaId.current ??= 'media_' + crypto.randomUUID().replaceAll('-', ''))
          : String(values.get('id')).trim();
        const create = { ...body, id };
        const { data } = await cms<Content>(path, {
          method: 'POST',
          body: create,
          key: keyFor('create', create),
        });
        window.location.replace(supportPage(type) + '?' + new URLSearchParams({ id: data.id }));
        return;
      }
      accept(await cms<Content>(path, { method: 'PATCH', body, match: loaded?.etag }));
    }, 'Đã lưu bản nháp.');
  }

  async function transition(action: Transition) {
    const body = action === 'archive' ? { reason: reason.trim() } : undefined;
    if (body && !body.reason) return;
    await execute(
      async () =>
        accept(
          await cms<Content>(path + '/' + action, {
            method: 'POST',
            body,
            match: loaded?.etag,
            key: keyFor(action, body),
          }),
        ),
      {
        publish: 'Đã công bố nội dung.',
        archive: 'Đã lưu trữ nội dung.',
        restore: 'Đã khôi phục bản nháp.',
      }[action],
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-xs">
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          {item
            ? String(item.data.nameVi ?? item.data.altText ?? item.id)
            : 'Tạo bản nháp ' + supportNames[type].toLowerCase()}
        </h1>
        {item && (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className={cn(
                'cms-badge rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
                item.status === 'PUBLISHED'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : item.status === 'DRAFT'
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    : 'border-zinc-500/30 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400',
              )}
            >
              {statusNames[item.status]}
            </span>
            <span>·</span>
            <span>Phiên bản {item.editVersion}</span>
            {item.publishedVersion ? (
              <>
                <span>·</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  Công khai v{item.publishedVersion}
                </span>
              </>
            ) : null}
          </div>
        )}
      </div>

      {type === 'media' && (
        <MediaUpload
          current={mediaFile.id}
          disabled={pending || conflict || !!confirmation || item?.status === 'ARCHIVED'}
          attach={(id, kind) => {
            setMediaFile({ id, kind });
            setDirty(true);
          }}
        />
      )}

      <form
        key={formKey}
        className="cms-editor space-y-6"
        method="post"
        onSubmit={save}
        onChange={() => setDirty(true)}
        aria-busy={pending}
      >
        <fieldset
          disabled={pending || item?.status === 'ARCHIVED' || !!confirmation}
          className="space-y-4 disabled:opacity-60"
        >
          <Card className="p-5 sm:p-6 space-y-4">
            <h2 className="text-base font-bold text-foreground">
              Thông tin {supportNames[type].toLowerCase()}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {type !== 'media' && <div className="space-y-1.5">
                <label htmlFor="support-id" className="text-xs font-semibold text-foreground">Mã nội dung (ID)</label>
                <input
                  id="support-id"
                  name="id"
                  required
                  maxLength={80}
                  pattern={stableId}
                  defaultValue={item?.id}
                  readOnly={!!item}
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary read-only:bg-muted read-only:text-muted-foreground"
                />
              </div>}

              {type === 'media' && <>
                <input type="hidden" name="kind" value={mediaFile.kind} />
                <input type="hidden" name="uploadId" value={mediaFile.id} />
              </>}
              {fields[type].filter(field => type !== 'media' || (
                field.name !== 'kind' && field.name !== 'uploadId' &&
                (item || field.name === 'altText' || field.name === 'credit')
              )).map(field => (
                <div key={field.name} className="space-y-1.5">
                  <label htmlFor={'support-' + field.name} className="text-xs font-semibold text-foreground">{field.label}{field.optional && ' (tùy chọn)'}</label>
                  {field.options ? (
                    <select
                      id={'support-' + field.name}
                      name={field.name}
                      required={!field.optional}
                      defaultValue={item?.data[field.name] ?? field.initial ?? ''}
                      className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="" disabled={!field.optional}>
                        Chọn giá trị
                      </option>
                      {Object.entries(field.options).map(([value, title]) => (
                        <option key={value} value={value}>
                          {title}
                        </option>
                      ))}
                    </select>
                  ) : field.kind === 'textarea' ? (
                    <textarea
                      id={'support-' + field.name}
                      name={field.name}
                      maxLength={field.max}
                      rows={3}
                      defaultValue={item?.data[field.name]}
                      className="w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  ) : (
                    <input
                      id={'support-' + field.name}
                      name={field.name}
                      type={field.kind ?? 'text'}
                      required={!field.optional}
                      maxLength={field.max}
                      pattern={field.pattern}
                      min={field.kind === 'number' ? 0 : undefined}
                      max={field.kind === 'number' ? 2147483647 : undefined}
                      defaultValue={item?.data[field.name] ?? field.initial}
                      className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary read-only:bg-muted"
                    />
                  )}
                </div>
              ))}
            </div>

            {item?.status !== 'ARCHIVED' && (
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={conflict || pending}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50"
                >
                  <Save className="size-3.5" />
                  {item ? 'Lưu bản nháp' : 'Tạo bản nháp'}
                </button>
              </div>
            )}
          </Card>
        </fieldset>
      </form>

      {error && (
        <p
          role="alert"
          aria-label="Lỗi quản trị"
          className="form-error rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-semibold text-destructive"
        >
          {error}
        </p>
      )}

      {notice && (
        <p
          role="status"
          className="form-success rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400"
        >
          {notice}
        </p>
      )}

      {conflict && (
        <button
          type="button"
          className="cms-secondary inline-flex h-8 items-center gap-1.5 rounded-lg border border-destructive/40 bg-card px-3 text-xs font-semibold text-destructive hover:bg-muted"
          disabled={pending}
          onClick={() =>
            void execute(
              async () => accept(await cms<Content>(path)),
              'Đã tải phiên bản mới nhất.',
            )
          }
        >
          <RotateCcw className="size-3.5" />
          Bỏ nội dung đang nhập và tải phiên bản mới
        </button>
      )}

      {item && (
        <>
          <Card aria-label="Thao tác công bố" className="p-5 sm:p-6 space-y-4">
            <h2 className="text-base font-bold text-foreground">Trạng thái công bố</h2>
            {dirty && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Lưu bản nháp trước khi đổi trạng thái hoặc khôi phục phiên bản.
              </p>
            )}
            <div className="cms-actions flex flex-wrap items-center gap-2">
              {(item.status === 'ARCHIVED'
                ? (['restore'] as const)
                : (['publish', 'archive'] as const)
              ).map(action => (
                <button
                  type="button"
                  key={action}
                  className="cms-secondary inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                  disabled={
                    blocked || (action === 'publish' && item.publishedVersion === item.editVersion)
                  }
                  onClick={() => {
                    setConfirmation(action);
                    setReason('');
                  }}
                >
                  {action === 'publish' ? (
                    <Globe className="size-3.5" />
                  ) : action === 'archive' ? (
                    <Archive className="size-3.5" />
                  ) : (
                    <RotateCcw className="size-3.5" />
                  )}
                  {transitions[action]}
                </button>
              ))}
            </div>

            {confirmation && (
              <form
                className="cms-confirm space-y-3 rounded-xl border border-border bg-muted/30 p-4"
                onSubmit={event => {
                  event.preventDefault();
                  if (!conflict) void transition(confirmation);
                }}
              >
                {confirmation === 'archive' && (
                  <div className="space-y-1.5">
                    <label htmlFor="support-archive-reason" className="text-xs font-semibold text-foreground">Lý do lưu trữ</label>
                    <textarea id="support-archive-reason"
                      required
                      maxLength={500}
                      value={reason}
                      onChange={event => setReason(event.target.value)}
                      rows={2}
                      className="w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                )}
                <div className="cms-actions flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={pending || conflict || (confirmation === 'archive' && !reason.trim())}
                    className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    Xác nhận {transitions[confirmation].toLowerCase()}
                  </button>
                  <button
                    type="button"
                    className="cms-secondary inline-flex h-8 items-center rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted"
                    disabled={pending}
                    onClick={() => setConfirmation(undefined)}
                  >
                    Hủy
                  </button>
                </div>
              </form>
            )}
          </Card>

          <Card className="p-5 sm:p-6">
            <RevisionPanel
              contentType={type}
              id={item.id}
              current={item.editVersion}
              disabled={blocked}
              restore={(version, explanation) =>
                execute(async () => {
                  const body = { version, reason: explanation };
                  await cms(revisionPath(type, item.id) + '/restore', {
                    method: 'POST',
                    body,
                    match: loaded?.etag,
                    key: keyFor('revision', body),
                  });
                  accept(await cms<Content>(path));
                }, 'Đã khôi phục thành bản nháp.')
              }
            />
          </Card>

          <Card className="p-5 sm:p-6">
            <AuditPanel key={item.editVersion} id={item.id} contentType={type} />
          </Card>
        </>
      )}
    </div>
  );
}
