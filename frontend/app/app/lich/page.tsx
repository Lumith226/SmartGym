import Link from 'next/link';
import { CalendarDays, ArrowLeft } from 'lucide-react';
import { requireProfile, AuthUnavailable } from '../../auth/session';
import { Calendar } from '../../workout/calendar';
import { range, todayIn, validZone } from '../../workout/time';

export const metadata = { title: 'Lịch tập — SmartGym' };

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireProfile('/app/lich');
  if (!profile) return <AuthUnavailable retry="/app/lich" />;
  const query = await searchParams;
  const zone =
    typeof query.zone === 'string' && validZone(query.zone)
      ? query.zone
      : validZone(profile.timeZone)
        ? profile.timeZone
        : 'Asia/Bangkok';
  let date =
    typeof query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(query.date)
      ? query.date
      : todayIn(zone);
  try {
    range(date, zone);
  } catch {
    date = todayIn(zone);
  }
  const cursor = (v: unknown) =>
    typeof v === 'string' && /^[A-Za-z0-9_-]{1,1024}$/.test(v) ? v : undefined;
  const uuid = (v: unknown) =>
    typeof v === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)
      ? v
      : undefined;

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/app"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline self-start"
        >
          <ArrowLeft className="size-3.5" />
          Về tài khoản
        </Link>
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <CalendarDays className="size-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Lịch tập luyện
            </h1>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Theo dõi và quản lý các buổi tập định kỳ theo giáo án thông minh.
            </p>
          </div>
        </div>
      </header>

      <section className="workout space-y-6">
        <Calendar
          zone={zone}
          date={date}
          view={query.view === 'week' ? 'week' : 'agenda'}
          cursor={cursor(query.cursor)}
          scheduleCursor={cursor(query.scheduleCursor)}
          planId={uuid(query.planId)}
          scheduleId={uuid(query.scheduleId)}
        />
      </section>
    </div>
  );
}
