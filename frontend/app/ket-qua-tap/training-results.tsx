'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Download } from 'lucide-react';
import {
  downloadTrainingResult,
  readTrainingResults,
  type TrainingResult,
} from '../../lib/training-results';
import { Button } from '../../components/ui/button';

const dateFormat = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' });

export function TrainingResults({ profileId }: { profileId: string }) {
  const [results, setResults] = useState<TrainingResult[] | null>(null);
  const [readError, setReadError] = useState(false);

  useEffect(() => {
    function refresh() {
      try {
        setResults(readTrainingResults(profileId));
        setReadError(false);
      } catch {
        setReadError(true);
      }
    }
    refresh();
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, [profileId]);

  return (
    <section className="mx-auto max-w-4xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Kết quả tập</h1>
        <p className="mt-1 text-sm text-muted-foreground">Các kết quả bạn đã lưu từ Phòng tập trên trình duyệt này.</p>
      </header>
      {readError ? (
        <p role="alert" className="rounded-xl border p-4">Chưa đọc được kết quả đã lưu trong trình duyệt.</p>
      ) : results === null ? (
        <p role="status" className="text-sm text-muted-foreground">Đang tải kết quả…</p>
      ) : results.length === 0 ? (
        <div className="space-y-3 rounded-xl border p-5">
          <p>Chưa có kết quả. Sau khi phân tích động tác, bấm <strong>Lưu kết quả</strong> trong Phòng tập.</p>
          <Button asChild variant="outline"><Link href="/">Đến Phòng tập</Link></Button>
        </div>
      ) : (
        <ul className="m-0 list-none space-y-3 p-0">
          {results.map(entry => (
            <li key={entry.id} className="flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-card p-4">
              <div className="min-w-0 space-y-1">
                <h2 className="font-semibold">{entry.exerciseName}</h2>
                <p className="text-sm text-muted-foreground">
                  <time dateTime={entry.savedAt}>{dateFormat.format(new Date(entry.savedAt))}</time>
                  {' · '}{entry.source === 'camera' ? 'Camera' : 'Video'}
                  {' · '}{entry.scope === 'whole' ? 'Toàn video' : 'Phân tích trực tiếp'}
                </p>
                {entry.repCount !== null && <p className="text-sm">{entry.repCount} lượt tập</p>}
                {entry.feedback && <p className="text-sm">{entry.feedback}</p>}
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => downloadTrainingResult(entry)}>
                <Download aria-hidden="true" />
                Tải JSON
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
