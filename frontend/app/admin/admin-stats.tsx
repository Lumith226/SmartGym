'use client';

import { Archive, Check, Dumbbell, Layers, PencilLine, Wrench } from 'lucide-react';
import { cn } from '../../lib/utils';
import { CmsStat } from './cms-design';
import { LoadError, useCmsPage } from './cms-request';

export function AdminStatsCards({ groups, equipment, overview = false }: { groups?: number; equipment?: number; overview?: boolean }) {
  const { data, error, retry } = useCmsPage<{ total: number; published: number; drafts: number; archived: number; unpublishedChanges: number }>('/stats');
  return <div className="space-y-2">
    <div className={cn('grid grid-cols-2 gap-3', overview ? 'xl:grid-cols-6 md:grid-cols-3' : 'md:grid-cols-4')}>
      <CmsStat label="Tổng bài tập" value={data?.total ?? '—'} icon={<Dumbbell />} href={overview ? '/admin/bai-tap' : undefined} />
      {overview && <CmsStat label="Đang công khai" value={data?.published ?? '—'} icon={<Check />} tone="green" href="/admin/bai-tap?status=PUBLISHED" />}
      <CmsStat label="Bản nháp" value={data?.drafts ?? '—'} icon={<PencilLine />} tone="amber" href={overview ? '/admin/bai-tap?status=DRAFT' : undefined} />
      {overview && <CmsStat label="Đã gỡ" value={data?.archived ?? '—'} icon={<Archive />} tone="purple" href="/admin/bai-tap?status=ARCHIVED" />}
      <CmsStat label="Nhóm cơ công khai" value={groups ?? '—'} icon={<Layers />} tone="purple" href="/admin/noi-dung/muscle-group" />
      <CmsStat label="Dụng cụ công khai" value={equipment ?? '—'} icon={<Wrench />} tone="green" href="/admin/noi-dung/equipment" />
    </div>
    {error ? <LoadError error={error} retry={retry} /> : !data && <p role="status" className="sr-only">Đang tải thống kê kho bài tập…</p>}
  </div>;
}
