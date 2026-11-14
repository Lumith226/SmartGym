import Link from 'next/link';
import { Dumbbell, ArrowLeft } from 'lucide-react';
import { requireProfile, AuthUnavailable } from '../../../auth/session';
import { PlanEditor } from '../../../workout/plans';
import { Card } from '../../../../components/ui/card';

export const metadata = { title: 'Tạo chương trình tập — SmartGym' };

export default async function NewPlan() {
  if (!(await requireProfile('/app/chuong-trinh/moi')))
    return <AuthUnavailable retry="/app/chuong-trinh/moi" />;

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
              Tạo chương trình tập
            </h1>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Thiết kế giáo án tập luyện cá nhân hóa theo mục tiêu của bạn.
            </p>
          </div>
        </div>
      </header>

      <Card className="workout p-6 sm:p-8">
        <PlanEditor />
      </Card>
    </div>
  );
}
