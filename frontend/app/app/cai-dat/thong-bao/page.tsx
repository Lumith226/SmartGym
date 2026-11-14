import Link from 'next/link';
import { Settings, ArrowLeft } from 'lucide-react';
import { requireProfile, AuthUnavailable } from '../../../auth/session';
import { PreferencesForm } from '../../../notifications/views';
import { Card } from '../../../../components/ui/card';

export const metadata = { title: 'Tùy chọn nhắc lịch — SmartGym' };

export default async function PreferencesPage() {
  const profile = await requireProfile('/app/cai-dat/thong-bao');
  if (!profile) return <AuthUnavailable retry="/app/cai-dat/thong-bao" />;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/app/thong-bao"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline self-start"
        >
          <ArrowLeft className="size-3.5" />
          Về hộp thông báo
        </Link>
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <Settings className="size-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Tùy chọn nhắc lịch
            </h1>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Cấu hình kênh nhận thông báo và thời gian báo trước cho buổi tập.
            </p>
          </div>
        </div>
      </header>

      <section className="workout space-y-4">
        <nav className="workout-actions hidden">
          <Link href="/app/thong-bao">Hộp thông báo</Link>
          <Link href="/app">Tài khoản</Link>
        </nav>

        <Card className="p-6 sm:p-8">
          <PreferencesForm />
        </Card>
      </section>
    </div>
  );
}
