import Link from 'next/link';
import { ArrowLeft, BadgeCheck, Mail, UserRound } from 'lucide-react';
import { Card } from '../../../components/ui/card';
import { requireProfile, AuthUnavailable } from '../../auth/session';
import { ProfileForm, LogoutButton } from '../../auth/forms';

export const metadata = { title: 'Hồ sơ — SmartGym' };

export default async function ProfilePage() {
  const profile = await requireProfile('/app/ho-so');
  if (!profile) return <AuthUnavailable retry="/app/ho-so" />;

  return (
    <div className="mx-auto grid max-w-[1120px] gap-6">
      <header className="grid justify-items-start gap-3">
        <Link href="/app" className="inline-flex min-h-10 items-center gap-2 rounded text-sm font-semibold text-[#0066cc] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Về tài khoản
        </Link>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Hồ sơ của bạn</h1>
          <p className="mt-2 text-sm text-ink-soft sm:text-base">Quản lý thông tin tài khoản SmartGym.</p>
        </div>
      </header>

      <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card className="min-w-0 rounded-2xl p-5 sm:p-6">
          <span className="grid size-12 place-items-center rounded-xl bg-accent-soft text-[#0066cc]">
            <UserRound className="size-6" aria-hidden="true" />
          </span>
          <h2 className="mt-4 break-words text-xl font-semibold tracking-tight">{profile.displayName}</h2>
          <div className="mt-4 grid gap-2 border-t border-line pt-4 text-sm">
            <p className="flex min-w-0 items-start gap-2 text-ink-soft">
              <Mail className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span className="wrap-anywhere">{profile.email}</span>
            </p>
            {profile.emailVerified && (
              <p className="flex items-center gap-2 font-medium text-emerald-700">
                <BadgeCheck className="size-4 shrink-0" aria-hidden="true" />
                Email đã xác minh
              </p>
            )}
          </div>
        </Card>

        <Card className="min-w-0 rounded-2xl p-5 sm:p-6">
          <h2 className="text-xl font-semibold tracking-tight">Thông tin cá nhân</h2>
          <p className="mt-1 mb-5 text-sm text-ink-soft">Cập nhật tên hiển thị và múi giờ dùng cho lịch tập.</p>
          <ProfileForm displayName={profile.displayName} timeZone={profile.timeZone} />
        </Card>
      </div>
      <div className="border-t border-line pt-4"><LogoutButton /></div>
    </div>
  );
}
