'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { cms, errorMessage } from './cms';

export function LoadError({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="cms-feedback my-3 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive">
      <AlertCircle className="mt-0.5 size-5 shrink-0" />
      <div className="flex-1 text-sm">
        <p role="alert" className="form-error font-medium">
          {errorMessage(error)}
        </p>
      </div>
      {retry && (
        <button
          type="button"
          className="cms-secondary inline-flex h-8 items-center gap-1.5 rounded-lg border border-destructive/40 bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
          onClick={retry}
        >
          <RefreshCw className="size-3.5" />
          Thử tải lại
        </button>
      )}
    </div>
  );
}

type CmsResponse<T> = { data: T; etag: string | null };
type RequestState<T> = { path: string; attempt: number } & (
  { response: CmsResponse<T>; error?: never } | { response?: never; error: unknown }
);

export function useCmsPage<T>(path: string) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<RequestState<T>>();

  useEffect(() => {
    const controller = new AbortController();
    cms<T>(path, { signal: controller.signal })
      .then(response => {
        if (!controller.signal.aborted) setState({ path, attempt, response });
      })
      .catch(error => {
        if (!controller.signal.aborted) setState({ path, attempt, error });
      });
    return () => controller.abort();
  }, [path, attempt]);

  const current = state?.path === path && state.attempt === attempt ? state : undefined;
  return { ...current?.response, error: current?.error, retry: () => setAttempt(value => value + 1) };
}
