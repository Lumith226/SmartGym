import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { PlusCircle, Search, Filter, ArrowLeft } from 'lucide-react';
import { identifier } from '../../cms';
import { SupportEditor, SupportList } from '../../support';
import { supportNames, supportPage, supportType } from '../../support-types';
import { CmsHeading, cmsAction, cmsFilter, cmsInput } from '../../cms-design';

export default async function ContentPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { type } = await params;
  if (type === 'exercise-variant') redirect('/admin/bai-tap');
  if (!supportType(type)) notFound();
  const query = await searchParams;
  const id = query.id;
  if (id !== undefined && (typeof id !== 'string' || !identifier.test(id))) notFound();

  if (id || query.tao === '1') {
    return (
      <section className="space-y-6">
        <div>
          <Link
            href={supportPage(type)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            Về danh sách {supportNames[type].toLowerCase()}
          </Link>
        </div>
        <SupportEditor key={id ?? 'new'} type={type} id={id} />
      </section>
    );
  }

  const search = typeof query.q === 'string' ? query.q.trim().slice(0, 100) : '';
  const status =
    typeof query.status === 'string' && ['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(query.status)
      ? query.status
      : '';
  const cursor = typeof query.cursor === 'string' ? query.cursor : undefined;

  const meta = {
    'muscle-group': { title: 'Nhóm cơ', description: 'Quản lý các nhóm cơ dùng để phân loại bài tập và hiển thị trên bản đồ cơ.' },
    equipment: { title: 'Dụng cụ', description: 'Quản lý các dụng cụ dùng trong thư viện bài tập.' },
    media: { title: 'Thư viện media', description: 'Quản lý ảnh và video minh họa cho bài tập.' },
  }[type];

  return <section className="space-y-5 pb-8">
    <CmsHeading {...meta} action={<Link href={supportPage(type) + '?tao=1'} className={cmsAction}>
      <PlusCircle className="size-4" />
      <span>{type === 'media' ? 'Tải lên media' : type === 'equipment' ? 'Thêm dụng cụ' : 'Thêm nhóm cơ'}</span>
    </Link>} />
    <SupportList key={JSON.stringify([type, search, status, cursor])} {...{ type, search, status, cursor }} filters={
      <form method="get" action={supportPage(type)} className={cmsFilter}>
        <label className="min-w-48 flex-1 space-y-1 text-sm">
          <span className="font-medium">Tìm {supportNames[type].toLowerCase()}</span>
          <span className="relative block">
            <Search aria-hidden="true" className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <input type="search" name="q" maxLength={100} defaultValue={search} placeholder="Nhập tên hoặc mã…" className={cmsInput + ' pl-9'} />
          </span>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Trạng thái</span>
          <select name="status" defaultValue={status} className={cmsInput}>
            <option value="">Tất cả trạng thái</option>
            <option value="DRAFT">Bản nháp</option>
            <option value="PUBLISHED">Đã công bố</option>
            <option value="ARCHIVED">Đã lưu trữ</option>
          </select>
        </label>
        <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer">
          <Filter className="size-3.5 text-primary" /> Lọc
        </button>
        {(search || status) && <Link href={supportPage(type)} className="py-2 text-xs font-mono text-primary hover:underline">Xóa bộ lọc</Link>}
      </form>
    } />
  </section>;
}
