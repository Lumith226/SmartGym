import Link from 'next/link';
import { ArrowUpRight, CalendarDays, ChartNoAxesColumn, ClipboardList, Library, ScanLine, Settings, UserRound } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { requireProfile, AuthUnavailable } from '../auth/session';
import { LogoutButton } from '../auth/forms';
import { Dashboard } from '../progress/views';
import { NotificationBadge } from '../notifications/views';
import { todayIn, validZone } from '../workout/time';

export const metadata = { title: 'Tài khoản — SmartGym' };

const shortcuts = [
  { href: '/ke-hoach-tap', label: 'Kế hoạch tập luyện', detail: 'Xem và rèn luyện theo giáo án 7 ngày', icon: CalendarDays },
  { href: '/app/lich', label: 'Lịch tập', detail: 'Xem và sắp xếp các buổi tập', icon: CalendarDays },
  { href: '/app/nhat-ky', label: 'Nhật ký tập luyện', detail: 'Ghi lại bài tập, số rep và mức tạ', icon: ClipboardList },
  { href: '/app/tien-do', label: 'Tiến độ tập luyện', detail: 'Xem số buổi, số rep và khối lượng tập', icon: ChartNoAxesColumn },
  { href: '/', label: 'Phòng tập AI', detail: 'Phân tích động tác và kỹ thuật thời gian thực', icon: ScanLine },
  { href: '/bai-tap', label: 'Khám phá thư viện bài tập', detail: 'Tìm bài tập theo nhóm cơ và dụng cụ', icon: Library },
];

export default async function Account() {
  const profile = await requireProfile('/app');
  if (!profile) return <AuthUnavailable retry="/app" />;

  const zone = validZone(profile.timeZone) ? profile.timeZone : 'Asia/Bangkok';
  const links = profile.roles.includes('ADMIN')
    ? [...shortcuts, { href: '/admin', label: 'Quản trị nội dung', detail: 'Quản lý nội dung thư viện SmartGym', icon: Settings }]
    : shortcuts;

  return (
    <div className="mx-auto grid max-w-[1120px] gap-8">
      <Card className="grid gap-5 rounded-2xl p-5 sm:p-8">
        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
          <span className="mt-1 grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-[#0066cc] sm:size-14">
            <UserRound className="size-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-4xl">Tài khoản của bạn</h1>
            <p className="mt-2 break-words text-sm text-ink-soft sm:text-base">Xin chào, {profile.displayName}.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <Button asChild><Link href="/app/ho-so">Quản lý hồ sơ</Link></Button>
          <NotificationBadge />
        </div>
      </Card>

      <nav aria-labelledby="account-shortcuts">
        <h2 id="account-shortcuts" className="mb-3 text-xl font-semibold tracking-tight">Tập luyện của bạn</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {links.map(({ href, label, detail, icon: Icon }) => (
            <li key={href} className="min-w-0">
              <Link href={href} className="group flex h-full items-start gap-3 rounded-xl border border-foreground/[0.06] bg-card p-4 shadow-card transition-shadow hover:shadow-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-[#0066cc]">
                  <Icon className="size-[18px]" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold group-hover:text-[#0066cc]">{label}</span>
                  <span className="mt-1 block text-sm text-ink-soft">{detail}</span>
                </span>
                <ArrowUpRight className="mt-1 size-4 shrink-0 text-ink-soft" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <Dashboard zone={zone} today={todayIn(zone)} now={new Date().toISOString()} />
      <div className="border-t border-line pt-4"><LogoutButton /></div>
    </div>
  );
}

