'use client';

import * as React from 'react';
import {
  UploadCloud,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { CmsError, cms, errorMessage } from './cms';
import { Card } from '../../components/ui/card';

type Upload = {
  uploadId: string;
  status: 'RESERVED' | 'VERIFYING' | 'READY' | 'REJECTED' | 'EXPIRED';
  mime: string;
  errorCode?: string;
};
type Grant = { uploadId: string; putUrl: string; requiredHeaders: Record<string, string> };
const mimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'];
const pathFor = (id: string) => '/media-uploads/' + encodeURIComponent(id);

function sendFile(
  grant: Grant,
  file: File,
  signal: AbortSignal,
  onProgress: (value: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const request = new XMLHttpRequest();
    request.open('PUT', grant.putUrl);
    request.timeout = 120000;
    for (const [name, value] of Object.entries(grant.requiredHeaders))
      request.setRequestHeader(name, value);
    const cancel = () => request.abort();
    signal.addEventListener('abort', cancel, { once: true });
    request.onloadend = () => signal.removeEventListener('abort', cancel);
    request.upload.onprogress = event => {
      if (event.lengthComputable) onProgress(Math.floor((event.loaded * 100) / event.total));
    };
    const fail = () => reject(new Error('Upload failed'));
    request.onload = () =>
      (request.status >= 200 && request.status < 300) || request.status === 412
        ? resolve()
        : fail();
    request.onerror = request.ontimeout = request.onabort = fail;
    request.send(file);
  });
}

export function MediaUpload({
  current,
  disabled,
  attach,
  attachLabel = 'Dùng tệp này',
  compact = false,
}: {
  current?: string;
  disabled: boolean;
  attach: (id: string, kind: 'IMAGE' | 'VIDEO', filename: string) => void;
  attachLabel?: string;
  compact?: boolean;
}) {
  const [phase, setPhase] = React.useState('');
  const [percent, setPercent] = React.useState<number>();
  const [upload, setUpload] = React.useState<Upload>();
  const [error, setError] = React.useState('');
  const [preview, setPreview] = React.useState<{ id: string; url: string; expiresAt: string }>();
  const filename = React.useRef('');
  const active = React.useRef<AbortController | null>(null);
  const reservation = React.useRef<{ file: File; key: string; completion: string } | null>(null);

  React.useEffect(() => () => active.current?.abort(), []);
  React.useEffect(() => {
    if (!preview) return;
    const timer = setTimeout(
      () => setPreview(undefined),
      Math.max(0, new Date(preview.expiresAt).getTime() - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [preview]);

  async function run(label: string, action: (signal: AbortSignal) => Promise<void>) {
    if (active.current || disabled) return;
    const controller = new AbortController();
    active.current = controller;
    setError('');
    setPhase(label);
    try {
      await action(controller.signal);
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof CmsError
            ? errorMessage(failure)
            : 'Chưa tải được tệp. Kiểm tra kết nối hoặc thử lại.',
        );
    } finally {
      active.current = null;
      setPhase('');
      setPercent(undefined);
    }
  }

  function start(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    const file = new FormData(event.currentTarget).get('file');
    if (
      !(file instanceof File) ||
      !mimeTypes.includes(file.type) ||
      !file.size ||
      file.size > (file.type.startsWith('image/') ? 10 : 100) * 1024 * 1024
    ) {
      setError(
        'Chọn ảnh JPG, PNG hoặc WebP tối đa 10 MiB, hoặc video MP4/WebM tối đa 100 MiB.',
      );
      return;
    }
    filename.current = file.name;
    void run('Đang chuẩn bị tệp…', async signal => {
      setUpload(undefined);
      setPreview(undefined);
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      signal.throwIfAborted();
      const sha256 = Array.from(new Uint8Array(digest), value =>
        value.toString(16).padStart(2, '0'),
      ).join('');
      const previous = reservation.current;
      if (!previous || previous.file !== file)
        reservation.current = {
          file,
          key: crypto.randomUUID(),
          completion: crypto.randomUUID(),
        };
      const request = reservation.current!;
      const { data: grant } = await cms<Grant>('/media-uploads', {
        method: 'POST',
        signal,
        key: request.key,
        body: { mime: file.type, sizeBytes: file.size, sha256 },
      });
      setPhase('Đang tải tệp…');
      setPercent(0);
      await sendFile(grant, file, signal, setPercent);
      const path = pathFor(grant.uploadId);
      const { data: accepted } = await cms<Upload>(path + '/complete', {
        method: 'POST',
        signal,
        key: request.completion,
      });
      setPercent(undefined);
      setPhase('Đang kiểm tra tệp…');
      setUpload(accepted);
      for (let attempt = 0; attempt < 60; attempt++) {
        const { data } = await cms<Upload>(path, { signal });
        setUpload(data);
        if (data.status !== 'VERIFYING') {
          reservation.current = null;
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 1500));
        signal.throwIfAborted();
      }
    });
  }

  const id = upload?.status === 'READY' ? upload.uploadId : current;
  const blocked = disabled || !!phase;

  return (
    <Card aria-label="Tệp media riêng" className={compact ? 'space-y-3 border-0 bg-transparent p-0 shadow-none' : 'p-5 sm:p-6 space-y-4'}>
      <div>
        {!compact && <h2 className="text-base font-bold text-foreground">Tải và kiểm tra tệp</h2>}
        <p className="text-xs text-muted-foreground">
          Ảnh JPG, PNG, WebP tối đa 10 MiB. Video MP4, WebM tối đa 100 MiB.
        </p>
      </div>

      <form method="post" className="cms-actions flex flex-wrap items-center gap-3" onSubmit={start}>
        <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
          <span>Tệp ảnh hoặc video</span>
          <input
            type="file"
            name="file"
            required
            accept={mimeTypes.join(',')}
            disabled={blocked}
            className="file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary hover:file:bg-primary/20 text-xs text-muted-foreground cursor-pointer"
          />
        </label>
        <button
          disabled={blocked}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50 self-end"
        >
          <UploadCloud className="size-3.5" />
          Tải tệp lên
        </button>
      </form>

      {phase && (
        <div className="flex items-center gap-2 rounded-xl bg-primary/10 p-3 text-xs font-semibold text-primary" role="status">
          <RefreshCw className="size-3.5 animate-spin" />
          <span>{phase}</span>
        </div>
      )}

      {percent !== undefined && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Tiến độ tải lên</span>
            <span>{percent}%</span>
          </div>
          <progress
            aria-label="Tiến độ tải media"
            max={100}
            value={percent}
            className="h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary"
          />
        </div>
      )}

      {error && (
        <p role="alert" className="form-error rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-semibold text-destructive">
          {error}
        </p>
      )}

      {upload?.status === 'VERIFYING' && !phase && (
        <div className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
          <span>Tệp vẫn đang kiểm tra.</span>
          <button
            type="button"
            disabled={disabled}
            className="cms-secondary inline-flex h-7 items-center rounded-md border border-border bg-card px-2.5 text-xs font-semibold text-foreground hover:bg-muted"
            onClick={() =>
              void run('Đang tải trạng thái…', async signal =>
                setUpload((await cms<Upload>(pathFor(upload.uploadId), { signal })).data),
              )
            }
          >
            Kiểm tra trạng thái
          </button>
        </div>
      )}

      {upload?.status === 'READY' && (
        <div className="cms-actions flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <p role="status" className="flex items-center gap-1.5">
            <CheckCircle2 className="size-4" />
            Tệp sẵn sàng gắn vào bản nháp.
          </p>
          <button
            type="button"
            disabled={blocked || current === upload.uploadId}
            onClick={() =>
              attach(
                upload.uploadId,
                upload.mime.startsWith('image/') ? 'IMAGE' : 'VIDEO',
                filename.current,
              )
            }
            className="inline-flex h-7 items-center rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
          >
            {attachLabel}
          </button>
        </div>
      )}

      {upload?.status === 'REJECTED' && (
        <p role="alert" className="form-error rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-semibold text-destructive">
          Tệp không đạt kiểm tra: {upload.errorCode}
        </p>
      )}

      {!compact && id && (
        <div className="pt-2 border-t border-border/70 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="cms-secondary inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted"
            disabled={blocked}
            onClick={() =>
              void run('Đang tạo link xem trước…', async signal => {
                setPreview(undefined);
                const { data } = await cms<{ url: string; expiresAt: string }>(
                  pathFor(id) + '/preview',
                  { signal },
                );
                setPreview({ id, ...data });
              })
            }
          >
            <ExternalLink className="size-3.5" />
            Tạo liên kết xem trước
          </button>
          {preview && preview.id === id && (
            <p className="text-xs text-muted-foreground">
              <a
                href={preview.url}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-primary underline"
              >
                Mở bản xem trước riêng
              </a>{' '}
              · Liên kết hiệu lực tối đa 60 giây.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
