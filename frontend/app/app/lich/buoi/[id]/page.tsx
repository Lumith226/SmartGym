import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CalendarCheck } from 'lucide-react';
import { requireProfile, AuthUnavailable } from '../../../../auth/session';
import { OccurrenceDetail } from '../../../../workout/occurrence';
import { Card } from '../../../../../components/ui/card';

export const metadata = { title: 'Chi tiết buổi tập — SmartGym' };

export default async function OccurrencePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)) notFound();
  const path = '/app/lich/buoi/' + id;
  if (!(await requireProfile(path))) return <AuthUnavailable retry={path} />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/app/lich"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline self-start"
        >
          <ArrowLeft className="size-3.5" />
          Về lịch tập
        </Link>
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <CalendarCheck className="size-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Chi tiết buổi tập
            </h1>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Thông tin thời gian, bài tập dự kiến và tùy chọn dời lịch.
            </p>
          </div>
        </div>
      </header>

      <Card className="workout p-6 sm:p-8">
        <OccurrenceDetail id={id} />
      </Card>
    </div>
  );
}
