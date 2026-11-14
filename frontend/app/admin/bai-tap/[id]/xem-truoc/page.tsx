import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { identifier } from '../../../cms';
import { DraftPreview } from '../../../draft-preview';

export default async function Preview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!identifier.test(id)) notFound();

  return (
    <section className="space-y-6">
      <div>
        <Link
          href={'/admin/bai-tap/' + id}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Về trình soạn thảo bài tập
        </Link>
      </div>

      <DraftPreview id={id} />
    </section>
  );
}
