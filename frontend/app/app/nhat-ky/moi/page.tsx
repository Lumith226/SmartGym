import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, PlusCircle } from 'lucide-react';
import { requireProfile, AuthUnavailable } from '../../../auth/session';
import { LogEditor } from '../../../progress/editor';
import { validZone } from '../../../workout/time';
import { Card } from '../../../../components/ui/card';

export const metadata = { title: 'Ghi buổi tập — SmartGym' };

export default async function NewLog({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireProfile('/app/nhat-ky/moi');
  if (!profile) return <AuthUnavailable retry="/app/nhat-ky/moi" />;
  const q = await searchParams;
  if (
    q.occurrenceId !== undefined &&
    (typeof q.occurrenceId !== 'string' ||
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(q.occurrenceId))
  )
    notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/app/nhat-ky"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline self-start"
        >
          <ArrowLeft className="size-3.5" />
          Về nhật ký tập luyện
        </Link>
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <PlusCircle className="size-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Ghi buổi tập mới
            </h1>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Ghi nhận các hiệp tập, số rep và khối lượng tạ thực tế.
            </p>
          </div>
        </div>
      </header>

      <Card className="workout p-6 sm:p-8">
        <LogEditor
          occurrenceId={q.occurrenceId as string | undefined}
          zone={validZone(profile.timeZone) ? profile.timeZone : 'Asia/Bangkok'}
          now={new Date().toISOString()}
        />
      </Card>
    </div>
  );
}
