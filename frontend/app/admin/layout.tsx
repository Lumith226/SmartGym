import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthUnavailable, requireProfile } from '../auth/session';
import { AdminShell } from './admin-shell';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Quản trị nội dung — SmartGym CMS',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile('/admin');
  if (!profile) return <AuthUnavailable retry="/admin" />;
  if (!profile.roles.includes('ADMIN')) {
    return (
      <section className="mx-auto max-w-lg mt-12 rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold text-destructive">Không có quyền quản trị</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tài khoản của bạn cần có vai trò Quản trị viên (ADMIN) để truy cập khu vực này.
        </p>
        <div className="mt-5">
          <Link
            href="/app"
            className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Về tài khoản
          </Link>
        </div>
      </section>
    );
  }

  return (
    <AdminShell displayName={profile.displayName} email={profile.email}>
      {children}
    </AdminShell>
  );
}
