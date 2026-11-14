'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowUp, ChevronDown, Sparkles, Trash2, X } from 'lucide-react';
import { cn } from '../lib/utils';

type Reference = {
  number: number;
  title: string;
  publisher: string;
  url: string | null;
  pdf_page: number | null;
  section: string | null;
  excerpt: string;
};

type Answer = {
  reply: string;
  status: string;
  references: Reference[];
  user_notices: string[];
};

type Turn = { role: 'user' | 'assistant'; content: string; answer?: Answer };

const ERROR_TEXT: Record<string, string> = {
  RAG_DISABLED: 'Trợ lý chưa được bật.',
  RAG_NOT_READY: 'Kho tri thức chưa sẵn sàng. Câu hỏi của bạn vẫn được giữ để gửi lại.',
  RAG_TIMEOUT: 'Trợ lý trả lời quá lâu. Bạn có thể gửi lại.',
  RATE_LIMITED: 'Bạn đang gửi quá nhanh. Hãy chờ khoảng một phút.',
  UNAUTHENTICATED: 'Cần đăng nhập để hỏi về buổi tập của bạn.',
  VALIDATION_ERROR: 'Kiểm tra lại nội dung câu hỏi.',
};

export function RagDock({
  context,
  minimized = false,
  onToggleMinimize,
}: {
  context?: string;
  minimized?: boolean;
  onToggleMinimize?: () => void;
}) {
  const [message, setMessage] = React.useState('');
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState('');
  const [expanded, setExpanded] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, pending]);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  async function send(text: string) {
    const question = text.trim();
    if (question.length < 2 || pending) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setPending(true);
    setError('');
    setExpanded(true); // Khi ấn gửi chat thì mới mở to hơn để trả lời
    try {
      const conversation = turns
        .slice(-8)
        .map(t => ({ role: t.role, content: t.content.slice(0, 3000) }));
      const body = context ? `${question}\n\n[Dữ liệu quan sát từ camera/video]\n${context}` : question;
      const res = await fetch('/api/v1/chat', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', 'x-smartgym-csrf': '1' },
        body: JSON.stringify({
          message: body.slice(0, 3000),
          task: 'knowledge',
          poseResultIds: [],
          conversation,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.code ?? 'RAG_UNAVAILABLE');
      setTurns(old =>
        [
          ...old,
          { role: 'user' as const, content: question },
          { role: 'assistant' as const, content: data.reply, answer: data as Answer },
        ].slice(-20),
      );
      if (data.status !== 'unavailable') setMessage('');
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(
          ERROR_TEXT[(e as Error).message] ??
            'Trợ lý hiện chưa trả lời được. Câu hỏi của bạn vẫn được giữ lại.',
        );
      }
    } finally {
      setPending(false);
    }
  }

  if (minimized) {
    return null;
  }

  return (
    <div className="pointer-events-auto flex w-full flex-col">
      {/* Khung hội thoại mở rộng lên trên (chỉ mở to khi ấn gửi hoặc đã có tin nhắn) */}
      {expanded && (turns.length > 0 || pending || error) && (
        <div className="mb-2 flex max-h-[340px] flex-col overflow-hidden rounded-2xl border border-foreground/15 bg-card/95 text-foreground shadow-2xl backdrop-blur-2xl">
          <div className="flex items-center justify-between border-b border-foreground/10 px-3.5 py-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
              <Sparkles size={13} className="text-primary" />
              <span>Trợ lý SmartGym</span>
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  abortRef.current?.abort();
                  setTurns([]);
                  setError('');
                  setPending(false);
                  setExpanded(false);
                }}
                title="Xóa đoạn chat"
                className="inline-flex h-6 px-1.5 items-center justify-center rounded text-[11px] text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-colors"
              >
                <Trash2 size={12} className="mr-1" />
                <span>Xóa</span>
              </button>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                title="Thu gọn"
                className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-colors"
              >
                <ChevronDown size={14} />
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto p-3 text-xs [scrollbar-width:thin]">
            {turns.map((turn, i) => (
              <div key={i} className={cn('flex', turn.role === 'user' && 'justify-end')}>
                <div
                  className={cn(
                    'max-w-[88%] rounded-2xl px-3 py-1.5 text-[12px] leading-relaxed',
                    turn.role === 'user'
                      ? 'bg-[#6366f1] text-white shadow-xs'
                      : 'bg-muted/80 text-foreground border border-foreground/5',
                  )}
                >
                  <p className="m-0 whitespace-pre-wrap">{turn.content}</p>
                  {turn.answer?.user_notices && turn.answer.user_notices.length > 0 && (
                    <ul className="m-0 mt-1 list-disc pl-3.5 text-[10.5px] text-muted-foreground">
                      {turn.answer.user_notices.map((n, k) => (
                        <li key={k}>{n}</li>
                      ))}
                    </ul>
                  )}
                  {turn.answer?.references && turn.answer.references.length > 0 && (
                    <details className="mt-1 text-[10.5px] text-muted-foreground">
                      <summary className="cursor-pointer select-none font-semibold text-primary">
                        {turn.answer.references.length} nguồn tham khảo
                      </summary>
                      <ol className="m-0 mt-1 space-y-0.5 pl-3.5">
                        {turn.answer.references.map(ref => (
                          <li key={ref.number} value={ref.number}>
                            <strong className="text-foreground">{ref.title}</strong>
                            {ref.url && (
                              <a
                                href={ref.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-1 text-primary font-semibold hover:underline"
                              >
                                [Xem]
                              </a>
                            )}
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                </div>
              </div>
            ))}
            {pending && (
              <div className="flex">
                <div className="rounded-2xl bg-muted px-3 py-1.5 text-xs text-muted-foreground animate-pulse">
                  Đang phân tích và trả lời…
                </div>
              </div>
            )}
            {error && (
              <p role="alert" className="m-0 text-xs text-rose-500">
                {error}{' '}
                <Link href="/dang-nhap?next=%2F" className="text-primary font-semibold hover:underline">
                  Đăng nhập
                </Link>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Thanh nhập chat nhỏ gọn (chỉ cao ~40px), ôm sát mép phải */}
      <form
        onSubmit={e => {
          e.preventDefault();
          void send(message);
        }}
        className="flex items-center gap-1.5 rounded-2xl border border-foreground/15 bg-card/95 p-1.5 shadow-2xl backdrop-blur-2xl"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
          <Sparkles size={13} />
        </span>
        <input
          type="text"
          value={message}
          maxLength={2500}
          spellCheck={false}
          autoComplete="off"
          onChange={e => setMessage(e.target.value)}
          placeholder=""
          aria-label="Câu hỏi cho trợ lý SmartGym"
          className="flex-1 min-w-0 bg-transparent px-2 py-1 text-xs text-foreground outline-none"
        />
        {turns.length > 0 && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            title="Mở lại câu trả lời"
            className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-xl text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-colors"
          >
            <ChevronDown size={13} className="rotate-180" />
          </button>
        )}
        <button
          type="submit"
          disabled={pending || message.trim().length < 2}
          title="Gửi câu hỏi"
          className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-primary text-primary-foreground shadow transition-all hover:bg-primary/90 disabled:opacity-30"
        >
          <ArrowUp size={13} />
        </button>
        {onToggleMinimize && (
          <button
            type="button"
            onClick={onToggleMinimize}
            title="Đóng trợ lý"
            className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-xl text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-colors"
          >
            <X size={13} />
          </button>
        )}
      </form>
    </div>
  );
}
