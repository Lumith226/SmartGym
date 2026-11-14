'use client';

import { useRef, useState } from 'react';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog';
import { cms, CmsError, errorMessage, exercisePath, type Exercise } from './cms';

export type ListAction = 'publish' | 'unpublish' | 'archive' | 'restore' | 'delete';
export type ActionRequest = { action: ListAction; exercises: Exercise[] };

export const actionLabels = { publish: 'Công bố', unpublish: 'Gỡ công bố', archive: 'Lưu trữ bản nháp', restore: 'Khôi phục bản nháp', delete: 'Xóa' };
const descriptions = {
  publish: 'Công bố bản nháp đã lưu lên thư viện. Với bài đang công khai, thao tác này áp dụng bản nháp mới.',
  unpublish: 'Gỡ bài khỏi thư viện công khai và chuyển sang trạng thái Đã gỡ.',
  archive: 'Chuyển bản nháp sang trạng thái Đã gỡ. Sau đó bạn có thể khôi phục hoặc xóa bài trong Kho bài tập.',
  restore: 'Chuyển bài đã gỡ về bản nháp để có thể chỉnh sửa hoặc công bố lại.',
  delete: 'Các bài đã gỡ trong danh sách này sẽ bị xóa khỏi kho và không thể khôi phục trong CMS.',
};

export function canApply(action: ListAction, exercise: Exercise) {
  if (action === 'restore' || action === 'delete') return exercise.status === 'ARCHIVED';
  if (action === 'unpublish') return exercise.status === 'PUBLISHED';
  if (action === 'archive') return exercise.status === 'DRAFT';
  return exercise.status === 'DRAFT' ||
    exercise.status === 'PUBLISHED' && exercise.draftVersion > (exercise.publishedVersion ?? 0);
}

export type ActionResult = { succeeded: number; failed: { exercise: Exercise; message: string }[] };

export function ExerciseListActionDialog({ request, onClose, onComplete }: {
  request: ActionRequest;
  onClose: () => void;
  onComplete: (result: ActionResult) => void;
}) {
  const { action, exercises } = request;
  const label = actionLabels[action];
  const needsReason = action === 'unpublish' || action === 'archive';
  const [reason, setReason] = useState('');
  const [progress, setProgress] = useState<number>();
  const running = useRef(false);

  async function apply() {
    if (running.current || needsReason && !reason.trim()) return;
    running.current = true;
    setProgress(0);
    const result: ActionResult = { succeeded: 0, failed: [] };
    const body = needsReason ? { reason: reason.trim() } : undefined;
    const endpoint = action === 'archive' ? 'unpublish' : action;
    for (const [index, exercise] of exercises.entries()) {
      try {
        const path = exercisePath(exercise.id);
        const { data, etag } = await cms<Exercise>(path);
        if (!canApply(action, data) || data.status !== exercise.status || data.draftVersion !== exercise.draftVersion ||
            data.publishedVersion !== exercise.publishedVersion || data.updatedAt !== exercise.updatedAt)
          throw new CmsError(412, 'VERSION_MISMATCH');
        if (!etag) throw new Error('Missing ETag');
        const command = { match: etag, key: crypto.randomUUID() };
        if (action === 'delete') await cms(path, { ...command, method: 'DELETE' });
        else await cms(path + '/' + endpoint, { ...command, method: 'POST', body });
        result.succeeded++;
      } catch (error) {
        result.failed.push({ exercise, message: error instanceof CmsError && error.status === 412
          ? 'Bài vừa thay đổi. Kiểm tra lại trước khi thao tác.' : errorMessage(error) });
      }
      setProgress(index + 1);
    }
    onComplete(result);
  }

  return <Dialog open onOpenChange={open => { if (!open && !running.current) onClose(); }}>
    <DialogContent className="cms-surface rounded-xl text-foreground">
      <DialogTitle>{label} {exercises.length} bài tập?</DialogTitle>
      <DialogDescription>{descriptions[action]}</DialogDescription>
      <ul className="max-h-40 list-disc space-y-1 overflow-auto pl-5 text-sm">
        {exercises.map(item => <li key={item.id}>{item.nameVi}</li>)}
      </ul>
      {needsReason && <label className="grid gap-1 text-sm font-medium">
        {action === 'archive' ? 'Lý do lưu trữ' : 'Lý do gỡ công bố'}
        <textarea rows={2} maxLength={500} value={reason} disabled={progress !== undefined}
          onChange={event => setReason(event.target.value)} className="rounded-md border border-border bg-background p-2" />
      </label>}
      {progress !== undefined && <p role="status" className="text-sm">Đã xử lý {progress}/{exercises.length} bài…</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" disabled={progress !== undefined} onClick={onClose}>Hủy</Button>
        <Button type="button" className={needsReason || action === 'delete' ? 'bg-destructive text-white hover:bg-destructive/90' : undefined}
          disabled={progress !== undefined || needsReason && !reason.trim()}
          onClick={() => void apply()}>Xác nhận {label.toLocaleLowerCase('vi')}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
