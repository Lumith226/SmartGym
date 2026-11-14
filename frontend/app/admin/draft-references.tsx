'use client';

import { useEffect, useState } from 'react';
import { CmsError, cms, errorMessage } from './cms';
import { supportApi } from './support-types';
import { imageRoleLabels, type ExerciseImageRoles } from '../exercise-profile';

type ReferenceData = {
  kind?: 'IMAGE' | 'VIDEO';
  altText?: string;
  credit?: string;
  uploadId?: string;
  rightsStatus?: string;
};

async function publishedMedia(id: string, signal: AbortSignal) {
  const { data: reference } = await cms<{ status: string; publishedVersion?: number }>(supportApi('media', id), { signal });
  if (reference.status !== 'PUBLISHED' || !reference.publishedVersion)
    throw new CmsError(422, 'MEDIA_NOT_APPROVED');
  const { data: revision } = await cms<{ data: { data: ReferenceData } }>(
    '/revisions/media/' + encodeURIComponent(id) + '/' + reference.publishedVersion, { signal });
  return revision.data.data;
}

function DraftMedia({ id }: { id: string }) {
  const [reference, setReference] = useState<ReferenceData>();
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    void publishedMedia(id, signal)
      .then(data => { if (!signal.aborted) setReference(data); })
      .catch(failure => { if (!signal.aborted) setError(errorMessage(failure)); });
    return () => controller.abort();
  }, [id, attempt]);

  if (error) return <div className="space-y-1 text-sm">
    <p role="alert">{id}: {error}</p>
    <button type="button" className="text-primary underline" onClick={() => { setError(''); setAttempt(value => value + 1); }}>
      Thử lại
    </button>
  </div>;
  if (!reference) return <p role="status" className="text-sm text-muted-foreground">Đang tải {id}…</p>;
  return <MediaPreview item={reference} />;
}

function MediaPreview({ item }: { item: ReferenceData }) {
  const [url, setUrl] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const label = item.altText || 'Minh họa bài tập';
  if (item.rightsStatus !== 'APPROVED' || !item.uploadId)
    return <p className="text-sm text-muted-foreground">{label} chưa đủ điều kiện để xem trước.</p>;
  const uploadId = item.uploadId;

  async function load() {
    setPending(true);
    setError('');
    setUrl('');
    try {
      const { data } = await cms<{ url: string }>('/media-uploads/' + encodeURIComponent(uploadId) + '/preview');
      setUrl(data.url);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
    }
  }

  return <figure className="overflow-hidden rounded-xl border border-border">
    {url && !error && (item.kind === 'VIDEO'
      ? <video src={url} aria-label={label} controls playsInline preload="metadata" className="w-full bg-black"
          onError={() => setError('Không tải được video. Hãy mở lại tệp.')} />
      : <img src={url} alt={label} referrerPolicy="no-referrer" className="max-h-96 w-full object-contain"
          onError={() => setError('Không tải được ảnh. Hãy mở lại tệp.')} />)}
    <figcaption className="space-y-2 p-3 text-sm">
      <p>{label}{item.credit && <> · Nguồn {item.credit}</>}</p>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <button type="button" disabled={pending} onClick={() => void load()} className="text-primary underline">
        {pending ? 'Đang tải…' : url || error ? 'Mở lại tệp' : item.kind === 'VIDEO' ? 'Mở video minh họa' : 'Mở ảnh minh họa'}
      </button>
    </figcaption>
  </figure>;
}

export function DraftMediaReferences({ ids, roles }: { ids?: string[]; roles?: ExerciseImageRoles }) {
  if (!ids?.length) return null;
  return <section className="space-y-3">
    <h2 className="text-lg font-bold">Ảnh và video minh họa</h2>
    <ul className="grid gap-3 sm:grid-cols-2">
      {ids.map(id => {
        const role = (Object.keys(imageRoleLabels) as (keyof ExerciseImageRoles)[]).find(key => roles?.[key] === id);
        return <li key={id}>{role && <p className="mb-1 text-sm font-medium">{imageRoleLabels[role]}</p>}<DraftMedia id={id} /></li>;
      })}
    </ul>
  </section>;
}
