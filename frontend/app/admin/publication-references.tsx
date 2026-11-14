'use client';

import { useEffect, useState } from 'react';
import { File, ImageIcon, Video, X } from 'lucide-react';
import { cms } from './cms';
import { supportApi } from './support-types';
import { AddExerciseMedia } from './add-exercise-media';
import { type ExerciseImageRoles } from '../exercise-profile';

type Attachment = { altText?: string; kind?: 'IMAGE' | 'VIDEO' };
const attachmentIcons = { IMAGE: ImageIcon, VIDEO: Video };

export function MediaReferences({ initial, initialRoles, onChange }: {
  initial?: string[];
  initialRoles?: ExerciseImageRoles;
  onChange: () => void;
}) {
  const [selected, setSelected] = useState(initial ?? []);
  const [attachments, setAttachments] = useState<Record<string, Attachment>>({});

  useEffect(() => {
    if (!initial?.length) return;
    const controller = new AbortController();
    void Promise.allSettled(initial.map(async id => {
      const { data } = await cms<{ data: Attachment }>(supportApi('media', id), { signal: controller.signal });
      return [id, data.data] as const;
    })).then(results => {
      if (!controller.signal.aborted) {
        setAttachments(previous => ({
          ...Object.fromEntries(results.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])),
          ...previous,
        }));
      }
    });
    return () => controller.abort();
  }, [initial]);

  function remove(id: string) {
    setSelected(previous => previous.filter(value => value !== id));
    onChange();
  }

  const main = initialRoles?.main && selected.includes(initialRoles.main) ? initialRoles.main : '';
  const start = initialRoles?.start && selected.includes(initialRoles.start) ? initialRoles.start : '';
  const peak = start && initialRoles?.peak && selected.includes(initialRoles.peak) ? initialRoles.peak : '';
  const atLimit = selected.length >= 20;

  return <div className="space-y-3">
    <input type="hidden" name="mediaIds" value={selected.join('\n')} />
    <input type="hidden" name="image-role-main" value={main} />
    <input type="hidden" name="image-role-start" value={start} />
    <input type="hidden" name="image-role-peak" value={peak} />
    <AddExerciseMedia disabled={atLimit} onAdded={(id, altText, kind) => {
      setAttachments(previous => ({ ...previous, [id]: { altText, kind } }));
      setSelected(previous => previous.includes(id) ? previous : [...previous, id]);
      onChange();
    }} />
    {atLimit && <p className="text-xs text-muted-foreground">Đã gắn tối đa 20 tệp.</p>}
    {selected.length > 0 && <ul className="divide-y divide-border rounded-lg border border-border" aria-label="Tệp đã gắn">
      {selected.map(id => {
        const attachment = attachments[id];
        const name = attachment?.altText ?? id;
        const Icon = attachment?.kind ? attachmentIcons[attachment.kind] : File;
        return <li key={id} className="flex min-w-0 items-center gap-2 px-3 py-1.5">
          <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-sm" title={name}>{name}</span>
          <button type="button" aria-label={'Gỡ ' + name} onClick={() => remove(id)}
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-2 focus-visible:outline-primary">
            <X aria-hidden="true" className="size-4" />
          </button>
        </li>;
      })}
    </ul>}
  </div>;
}
