'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PoseImport } from '../../progress/pose-import';
import { errorText, exerciseNames, pose, PoseError, UUID, type Result } from './pose-client';

export function ResultSummary({ result }: { result: Result }) {
  return (
    <section
      className="pose-result space-y-3 rounded-xl border border-border bg-card p-6"
      aria-labelledby="pose-result-title"
    >
      <h2 id="pose-result-title" className="text-xl font-bold tracking-tight text-foreground">
        Kết quả phân tích
      </h2>
      <p className="text-sm text-muted-foreground">
        {exerciseNames[result.exerciseId] ?? result.exerciseId} ·{' '}
        {result.source === 'LIVE' ? 'Camera' : 'Video'}
      </p>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-muted-foreground">Số rep</dt>
          <dd className="font-semibold text-foreground">
            {result.repCountStatus === 'AVAILABLE' ? result.repCount : 'Chưa có số rep'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Quan sát kỹ thuật</dt>
          <dd className="font-semibold text-foreground">
            {result.formStatus === 'ASSESSED' ? 'Có dữ liệu quan sát' : 'Chưa đủ dữ liệu đánh giá'}
          </dd>
        </div>
      </dl>
      {!!result.limitations.length && (
        <ul className="list-disc pl-4 text-xs text-amber-500">
          {result.limitations.map((message, index) => (
            <li key={index}>{message}</li>
          ))}
        </ul>
      )}
      <PoseImport key={result.id} result={result} />
      <p className="pt-2">
        <Link
          href={'/hoi-dap?resultId=' + result.id}
          className="text-sm font-semibold text-primary hover:underline"
        >
          Hỏi SmartGym về kết quả này
        </Link>
      </p>
    </section>
  );
}

export function ResultView({ id }: { id: string }) {
  const [result, setResult] = useState<Result>();
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    if (!UUID.test(id)) setError(errorText(new PoseError('NOT_FOUND')));
    else
      void pose<Result>('/results/' + id, { signal: controller.signal }).then(setResult, error => {
        if (!controller.signal.aborted) setError(errorText(error));
      });
    return () => controller.abort();
  }, [id]);
  return (
    <section className="mx-auto max-w-xl space-y-4 rounded-2xl border border-border bg-card p-6 shadow-md">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Chi tiết phiên tập</h1>
      {error ? (
        <p role="alert" aria-label="Lỗi kết quả AI" className="text-sm font-semibold text-destructive">
          {error}
        </p>
      ) : result ? (
        <ResultSummary result={result} />
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          Đang tải kết quả…
        </p>
      )}
      <p>
        <Link href="/" className="text-sm font-semibold text-primary hover:underline">
          Về phòng tập AI
        </Link>
      </p>
    </section>
  );
}
