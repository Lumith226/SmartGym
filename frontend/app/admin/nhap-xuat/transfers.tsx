'use client';

import * as React from 'react';
import {
  UploadCloud,
  Download,
  CheckCircle2,
  FileCheck,
  ShieldCheck,
  RefreshCw,
  FolderOpen,
} from 'lucide-react';
import { CmsError, cms, errorMessage } from '../cms';
import { Card } from '../../../components/ui/card';
import { cn } from '../../../lib/utils';
import { toast } from '../../../lib/toast';

type Job = {
  id: string;
  sourceRevision: string;
  status:
    | 'QUEUED'
    | 'VALIDATING'
    | 'READY'
    | 'REJECTED'
    | 'APPLYING'
    | 'APPLIED'
    | 'FAILED';
  acceptedCount: number;
  errorCount: number;
  report: { sourceRef: string; code: string; message: string }[];
};
const statuses: Record<Job['status'], string> = {
  QUEUED: 'Đang chờ',
  VALIDATING: 'Đang kiểm tra',
  READY: 'Sẵn sàng',
  REJECTED: 'Bị từ chối',
  APPLYING: 'Đang áp dụng',
  APPLIED: 'Đã áp dụng',
  FAILED: 'Thất bại',
};
const revisionPattern = '[A-Za-z0-9._\\-]{1,120}';
type Loaded = { data: Job; etag: string | null };

export function CatalogTransfers() {
  const [job, setJob] = React.useState<Loaded>();
  const [pending, setPending] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const [stale, setStale] = React.useState(false);
  const [error, setError] = React.useState('');
  const [checksum, setChecksum] = React.useState('');
  const active = React.useRef(false);
  const last = React.useRef<{ fingerprint: string; key: string } | null>(null);

  function keyFor(fingerprint: string) {
    if (last.current?.fingerprint !== fingerprint)
      last.current = { fingerprint, key: crypto.randomUUID() };
    return last.current.key;
  }

  async function execute(action: () => Promise<void>) {
    if (active.current) return;
    active.current = true;
    setPending(true);
    setError('');
    try {
      await action();
    } catch (failure) {
      if (
        failure instanceof CmsError &&
        (failure.status === 412 || failure.code === 'IMPORT_BASE_CHANGED')
      )
        setStale(true);
      const msg = errorMessage(failure);
      setError(msg);
      toast.error('Lỗi chuyển giao dữ liệu', msg);
    } finally {
      active.current = false;
      setPending(false);
    }
  }

  function load(value: Loaded) {
    setJob(value);
    setConfirm(false);
    setStale(false);
  }

  function inspect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const body = {
      sourceKey: 'SMARTGYM_KB',
      sourceRevision: String(values.get('revision')),
      manifestSha256: String(values.get('sha')),
    };
    void execute(async () => {
      const result = await cms<Job>('/catalog-imports', {
        method: 'POST',
        body,
        key: keyFor(JSON.stringify(body)),
      });
      load(result);
    });
  }

  function readJob(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = String(new FormData(event.currentTarget).get('jobId'));
    void execute(async () => load(await cms<Job>('/catalog-imports/' + encodeURIComponent(id))));
  }

  function apply() {
    if (!job?.etag || stale || job.data.status !== 'READY') return;
    const {
      data: { id },
      etag,
    } = job;
    void execute(async () =>
      load(
        await cms<Job>('/catalog-imports/' + id + '/apply', {
          method: 'POST',
          match: etag,
          key: keyFor(id + etag),
          body: { mode: 'DRAFT_ONLY' },
        }),
      ),
    );
  }

  function download(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const revision = String(new FormData(event.currentTarget).get('revision'));
    setChecksum('');
    void execute(async () => {
      const { data } = await cms<{ sha256: string }>(
        '/catalog-exports/' + encodeURIComponent(revision),
      );
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = 'smartgym-' + revision + '.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setChecksum(data.sha256);
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <p
          className="form-error rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-xs font-semibold text-destructive"
          role="alert"
          aria-label="Lỗi nhập xuất"
        >
          {error}
        </p>
      )}

      {/* Grid: Nhập KB + Xuất KB */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Section 1: Nhập gói tri thức */}
        <Card className="p-5 sm:p-6 space-y-5">
          <div>
            <div className="flex items-center gap-2">
              <UploadCloud className="size-5 text-primary" />
              <h2 className="text-base font-bold text-foreground">Kiểm tra gói đã đăng ký</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Nhập phiên bản và SHA-256 canonical do người vận hành cung cấp.
            </p>
          </div>

          <form method="post" className="cms-actions space-y-4" onSubmit={inspect}>
            <div className="space-y-1.5">
              <label htmlFor="cms-package-version" className="text-xs font-semibold text-foreground">Phiên bản gói</label>
              <input id="cms-package-version"
                name="revision"
                required
                maxLength={120}
                pattern={revisionPattern}
                placeholder="Ví dụ: gym_catalog_2026_v1..."
                className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="cms-manifest-sha" className="text-xs font-semibold text-foreground">SHA-256 manifest</label>
              <input id="cms-manifest-sha"
                name="sha"
                required
                maxLength={64}
                pattern="[a-f0-9]{64}"
                placeholder="64 ký tự hex..."
                className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <button
              disabled={pending}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50"
            >
              {pending ? (
                <>
                  <RefreshCw className="size-3.5 animate-spin" />
                  Đang xử lý…
                </>
              ) : (
                <>
                  <FileCheck className="size-3.5" />
                  Kiểm tra gói KB
                </>
              )}
            </button>
          </form>

          {/* Mở báo cáo theo Job ID */}
          <div className="border-t border-border/70 pt-4">
            <form method="post" className="cms-actions space-y-3" onSubmit={readJob}>
              <div className="space-y-1.5">
                <label htmlFor="cms-import-id" className="text-xs font-semibold text-foreground">Mã lượt nhập</label>
                <div className="flex gap-2">
                  <input id="cms-import-id"
                    name="jobId"
                    required
                    maxLength={80}
                    pattern="[a-z][a-z0-9_]{0,79}"
                    placeholder="Mã job kiểm tra..."
                    className="h-9 flex-1 rounded-lg border border-border bg-background px-3 font-mono text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    disabled={pending}
                    className="cms-secondary inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted"
                  >
                    <FolderOpen className="size-3.5" />
                    Mở báo cáo
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Báo cáo kết quả kiểm tra Job */}
          {job && (
            <Card aria-label="Báo cáo nhập KB" className="p-4 space-y-3 bg-muted/20 border-primary/30">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Báo cáo nhập KB
                </h3>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[11px] font-bold',
                    job.data.status === 'READY'
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : job.data.status === 'REJECTED'
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                  )}
                >
                  {statuses[job.data.status]}
                </span>
              </div>

              <div className="text-xs space-y-1 text-muted-foreground">
                <p role="status" className="font-semibold text-foreground">
                  {statuses[job.data.status]} · {job.data.acceptedCount} bản ghi đạt ·{' '}
                  {job.data.errorCount} lỗi
                </p>
                <p className="font-mono">
                  {job.data.sourceRevision} · <code>{job.data.id}</code>
                </p>
              </div>

              {!!job.data.report.length && (
                <ul className="space-y-1 max-h-40 overflow-y-auto rounded-lg bg-background p-2 text-xs font-mono">
                  {job.data.report.map((row, index) => (
                    <li key={index} className="text-destructive">
                      {row.sourceRef} · {row.message} ({row.code})
                    </li>
                  ))}
                </ul>
              )}

              {job.data.status === 'READY' &&
                (confirm ? (
                  <div className="cms-confirm space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
                    <p className="text-xs text-foreground">
                      Các bản ghi sẽ được ghi vào bản nháp. Phiên bản công khai được giữ nguyên.
                    </p>
                    <div className="cms-actions flex items-center gap-2">
                      <button
                        type="button"
                        disabled={pending || stale}
                        onClick={apply}
                        className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                      >
                        Xác nhận áp dụng
                      </button>
                      <button
                        type="button"
                        className="cms-secondary inline-flex h-8 items-center rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted"
                        disabled={pending}
                        onClick={() => setConfirm(false)}
                      >
                        Hủy
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={pending || stale}
                    onClick={() => setConfirm(true)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
                  >
                    <CheckCircle2 className="size-3.5" />
                    Áp dụng vào bản nháp
                  </button>
                ))}
            </Card>
          )}
        </Card>

        {/* Section 2: Xuất gói tri thức */}
        <Card className="p-5 sm:p-6 space-y-5 self-start">
          <div>
            <div className="flex items-center gap-2">
              <Download className="size-5 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-base font-bold text-foreground">Xuất nội dung công khai</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Kết xuất toàn bộ bài tập và dữ liệu đã công bố thành gói JSON chuẩn hóa kèm mã băm SHA-256.
            </p>
          </div>

          <form method="post" className="cms-actions space-y-4" onSubmit={download}>
            <div className="space-y-1.5">
              <label htmlFor="cms-export-version" className="text-xs font-semibold text-foreground">Phiên bản công bố</label>
              <input id="cms-export-version"
                name="revision"
                required
                maxLength={120}
                pattern={revisionPattern}
                placeholder="Ví dụ: export_release_2026_q4..."
                className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <button
              disabled={pending}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-700 transition-all disabled:opacity-50"
            >
              <Download className="size-3.5" />
              Tải bản xuất JSON
            </button>
          </form>

          {checksum && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 space-y-1 text-xs text-emerald-700 dark:text-emerald-400">
              <span className="flex items-center gap-1.5 font-bold">
                <ShieldCheck className="size-4" />
                Mã băm SHA-256 đã xác minh
              </span>
              <p role="status" className="font-mono break-all text-[11px]">
                SHA-256 bản xuất <code>{checksum}</code>
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
