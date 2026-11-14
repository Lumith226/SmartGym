'use client';

import { useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { cms, errorMessage } from './cms';
import { MediaUpload } from './media-upload';
import { supportApi } from './support-types';

type NewMedia = {
  id: string;
  contentType: 'media';
  data: {
    uploadId: string;
    kind: 'IMAGE' | 'VIDEO';
    altText: string;
    rightsStatus: 'APPROVED';
  };
};

export function AddExerciseMedia({ disabled, onAdded }: {
  disabled: boolean;
  onAdded: (id: string, description: string, kind: 'IMAGE' | 'VIDEO') => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<NewMedia | null>(null);
  const busy = useRef(false);

  function changeOpen(next: boolean) {
    if (busy.current) return;
    if (next) {
      request.current = null;
      setError('');
    }
    setOpen(next);
  }

  async function attach(uploadId: string, kind: 'IMAGE' | 'VIDEO', filename: string) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    const altText = filename.replace(/\.[^.]+$/, '').trim().slice(0, 240) ||
      (kind === 'IMAGE' ? 'Ảnh minh họa' : 'Video minh họa');
    if (request.current?.data.uploadId !== uploadId) {
      request.current = {
        id: 'media_' + uploadId.replace(/^upload_/, ''),
        contentType: 'media',
        data: { uploadId, kind, altText, rightsStatus: 'APPROVED' },
      };
    }
    const body = request.current;
    try {
      const { etag } = await cms(supportApi('media'), { method: 'POST', body, key: body.id + '.create' });
      if (!etag) throw new Error('Missing ETag');
      await cms(supportApi('media', body.id) + '/publish', { method: 'POST', match: etag, key: body.id + '.publish' });
      onAdded(body.id, body.data.altText, kind);
      setOpen(false);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled}>
          <UploadCloud aria-hidden="true" className="size-4" /> Gắn ảnh hoặc video
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto" onChange={event => event.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Thêm ảnh hoặc video</DialogTitle>
          <DialogDescription>Tệp được gắn vào form. Lưu bản nháp bài tập để giữ tệp đã gắn.</DialogDescription>
        </DialogHeader>
        <MediaUpload compact disabled={pending} attach={attach} attachLabel={pending ? 'Đang gắn tệp…' : 'Gắn vào bài tập'} />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
