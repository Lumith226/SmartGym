'use client';

import { useEffect, useRef, useState } from 'react';
import { Activity } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { cn } from '../../lib/utils';

const labels = {
  gpu: ['GPU · Ollama', 'Model đã nạp hoàn toàn trên GPU.'],
  mixed: ['GPU + CPU', 'Ollama đang chia model giữa GPU và CPU.'],
  cpu: ['CPU · Ollama', 'Model đã nạp trên CPU.'],
  idle: ['Chưa nạp model', 'Đã kết nối Ollama. Chạy kiểm tra để nạp model và xác nhận thiết bị.'],
  checking: ['Đang kiểm tra…', 'Đang kiểm tra thiết bị xử lý. Nếu chưa nạp model, bước này có thể mất khoảng một phút.'],
  unavailable: ['Ollama mất kết nối', 'Chưa đọc được trạng thái model. Hãy kiểm tra Ollama đang chạy rồi thử lại.'],
} as const;
type State = keyof typeof labels;

async function readState(signal: AbortSignal, check = false): Promise<State> {
  const response = await fetch('/api/v1/chat/ollama-runtime', {
    method: check ? 'POST' : 'GET',
    headers: check ? { 'x-smartgym-csrf': '1' } : undefined,
    cache: 'no-store',
    signal,
  });
  if (!response.ok) return 'unavailable';
  const { state } = await response.json();
  return typeof state === 'string' && Object.hasOwn(labels, state) ? state as State : 'unavailable';
}

export function OllamaRuntime({ busy }: { busy: boolean }) {
  const [state, setState] = useState<State>('checking');
  const [checking, setChecking] = useState(false);
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (checking) return;
    const controller = new AbortController();
    async function refresh() {
      if (document.visibilityState === 'hidden') return;
      try {
        const current = await readState(controller.signal);
        if (!controller.signal.aborted) setState(current);
      } catch {
        if (!controller.signal.aborted) setState('unavailable');
      }
    }
    void refresh();
    const timer = window.setInterval(refresh, 15000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [checking, busy]);

  async function runCheck() {
    if (request.current || busy) return;
    const controller = new AbortController();
    request.current = controller;
    setChecking(true);
    setState('checking');
    try {
      const current = await readState(controller.signal, true);
      if (!controller.signal.aborted) setState(current);
    } catch {
      if (!controller.signal.aborted) setState('unavailable');
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setChecking(false);
    }
  }

  const [label, description] = labels[state];
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
          aria-label={'Thiết bị Ollama: ' + label}
        >
          <Activity className={cn('size-3.5', state === 'gpu' || state === 'mixed'
            ? 'text-emerald-500' : state === 'unavailable' ? 'text-destructive' : 'text-muted-foreground')} aria-hidden="true" />
          <span>{label}</span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogTitle>Thiết bị xử lý Ollama</DialogTitle>
        <DialogDescription asChild>
          <p aria-live="polite">{description}</p>
        </DialogDescription>
        <Button type="button" onClick={() => void runCheck()} disabled={checking || busy}>
          {checking ? 'Đang kiểm tra…' : 'Kiểm tra GPU'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
