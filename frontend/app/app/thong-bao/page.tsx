import Link from 'next/link';
import { Bell, Settings, CalendarDays, ArrowLeft } from 'lucide-react';
import { requireProfile, AuthUnavailable } from '../../auth/session';
import { Inbox } from '../../notifications/views';
import { validZone } from '../../workout/time';
import { Card } from '../../../components/ui/card';

export const metadata = { title: 'Thông báo — SmartGym' };

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireProfile('/app/thong-bao');
  if (!profile) return <AuthUnavailable retry="/app/thong-bao" />;
  const q = await searchParams,
    cursor = typeof q.cursor === 'string' ? q.cursor : undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
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
              <Bell className="size-6" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Thông báo của bạn
              </h1>
              <p className="text-xs text-muted-foreground sm:text-sm">
                Nhắc nhở buổi tập sắp diễn ra và cập nhật từ hệ thống SmartGym.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Link
            href="/app/cai-dat/thong-bao"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
          >
            <Settings className="size-3.5" />
            Tùy chọn nhắc lịch
          </Link>
          <Link
            href="/app/lich"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
          >
            <CalendarDays className="size-3.5" />
            Lịch tập
          </Link>
        </div>
      </header>

      <section className="workout space-y-4">
        <nav className="workout-actions hidden">
          <Link href="/app/cai-dat/thong-bao">Tùy chọn nhắc lịch</Link>
          <Link href="/app">Tài khoản</Link>
          <Link href="/app/lich">Lịch tập</Link>
        </nav>

        <Card className="p-5 sm:p-6 space-y-4">
          <p className="text-xs text-muted-foreground">
            Thông báo giữ thời gian lúc gửi. Mở buổi tập để xem giờ và trạng thái mới nhất.
          </p>
          <Inbox
            unreadOnly={q.unreadOnly === 'true'}
            cursor={cursor}
            zone={validZone(profile.timeZone) ? profile.timeZone : 'Asia/Bangkok'}
          />
        </Card>
      </section>
    </div>
  );
}
