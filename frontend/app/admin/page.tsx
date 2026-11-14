import Link from 'next/link';
import { ArrowRight, Image, Layers, Plus, Wrench } from 'lucide-react';
import { ActivitySummary, RecentActivityList } from './audit-panel';
import { AdminStatsCards } from './admin-stats';
import { ExerciseList } from './exercise-list';
import { CmsHeading, cmsAction, cmsPanel } from './cms-design';
import { catalog, type TaxonomyItem } from '../catalog';

const shortcuts = [
  { href: '/admin/bai-tap/moi', name: 'Thêm bài tập', icon: Plus },
  { href: '/admin/noi-dung/muscle-group', name: 'Quản lý nhóm cơ', icon: Layers },
  { href: '/admin/noi-dung/equipment', name: 'Quản lý dụng cụ', icon: Wrench },
  { href: '/admin/noi-dung/media', name: 'Mở kho media', icon: Image },
];

export default async function Admin() {
  const [groups, equipment] = await Promise.all([
    catalog('/api/v1/muscle-groups').then(result => result.items as TaxonomyItem[]).catch(() => undefined),
    catalog('/api/v1/equipment').then(result => result.items as TaxonomyItem[]).catch(() => undefined),
  ]);
  const muscleLabels = Object.fromEntries((groups ?? []).map(group => [group.id, group.labelVi]));

  return <section className="space-y-5 pb-8">
    <CmsHeading title="Tổng quan nội dung" description="Theo dõi thư viện bài tập và các thay đổi trong SmartGym."
      action={<Link href="/admin/bai-tap/moi" className={cmsAction}><Plus className="size-4" /> Thêm bài tập</Link>} />
    <AdminStatsCards overview groups={groups?.length} equipment={equipment?.length} />
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.1fr_1fr_.8fr]">
      <section className={cmsPanel + ' min-w-0 p-4'}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Hoạt động gần đây</h2>
          <Link href="/admin/nhat-ky" className="text-xs font-semibold text-primary hover:underline">Xem nhật ký</Link>
        </div>
        <RecentActivityList />
      </section>
      <section className={cmsPanel + ' min-w-0 p-4'}>
        <h2 className="mb-3 font-semibold">Thống kê hoạt động</h2>
        <ActivitySummary />
      </section>
      <section className={cmsPanel + ' p-4'}>
        <h2 className="mb-3 font-semibold">Thao tác nhanh</h2>
        <div className="grid gap-2">
          {shortcuts.map(({ href, name, icon: Icon }) => <Link key={href} href={href} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:border-primary/50 hover:text-primary">
            <Icon aria-hidden="true" className="size-4 text-primary" /> {name}<ArrowRight aria-hidden="true" className="ml-auto size-3.5" />
          </Link>)}
        </div>
      </section>
    </div>
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Bài tập cập nhật gần đây</h2>
        <Link href="/admin/bai-tap" className="text-sm font-semibold text-primary hover:underline">Xem tất cả</Link>
      </div>
      <ExerciseList recent muscleLabels={muscleLabels} />
    </section>
  </section>;
}
