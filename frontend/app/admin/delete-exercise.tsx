'use client';

import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { CmsError, cms, errorMessage, exercisePath, type Exercise } from './cms';

export function DeleteArchivedExercise({ exercise, onDeleted, showLabel = false, disabled = false, expectedVersion }: {
  exercise: Exercise;
  onDeleted: (name: string) => void;
  showLabel?: boolean;
  disabled?: boolean;
  expectedVersion?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const attempt = useRef<{ match: string; key: string } | undefined>(undefined);
  const busy = useRef(false);

  async function remove() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    try {
      if (!attempt.current) {
        const { data, etag } = await cms<Exercise>(exercisePath(exercise.id));
        if (data.status !== 'ARCHIVED') throw new CmsError(409, 'EXERCISE_NOT_ARCHIVED');
        if (!etag) throw new Error('Missing ETag');
        if (expectedVersion && etag !== expectedVersion) throw new CmsError(412, 'VERSION_MISMATCH');
        attempt.current = { match: etag, key: crypto.randomUUID() };
      }
      await cms(exercisePath(exercise.id), { method: 'DELETE', ...attempt.current });
      setOpen(false);
      onDeleted(exercise.nameVi);
    } catch (failure) {
      if (failure instanceof CmsError && failure.status === 412) {
        attempt.current = undefined;
        setError('Bài tập vừa thay đổi. Hãy kiểm tra lại trước khi xác nhận xóa.');
      } else {
        setError(errorMessage(failure));
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return <Dialog open={open} onOpenChange={next => {
    if (busy.current) return;
    if (next) setError('');
    setOpen(next);
  }}>
    <DialogTrigger asChild>
      <button type="button" aria-label={showLabel ? undefined : 'Xóa ' + exercise.nameVi} title="Xóa bài đã gỡ" disabled={disabled}
        className={showLabel
          ? 'inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-4 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50'
          : 'inline-grid size-8 place-items-center rounded-md align-middle text-destructive hover:bg-destructive/10 focus-visible:outline-2 focus-visible:outline-destructive'}>
        <Trash2 aria-hidden="true" className="size-4" />
        {showLabel && 'Xóa bài tập'}
      </button>
    </DialogTrigger>
    <DialogContent className="cms-surface rounded-xl text-foreground">
      <DialogTitle>Xóa bài tập?</DialogTitle>
      <DialogDescription>
        <strong>{exercise.nameVi}</strong> sẽ biến mất khỏi kho quản trị và không thể khôi phục. Nhật ký và lịch sử phiên bản vẫn được lưu.
      </DialogDescription>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>Hủy</Button>
        <Button type="button" className="bg-red-700 text-white hover:bg-red-800" disabled={pending} onClick={() => void remove()}>
          {pending ? 'Đang xóa…' : 'Xóa bài tập'}
        </Button>
      </div>
    </DialogContent>
  </Dialog>;
}
