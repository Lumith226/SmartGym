import Link from 'next/link';
import { TrendingUp, PlusCircle, ClipboardList, ArrowLeft } from 'lucide-react';
import { requireProfile, AuthUnavailable } from '../../auth/session';
import { PeriodForm, SummaryView } from '../../progress/views';
import { period } from '../../progress/filters';
import { Card } from '../../../components/ui/card';

export const metadata = { title: 'Tiến độ tập luyện — SmartGym' };

export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireProfile('/app/tien-do');
  if (!profile) return <AuthUnavailable retry="/app/tien-do" />;
  const filters = period(await searchParams, profile.timeZone);

  return (
    <div className="mx-auto max-w-[1120px] space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <Link
            href="/app"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          >
            <ArrowLeft className="size-3.5" />
            Về tài khoản
          </Link>
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
              <TrendingUp className="size-6" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Tiến độ tập luyện
              </h1>
              <p className="text-xs text-muted-foreground sm:text-sm">
                Tổng hợp số buổi tập, số rep và khối lượng tạ (volume) đã hoàn thành.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Link
            href="/app/nhat-ky/moi"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all"
          >
            <PlusCircle className="size-3.5" />
            Ghi buổi tập
          </Link>
          <Link
            href="/app/nhat-ky"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
          >
            <ClipboardList className="size-3.5" />
            Nhật ký
          </Link>
        </div>
      </header>

      <section className="workout space-y-6">
        <nav className="workout-actions hidden">
          <Link href="/app/nhat-ky">Nhật ký</Link>
          <Link href="/app/nhat-ky/moi">Ghi buổi tập</Link>
          <Link href="/app">Tài khoản</Link>
        </nav>

        <Card className="p-5 sm:p-6">
          <PeriodForm {...filters} />
        </Card>

        <Card className="p-5 sm:p-6">
          <SummaryView {...filters} />
        </Card>
      </section>
    </div>
  );
}
