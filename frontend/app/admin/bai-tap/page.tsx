import Link from 'next/link';
import { PlusCircle } from 'lucide-react';
import { CmsHeading, cmsAction } from '../cms-design';
import { AdminStatsCards } from '../admin-stats';
import { ExerciseList } from '../exercise-list';
import { catalog, type TaxonomyItem } from '../../catalog';

export default async function AdminExercises({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const read = (name: string) => (typeof params[name] === 'string' ? params[name] : undefined);
  const search = read('q')?.trim().slice(0, 100),
    status = ['DRAFT', 'PUBLISHED', 'ARCHIVED'].find(value => value === read('status')),
    sort = ['updated_desc', 'name_asc'].find(value => value === read('sort'));
  const requestedPage = read('page') ?? '';
  const page = /^[1-9][0-9]{0,8}$/.test(requestedPage) ? Number(requestedPage) : 1;
  const [groups, equipment] = await Promise.all([
    catalog('/api/v1/muscle-groups').then(data => data.items as TaxonomyItem[]).catch(() => undefined),
    catalog('/api/v1/equipment').then(data => data.items as TaxonomyItem[]).catch(() => undefined),
  ]);
  const muscleLabels = Object.fromEntries((groups ?? []).map(group => [group.id, group.labelVi]));

  return (
    <section className="space-y-6 w-full pb-8">
      <CmsHeading title="Kho bài tập" description="Quản lý bài tập, bản nháp và nội dung đang hiển thị trong thư viện."
        action={<Link href="/admin/bai-tap/moi" className={cmsAction}><PlusCircle className="size-4" /> Thêm bài tập</Link>} />
      <ExerciseList
        key={JSON.stringify([search, status, sort, page])}
        {...{ search, status, sort, page, muscleLabels }}
        stats={<AdminStatsCards groups={groups?.length} equipment={equipment?.length} />}
      />
    </section>
  );
}
