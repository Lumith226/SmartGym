import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Edit3 } from 'lucide-react';
import { requireProfile, AuthUnavailable } from '../../../auth/session';
import { LogEditor } from '../../../progress/editor';
import { validZone } from '../../../workout/time';
import { Card } from '../../../../components/ui/card';

export const metadata = { title: 'Nhật ký buổi tập — SmartGym' };

export default async function EditLog({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)) notFound();
  const path = '/app/nhat-ky/' + id;
  const profile = await requireProfile(path);
  if (!profile) return <AuthUnavailable retry={path} />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/app/nhat-ky"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline self-start"
        >
          <ArrowLeft className="size-3.5" />
          Về danh sách nhật ký
        </Link>
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <Edit3 className="size-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Nhật ký buổi tập
            </h1>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Cập nhật các hiệp tập, số lần lặp và khối lượng tạ thực tế.
            </p>
          </div>
        </div>
      </header>

      <Card className="workout p-6 sm:p-8">
        <LogEditor
          id={id}
          zone={validZone(profile.timeZone) ? profile.timeZone : 'Asia/Bangkok'}
          now={new Date().toISOString()}
        />
      </Card>
    </div>
  );
}
