import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Dumbbell, ArrowLeft } from 'lucide-react';
import { requireProfile, AuthUnavailable } from '../../../auth/session';
import { PlanEditor } from '../../../workout/plans';
import { Card } from '../../../../components/ui/card';

export const metadata = { title: 'Chỉnh sửa chương trình — SmartGym' };

export default async function EditPlan({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)) notFound();
  const path = '/app/chuong-trinh/' + id;
  if (!(await requireProfile(path))) return <AuthUnavailable retry={path} />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/ke-hoach-tap"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline self-start"
        >
          <ArrowLeft className="size-3.5" />
          Về danh sách kế hoạch
        </Link>
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <Dumbbell className="size-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Chỉnh sửa chương trình
            </h1>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Cập nhật tên, bài tập và cấu trúc giáo án tập luyện.
            </p>
          </div>
        </div>
      </header>

      <Card className="workout p-6 sm:p-8">
        <PlanEditor id={id} />
      </Card>
    </div>
  );
}
