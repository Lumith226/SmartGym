'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowUp, ChevronDown, MessageSquare, Sparkles, X } from 'lucide-react';
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

const SUGGESTIONS = [
  'Tôi nên chú ý gì khi squat?',
  'Chống đẩy sai ở đâu là phổ biến nhất?',
  'Gợi ý bài tập thay thế khi đau gối',
];

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
    setExpanded(true);
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
    return (
      <div className="pointer-events-auto">
        <button
          type="button"
          onClick={onToggleMinimize}
          className="group inline-flex items-center gap-2 rounded-full border border-foreground/15 bg-card/90 px-4 py-2 text-xs font-semibold text-foreground shadow-2xl backdrop-blur-xl transition-all hover:bg-card hover:scale-105 active:scale-95"
        >
          <Sparkles size={14} className="text-primary transition-transform group-hover:rotate-12" />
          <span className="hidden sm:inline">Hỏi SmartGym AI</span>
          <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] text-foreground/70">Mở</span>
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto mx-auto w-full max-w-3xl">
      {/* Khung hội thoại mở rộng lên trên (chỉ hiện khi đã có tin nhắn) */}
      {expanded && (turns.length > 0 || pending || error) && (
        <div className="mb-2 overflow-hidden rounded-2xl border border-foreground/10 bg-card/90 text-foreground shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-foreground/10 px-4 py-2 text-xs text-foreground/60">
            <span className="inline-flex items-center gap-1.5">
              <MessageSquare size={13} />
              <span>Trợ lý SmartGym · trả lời có nguồn</span>
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  abortRef.current?.abort();
                  setTurns([]);
                  setError('');
                  setPending(false);
                }}
                className="cursor-pointer rounded-md px-2 py-0.5 text-[11px] hover:bg-foreground/10 hover:text-foreground"
              >
                Xóa
              </button>
              <button
                type="button"
                aria-label="Thu gọn hội thoại"
                onClick={() => setExpanded(false)}
                className="cursor-pointer rounded-md p-1 hover:bg-foreground/10 hover:text-foreground"
              >
                <ChevronDown size={14} />
              </button>
            </div>
          </div>
          <div ref={scrollRef} className="max-h-[34dvh] space-y-3 overflow-y-auto px-4 py-3">
            {turns.map((turn, i) => (
              <div key={i} className={cn('flex', turn.role === 'user' && 'justify-end')}>
                <div
                  className={cn(
                    'max-w-[88%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed',
                    turn.role === 'user' ? 'bg-[#0a84ff] text-white' : 'bg-foreground/10 text-foreground/95',
                  )}
                >
                  <p className="m-0 whitespace-pre-wrap">{turn.content}</p>
                  {turn.answer && turn.answer.user_notices.length > 0 && (
                    <ul className="m-0 mt-1.5 list-disc pl-4 text-[11px] text-foreground/60">
                      {turn.answer.user_notices.map((n, k) => (
                        <li key={k}>{n}</li>
                      ))}
                    </ul>
                  )}
                  {turn.answer && turn.answer.references.length > 0 && (
                    <details className="mt-2 text-[11px] text-foreground/70">
                      <summary className="cursor-pointer select-none">
                        {turn.answer.references.length} nguồn tham khảo
                      </summary>
                      <ol className="m-0 mt-1 space-y-1 pl-4">
                        {turn.answer.references.map(ref => (
                          <li key={ref.number} value={ref.number}>
                            <strong className="text-foreground/90">{ref.title}</strong>
                            {ref.publisher && <> — {ref.publisher}</>}
                            {ref.pdf_page !== null && <> · tr. {ref.pdf_page}</>}
                            {ref.url && (
                              <>
                                {' '}
                                ·{' '}
                                <a
                                  href={ref.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[#64d2ff]"
                                >
                                  Mở nguồn
                                </a>
                              </>
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
                <div className="rounded-2xl bg-foreground/10 px-3.5 py-2 text-[13px] text-foreground/70">
                  Đang tìm bằng chứng và chuẩn bị trả lời…
                </div>
              </div>
            )}
            {error && (
              <p role="alert" className="m-0 text-xs text-[#ff9f0a]">
                {error}{' '}
                <Link href="/dang-nhap?next=%2F" className="text-[#64d2ff]">
                  Đăng nhập
                </Link>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Gợi ý nhanh khi chưa có hội thoại */}
      {!turns.length && !pending && !message && (
        <div className="mb-2 hidden flex-wrap justify-center gap-1.5 sm:flex">
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => void send(s)}
              className="cursor-pointer rounded-full border border-foreground/15 bg-background/60 px-3 py-1 text-[11.5px] text-foreground/80 backdrop-blur-md transition-colors hover:bg-background/75 hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Ô nhập chat kiểu Claude / Codex */}
      <form
        onSubmit={e => {
          e.preventDefault();
          void send(message);
        }}
        className="!m-0 flex items-end gap-2 !rounded-2xl !border !border-foreground/15 !bg-card/90 !p-2 !shadow-2xl backdrop-blur-xl"
      >
        <span className="mb-1.5 ml-2 text-foreground/50">
          <Sparkles size={16} />
        </span>
        <textarea
          rows={1}
          value={message}
          maxLength={2500}
          spellCheck={false}
          autoComplete="off"
          data-gramm="false"
          {...({ writingsuggestions: 'false' } as any)}
          onFocus={() => setExpanded(true)}
          onChange={e => setMessage(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(message);
            }
          }}
          placeholder="Hỏi SmartGym về kỹ thuật, bài tập thay thế hoặc nhận xét buổi tập…"
          aria-label="Câu hỏi cho trợ lý SmartGym"
          className="!m-0 max-h-32 min-h-9 flex-1 resize-none !border-0 !bg-transparent !px-1 !py-2 text-[13.5px] !text-foreground !shadow-none outline-none placeholder:text-foreground/40 focus:!ring-0"
        />
        {onToggleMinimize && (
          <button
            type="button"
            onClick={onToggleMinimize}
            title="Thu gọn thanh chat để nhìn rõ toàn thân"
            className="mb-1 inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-foreground/50 hover:bg-foreground/10 hover:text-foreground"
          >
            <ChevronDown size={16} />
          </button>
        )}
        <button
          type="submit"
          disabled={pending || message.trim().length < 2}
          aria-label="Gửi câu hỏi"
          className="!m-0 inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center !rounded-full !border-0 !bg-foreground !p-0 !text-background transition-opacity disabled:!bg-foreground/15 disabled:!text-foreground/40"
        >
          {pending ? <X size={15} /> : <ArrowUp size={16} strokeWidth={2.4} />}
        </button>
      </form>
    </div>
  );
}

