'use client';

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { toast } from '../../lib/toast';
import {
  Plus,
  SquarePen,
  ChevronDown,
  Square,
  ArrowUp,
  ThumbsUp,
  ThumbsDown,
  Copy,
  Check,
  PanelLeft,
  Sparkles,
  Clock,
  Trash2,
  Dumbbell,
  AlertCircle,
  ExternalLink,
  Flame,
  Activity,
  Calendar,
  BookOpen,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { cn } from '../../lib/utils';

export type Task = 'knowledge' | 'score' | 'summary' | 'practice';

export type Reference = {
  number: number;
  title: string;
  publisher: string;
  url: string | null;
  pdf_page: number | null;
  section: string | null;
  excerpt: string;
};

export type Answer = {
  reply: string;
  task: Task;
  status: string;
  generation_used: boolean;
  kb_version: string;
  references: Reference[];
  user_notices: string[];
  session: {
    penalty_total: null;
    scoring_policy: null;
    errors: { name_vi: string; observed_units: number }[];
  };
};

export type Turn = {
  role: 'user' | 'assistant';
  content: string;
  attachment?: { name: string; type: string };
  reasoningTitle?: string;
  answer?: Answer;
  timestamp?: number;
};

export type Selection = { id: string; name: string };

type StoredConversation = {
  id: string;
  title: string;
  task: Task;
  turns: Turn[];
  createdAt: number;
  updatedAt: number;
};

const tasks: Record<Task, { label: string; desc: string }> = {
  knowledge: { label: 'Kiến thức thể hình', desc: 'Hỏi về kỹ thuật, cơ bắp, giáo án' },
  score: { label: 'Đánh giá kỹ thuật', desc: 'Phân tích điểm số tư thế AI' },
  summary: { label: 'Nhận xét buổi tập', desc: 'Tổng kết lỗi sai và cải thiện' },
  practice: { label: 'Gợi ý bài tập bổ trợ', desc: 'Đề xuất bài khắc phục điểm yếu' },
};

const exerciseNames: Record<string, string> = {
  bodyweight_squat: 'Squat',
  push_up: 'Chống đẩy',
  jumping_jacks: 'Jumping Jack',
  reverse_crunch: 'Gập bụng ngược',
};

const PROMPT_SUGGESTIONS = [
  {
    icon: Dumbbell,
    title: 'Kỹ thuật Squat chuẩn',
    desc: 'Cách mở gối, vị trí chân và gồng core tránh đau lưng.',
    task: 'knowledge' as Task,
    prompt: 'Hướng dẫn chi tiết kỹ thuật Squat đúng chuẩn, cách mở gối và gồng bụng (bracing) để tránh chấn thương cột sống?',
  },
  {
    icon: Calendar,
    title: 'Lịch tập Push - Pull - Legs',
    desc: 'Thiết kế giáo án 4 buổi/tuần cân bằng các nhóm cơ.',
    task: 'knowledge' as Task,
    prompt: 'Hãy thiết kế cho tôi một lịch tập Push - Pull - Legs 4 buổi/tuần cho người đã tập 6 tháng, mục tiêu tăng cơ giảm mỡ tối ưu.',
  },
  {
    icon: Flame,
    title: 'Tính Calo & Macro',
    desc: 'Xác định lượng Protein, Carb, Fat cần nạp mỗi ngày.',
    task: 'knowledge' as Task,
    prompt: 'Tôi nặng 68kg, cao 1m72, tập 4 buổi/tuần. Hãy tính TDEE và phân bổ Macro (Protein/Carb/Fat) cho giai đoạn siết cơ nhẹ.',
  },
  {
    icon: Activity,
    title: 'Khắc phục đau khớp gối',
    desc: 'Bài tập bổ trợ củng cố cơ đùi trước và dây chằng.',
    task: 'practice' as Task,
    prompt: 'Tôi thường bị mỏi và đau khớp gối sau khi tập chân. Có những bài tập bổ trợ và bài giãn cơ nào giúp khắc phục?',
  },
];

const STORAGE_KEY = 'smartgym_user_chat_history_v1';
const CURRENT_CHAT_KEY = 'smartgym_user_active_chat_id';

function FormattedContent({
  content,
  onCitationClick,
}: {
  content: string;
  onCitationClick?: (cid: string) => void;
}) {
  const paragraphs = content.split(/\n{2,}/);

  const renderInline = (text: string) => {
    const parts: (string | React.ReactNode)[] = [];
    const regex = /(\*\*[^*]+\*\*|`[^`]+`|\[[a-zA-Z0-9_#-]+\])/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      const token = match[0];
      if (token.startsWith('**') && token.endsWith('**')) {
        parts.push(
          <strong key={match.index} className="font-semibold text-foreground">
            {token.slice(2, -2)}
          </strong>,
        );
      } else if (token.startsWith('`') && token.endsWith('`')) {
        parts.push(
          <code
            key={match.index}
            className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px] text-primary border border-border"
          >
            {token.slice(1, -1)}
          </code>,
        );
      } else if (token.startsWith('[') && token.endsWith(']')) {
        const rawTag = token.slice(1, -1);
        parts.push(
          <button
            key={match.index}
            type="button"
            onClick={() => onCitationClick?.(rawTag)}
            className="inline-flex items-center mx-0.5 px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-primary font-mono text-[11px] font-medium border border-border transition cursor-pointer"
          >
            [{rawTag.length > 15 ? rawTag.slice(0, 10) + '…' : rawTag}]
          </button>,
        );
      }
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }
    return parts;
  };

  return (
    <div className="space-y-3.5 text-[15px] leading-relaxed text-foreground">
      {paragraphs.map((p, idx) => {
        const trimmed = p.trim();
        if (!trimmed) return null;

        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={idx} className="font-semibold text-[16px] text-foreground pt-1">
              {renderInline(trimmed.replace(/^###\s+/, ''))}
            </h4>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h3 key={idx} className="font-bold text-[17px] text-foreground pt-1.5">
              {renderInline(trimmed.replace(/^##\s+/, ''))}
            </h3>
          );
        }

        if (trimmed.split('\n').every((line) => line.trim().startsWith('- ') || line.trim().startsWith('* '))) {
          const lines = trimmed.split('\n').filter((l) => l.trim().length > 0);
          return (
            <ul key={idx} className="my-2 space-y-1.5 pl-4 list-disc marker:text-muted-foreground">
              {lines.map((line, lidx) => (
                <li key={lidx} className="pl-1">
                  {renderInline(line.replace(/^[-*]\s+/, ''))}
                </li>
              ))}
            </ul>
          );
        }

        if (trimmed.split('\n').every((line) => /^\d+\.\s/.test(line.trim()))) {
          const lines = trimmed.split('\n').filter((l) => l.trim().length > 0);
          return (
            <ol key={idx} className="my-2 space-y-1.5 pl-5 list-decimal marker:text-muted-foreground">
              {lines.map((line, lidx) => (
                <li key={lidx} className="pl-1">
                  {renderInline(line.replace(/^\d+\.\s+/, ''))}
                </li>
              ))}
            </ol>
          );
        }

        return (
          <p key={idx} className="whitespace-pre-wrap">
            {renderInline(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

export function Chat({
  resultIds,
  invalidSelection = false,
}: {
  resultIds: string[];
  invalidSelection?: boolean;
}) {
  const [message, setMessage] = useState('');
  const [task, setTask] = useState<Task>('knowledge');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState(
    invalidSelection ? 'Liên kết kết quả tập không hợp lệ.' : '',
  );
  const [pending, setPending] = useState(false);
  const [attached, setAttached] = useState<Selection[]>([]);
  const [selecting, setSelecting] = useState(resultIds.length > 0);
  const [blockedSelection, setBlockedSelection] = useState(
    invalidSelection || resultIds.length > 0,
  );

  // Modern chat history sidebar state (NO MOCK DATA)
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [conversations, setConversations] = useState<StoredConversation[]>([]);
  const [activeChatId, setActiveChatId] = useState<string>('new');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [feedbackState, setFeedbackState] = useState<Record<number, 'up' | 'down'>>({});
  const [expandedUserTurns, setExpandedUserTurns] = useState<Record<number, boolean>>({});
  const [openReasoning, setOpenReasoning] = useState<Record<number, boolean>>({});
  const [openReferences, setOpenReferences] = useState<Record<number, boolean>>({});
  const [taskDropdownOpen, setTaskDropdownOpen] = useState(false);

  const generation = useRef(0);
  const inFlight = useRef<AbortController | undefined>(undefined);
  const selection = useRef<AbortController | undefined>(undefined);
  const active = useRef(false);
  const focusInput = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const scrollEndRef = useRef<HTMLDivElement>(null);

  // Load REAL user chat history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const list: StoredConversation[] = JSON.parse(saved);
        if (Array.isArray(list) && list.length > 0) {
          setConversations(list);
          const lastId = localStorage.getItem(CURRENT_CHAT_KEY);
          const current = list.find((c) => c.id === lastId);
          if (current) {
            setActiveChatId(current.id);
            setTurns(current.turns || []);
            setTask(current.task || 'knowledge');
          }
        }
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const saveConversation = useCallback(
    (newTurns: Turn[], currentTask: Task) => {
      if (!newTurns.length) return;
      try {
        setConversations((prev) => {
          let list = [...prev];
          let chatId = activeChatId;
          if (!chatId || chatId === 'new') {
            chatId = 'conv_' + Date.now();
            setActiveChatId(chatId);
            localStorage.setItem(CURRENT_CHAT_KEY, chatId);
          }

          const firstUserTurn = newTurns.find((t) => t.role === 'user');
          const title = firstUserTurn
            ? firstUserTurn.content.slice(0, 32).trim() + (firstUserTurn.content.length > 32 ? '…' : '')
            : 'Cuộc trò chuyện mới';

          const existingIndex = list.findIndex((c) => c.id === chatId);
          const updatedItem: StoredConversation = {
            id: chatId,
            title,
            task: currentTask,
            turns: newTurns,
            createdAt: existingIndex >= 0 ? list[existingIndex].createdAt : Date.now(),
            updatedAt: Date.now(),
          };

          if (existingIndex >= 0) {
            list[existingIndex] = updatedItem;
          } else {
            list.unshift(updatedItem);
          }
          list = list.slice(0, 30);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
          return list;
        });
      } catch {}
    },
    [activeChatId],
  );

  useEffect(() => {
    if (!pending && focusInput.current) {
      focusInput.current = false;
      input.current?.focus();
    }
  }, [pending]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, pending]);

  useEffect(() => {
    if (input.current) {
      input.current.style.height = 'auto';
      input.current.style.height = Math.min(input.current.scrollHeight, 180) + 'px';
    }
  }, [message]);

  // Load real attached pose results if given via URL params
  useEffect(() => {
    const c = new AbortController();
    selection.current = c;
    setSelecting(resultIds.length > 0);
    if (resultIds.length) {
      void Promise.all(
        resultIds.map(async (id) => {
          const r = await fetch('/api/v1/pose/results/' + id, {
            cache: 'no-store',
            signal: c.signal,
          });
          const data = await r.json();
          if (!r.ok) throw new Error(data.code);
          if (data.id !== id) throw new Error('POSE_UNAVAILABLE');
          return { id, name: exerciseNames[data.exerciseId] ?? 'Kết quả tập AI' };
        }),
      ).then(
        (rows) => {
          if (!c.signal.aborted) {
            setAttached(rows);
            setSelecting(false);
            setBlockedSelection(false);
          }
        },
        () => {
          if (!c.signal.aborted) {
            setSelecting(false);
          }
        },
      );
    }
    return () => {
      c.abort();
      generation.current++;
      inFlight.current?.abort();
    };
  }, [resultIds]);

  function startNewChat() {
    cancel();
    setTurns([]);
    setActiveChatId('new');
    setError('');
    setMessage('');
    localStorage.removeItem(CURRENT_CHAT_KEY);
    input.current?.focus();
  }

  function loadConversation(conv: StoredConversation) {
    cancel();
    setActiveChatId(conv.id);
    setTurns(conv.turns);
    setTask(conv.task);
    setError('');
    setMessage('');
    localStorage.setItem(CURRENT_CHAT_KEY, conv.id);
  }

  function deleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    if (activeChatId === id) {
      startNewChat();
    }
  }

  function cancel() {
    generation.current++;
    inFlight.current?.abort();
    active.current = false;
    focusInput.current = true;
    setPending(false);
    input.current?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!pending && !selecting && !blockedSelection && message.trim().length >= 2) {
        formRef.current?.requestSubmit();
      }
    }
  }

  function handleCopy(text: string, index: number) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIndex(index);
      toast.success('Đã sao chép vào bộ nhớ tạm');
      setTimeout(() => setCopiedIndex(null), 2000);
    });
  }

  function applySuggestion(item: typeof PROMPT_SUGGESTIONS[0]) {
    setTask(item.task);
    setMessage(item.prompt);
    input.current?.focus();
  }

  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (active.current || selecting || blockedSelection || message.trim().length < 2) return;
    const question = message;
    const chosenTask = task;
    const current = ++generation.current;
    const c = new AbortController();
    inFlight.current = c;
    active.current = true;
    setPending(true);
    setError('');

    const nextTurns: Turn[] = [
      ...turns,
      {
        role: 'user',
        content: question,
        timestamp: Date.now(),
        attachment: attached.length
          ? { name: `Dữ liệu ${attached[0].name}`, type: 'Buổi tập AI Pose' }
          : undefined,
      },
    ];
    setTurns(nextTurns);
    setMessage('');

    try {
      const conversation = turns
        .slice(-8)
        .map((t) => ({ role: t.role, content: t.content.slice(0, 3000) }));
      const r = await fetch('/api/v1/chat', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        signal: c.signal,
        headers: { 'content-type': 'application/json', 'x-smartgym-csrf': '1' },
        body: JSON.stringify({
          message: question,
          task: chosenTask,
          poseResultIds: attached.map((x) => x.id),
          conversation,
        }),
      });
      const data = await r.json();
      if (current !== generation.current || c.signal.aborted) return;
      if (!r.ok) {
        throw new Error(data.code ?? 'RAG_UNAVAILABLE');
      }

      const completedTurns: Turn[] = [
        ...nextTurns,
        {
          role: 'assistant',
          content: data.reply,
          answer: data as Answer,
          reasoningTitle: `Đã đối chiếu ${data.references?.length ?? 1} nguồn tri thức thể hình SmartGym RAG`,
          timestamp: Date.now(),
        },
      ];
      setTurns(completedTurns);
      saveConversation(completedTurns, chosenTask);
    } catch {
      if (current === generation.current && !c.signal.aborted) {
        setError('Trợ lý SmartGym AI hiện đang xử lý nhiều yêu cầu. Vui lòng thử lại sau giây lát.');
        setMessage(question);
      }
    } finally {
      if (current === generation.current) {
        active.current = false;
        setPending(false);
      }
    }
  }

  const activeConversation = conversations.find((c) => c.id === activeChatId);
  const activeTitle = activeConversation ? activeConversation.title : 'Cuộc trò chuyện mới';

  return (
    <div className="flex h-full w-full overflow-hidden bg-background text-foreground font-sans antialiased select-text">
      {/* 1. THANH LỊCH SỬ CHAT (Collapsible Sidebar, đồng bộ 100% theme & sidebar hệ thống) */}
      <aside
        className={cn(
          'flex flex-col h-full bg-sidebar transition-all duration-300 ease-in-out shrink-0 select-none z-30 border-r border-border',
          sidebarOpen
            ? 'w-[250px] relative'
            : 'w-0 -translate-x-full absolute md:relative overflow-hidden',
        )}
      >
        <div className="flex flex-col h-full w-[250px] p-2.5 text-[13px]">
          {/* Top Bar trong Chat Sidebar: Nút Trò chuyện mới + Thu gọn */}
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={startNewChat}
              className="flex-1 mr-1 justify-start gap-2 h-8 px-2.5 text-xs font-medium"
            >
              <Plus className="h-4 w-4 text-primary" />
              <span>Đoạn chat mới</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(false)}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="Đóng thanh lịch sử"
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
          </div>

          {/* Lịch sử trò chuyện thực tế của người dùng */}
          <div className="flex-1 overflow-y-auto pt-3 space-y-1">
            <p className="px-2 text-[11px] font-semibold tracking-wider uppercase text-muted-foreground pb-1">
              Lịch sử hội thoại
            </p>

            {conversations.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-muted-foreground space-y-1.5">
                <Clock className="h-5 w-5 mx-auto opacity-40 mb-1" />
                <p className="font-medium">Chưa có cuộc trò chuyện nào</p>
                <p className="text-[11px] text-muted-foreground/80">
                  Các câu hỏi bạn đặt ra sẽ tự động lưu tại đây.
                </p>
              </div>
            ) : (
              conversations.map((c) => {
                const isActive = c.id === activeChatId;
                return (
                  <div
                    key={c.id}
                    onClick={() => loadConversation(c)}
                    className={cn(
                      'group relative flex items-center justify-between rounded-lg px-2.5 py-2 text-[13px] cursor-pointer transition-colors',
                      isActive
                        ? 'bg-accent font-semibold text-accent-foreground shadow-xs'
                        : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                    )}
                  >
                    <span className="truncate pr-4">{c.title}</span>
                    <button
                      type="button"
                      onClick={(e) => deleteConversation(c.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-destructive text-muted-foreground transition-opacity"
                      title="Xóa"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </aside>

      {/* 2. KHÔNG GIAN TRÒ CHUYỆN CHÍNH */}
      <div className="flex flex-1 flex-col h-full overflow-hidden bg-background relative">
        {/* Top Header thanh điều hướng */}
        <header className="flex h-12 shrink-0 items-center justify-between px-3 sm:px-4 text-foreground border-b border-border bg-background/80 backdrop-blur-md">
          <div className="flex items-center gap-2">
            {!sidebarOpen && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(true)}
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                title="Mở thanh lịch sử"
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
            )}

            {/* Menu chuyển đổi Task / Chế độ tư vấn */}
            <div className="relative">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setTaskDropdownOpen((prev) => !prev)}
                className="flex items-center gap-1.5 text-sm font-medium px-2.5 h-8 text-foreground"
              >
                <span className="truncate max-w-[180px] sm:max-w-[320px]">{activeTitle}</span>
                <Badge variant="default" className="text-[11px] px-2 py-0 font-normal ml-1">
                  {tasks[task].label}
                </Badge>
                <ChevronDown className="h-3.5 w-3.5 opacity-60 ml-0.5" />
              </Button>

              {taskDropdownOpen && (
                <div className="absolute left-0 mt-1 w-64 rounded-xl bg-card border border-border shadow-xl p-1 z-50 text-xs">
                  <p className="px-2.5 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Chế độ phân tích RAG
                  </p>
                  {(Object.keys(tasks) as Task[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setTask(t);
                        setTaskDropdownOpen(false);
                      }}
                      className={cn(
                        'w-full flex flex-col text-left px-2.5 py-2 rounded-lg transition cursor-pointer',
                        task === t
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-foreground hover:bg-muted',
                      )}
                    >
                      <span className="text-sm font-medium">{tasks[t].label}</span>
                      <span className="text-[11px] text-muted-foreground">{tasks[t].desc}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={startNewChat}
              className="h-8 w-8 hover:text-foreground"
              title="Đoạn chat mới"
            >
              <SquarePen className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Luồng tin nhắn */}
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 space-y-6">
          <div className="mx-auto max-w-[760px] space-y-7">
            {/* Trạng thái chào mừng (Màn hình trống khi chưa có câu hỏi) */}
            {turns.length === 0 && (
              <div className="py-12 flex flex-col items-center text-center space-y-6 animate-fadeIn">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-sm">
                  <Sparkles className="h-7 w-7" />
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
                    SmartGym AI Coach
                  </h2>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Trợ lý thể hình thông minh: tra cứu kỹ thuật chuẩn, xây dựng lịch tập và giải đáp thắc mắc dinh dưỡng.
                  </p>
                </div>

                {/* Các gợi ý câu hỏi phổ biến bằng Card shadcn */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-[640px] pt-4 text-left">
                  {PROMPT_SUGGESTIONS.map((item, idx) => {
                    const Icon = item.icon;
                    return (
                      <Card
                        key={idx}
                        onClick={() => applySuggestion(item)}
                        className="flex items-start gap-3 p-3.5 hover:bg-accent/50 hover:border-border transition-all cursor-pointer group"
                      >
                        <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors shrink-0">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-foreground leading-tight">
                            {item.title}
                          </p>
                          <p className="text-[11.5px] text-muted-foreground pt-1 leading-snug line-clamp-2">
                            {item.desc}
                          </p>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Danh sách tin nhắn qua lại */}
            {turns.map((turn, index) => {
              const isUser = turn.role === 'user';
              const isExpanded = expandedUserTurns[index];
              const isLong = turn.content.length > 320;
              const hasReferences = turn.answer?.references && turn.answer.references.length > 0;

              return (
                <div
                  key={index}
                  className={cn(
                    'flex flex-col',
                    isUser ? 'items-end' : 'items-start',
                  )}
                >
                  {isUser ? (
                    /* Hộp thoại người dùng: Sử dụng màu Primary đồng bộ toàn hệ thống */
                    <div className="max-w-[85%] sm:max-w-[80%] rounded-[24px] bg-primary text-primary-foreground p-4 shadow-sm space-y-2.5">
                      {/* Thẻ đính kèm dữ liệu buổi tập (nếu có) */}
                      {turn.attachment && (
                        <div className="flex items-center gap-2.5 rounded-xl bg-black/20 dark:bg-white/10 border border-white/20 px-3 py-2 text-left">
                          <div className="h-7 w-7 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                            <Activity className="h-3.5 w-3.5 text-white" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-white truncate">
                              {turn.attachment.name}
                            </p>
                            <p className="text-[10.5px] text-white/80">
                              {turn.attachment.type}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Nội dung câu hỏi */}
                      <div className="text-[14.5px] leading-relaxed whitespace-pre-wrap">
                        {isLong && !isExpanded
                          ? turn.content.slice(0, 360) + '…'
                          : turn.content}
                      </div>

                      {isLong && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedUserTurns((prev) => ({
                              ...prev,
                              [index]: !prev[index],
                            }))
                          }
                          className="text-xs text-primary-foreground/90 hover:text-primary-foreground font-medium flex items-center gap-1 cursor-pointer pt-0.5"
                        >
                          <span>{isExpanded ? 'Thu gọn' : 'Xem thêm'}</span>
                          <ChevronDown
                            className={cn(
                              'h-3 w-3 transition-transform',
                              isExpanded && 'rotate-180',
                            )}
                          />
                        </button>
                      )}
                    </div>
                  ) : (
                    /* Phản hồi từ SmartGym AI: Trình bày trên nền canvas chuẩn shadcn */
                    <div className="w-full space-y-3 text-left">
                      {/* Thanh thông tin tra cứu RAG */}
                      {turn.reasoningTitle && (
                        <div className="flex items-center justify-between text-xs text-muted-foreground pb-1 border-b border-border">
                          <button
                            type="button"
                            onClick={() =>
                              setOpenReasoning((prev) => ({
                                ...prev,
                                ...{ [index]: !prev[index] },
                              }))
                            }
                            className="flex items-center gap-1.5 hover:text-foreground transition cursor-pointer text-[12px]"
                          >
                            <Sparkles className="h-3 w-3 text-primary" />
                            <span>{turn.reasoningTitle}</span>
                            <ChevronDown
                              className={cn(
                                'h-3.5 w-3.5 transition-transform',
                                openReasoning[index] && 'rotate-180',
                              )}
                            />
                          </button>
                          <span className="text-[11px] text-muted-foreground font-mono">
                            {turn.answer?.kb_version ? `v${turn.answer.kb_version}` : 'SmartGym RAG'}
                          </span>
                        </div>
                      )}

                      {/* Chi tiết suy luận / tri thức RAG mở rộng */}
                      {openReasoning[index] && turn.answer && (
                        <Card className="p-3 text-xs text-muted-foreground space-y-1.5">
                          <p className="font-semibold text-foreground">Chi tiết xử lý mô hình:</p>
                          <p>• Trạng thái: {turn.answer.status}</p>
                          <p>• Chế độ: {tasks[turn.answer.task]?.label || turn.answer.task}</p>
                          <p>• Số tài liệu khoa học trích dẫn: {turn.answer.references?.length ?? 0}</p>
                        </Card>
                      )}

                      {/* Nội dung trả lời chính */}
                      <FormattedContent content={turn.content} />

                      {/* Danh mục tài liệu trích dẫn khoa học (References) nếu có */}
                      {hasReferences && (
                        <div className="pt-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setOpenReferences((prev) => ({
                                ...prev,
                                ...{ [index]: !prev[index] },
                              }))
                            }
                            className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/90 h-8 px-2"
                          >
                            <BookOpen className="h-3.5 w-3.5" />
                            <span>Nguồn tài liệu khoa học ({turn.answer!.references.length})</span>
                            <ChevronDown
                              className={cn(
                                'h-3 w-3 transition-transform',
                                openReferences[index] && 'rotate-180',
                              )}
                            />
                          </Button>

                          {openReferences[index] && (
                            <Card className="mt-2 space-y-2 p-3 text-xs">
                              {turn.answer!.references.map((ref, rIdx) => (
                                <div key={rIdx} className="space-y-1 border-b border-border/50 pb-2 last:border-b-0 last:pb-0">
                                  <div className="flex items-center justify-between text-foreground font-medium">
                                    <span>
                                      [{ref.number}] {ref.title}
                                    </span>
                                    {ref.url && (
                                      <a
                                        href={ref.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary hover:underline flex items-center gap-1"
                                      >
                                        Xem <ExternalLink className="h-3 w-3" />
                                      </a>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-muted-foreground">
                                    NXB: {ref.publisher} {ref.section ? `• ${ref.section}` : ''}
                                  </p>
                                  {ref.excerpt && (
                                    <p className="text-[11.5px] text-muted-foreground italic bg-muted/50 p-2 rounded-md">
                                      &ldquo;{ref.excerpt}&rdquo;
                                    </p>
                                  )}
                                </div>
                              ))}
                            </Card>
                          )}
                        </div>
                      )}

                      {/* Các thao tác dưới câu trả lời */}
                      <div className="flex items-center gap-1.5 pt-1 text-muted-foreground">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCopy(turn.content, index)}
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          title="Sao chép nội dung"
                        >
                          {copiedIndex === index ? (
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setFeedbackState((prev) => ({
                              ...prev,
                              ...{ [index]: prev[index] === 'up' ? undefined! : 'up' },
                            }))
                          }
                          className={cn(
                            'h-7 w-7 text-muted-foreground hover:text-foreground',
                            feedbackState[index] === 'up' && 'text-primary bg-primary/10',
                          )}
                          title="Hữu ích"
                        >
                          <ThumbsUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setFeedbackState((prev) => ({
                              ...prev,
                              ...{ [index]: prev[index] === 'down' ? undefined! : 'down' },
                            }))
                          }
                          className={cn(
                            'h-7 w-7 text-muted-foreground hover:text-foreground',
                            feedbackState[index] === 'down' && 'text-destructive bg-destructive/10',
                          )}
                          title="Chưa chính xác"
                        >
                          <ThumbsDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Trạng thái AI đang suy nghĩ / tra cứu tri thức */}
            {pending && (
              <div className="flex items-center gap-2.5 text-xs text-muted-foreground animate-pulse py-2">
                <span className="h-2 w-2 rounded-full bg-primary animate-ping" />
                <span>SmartGym AI đang tra cứu tri thức và chuẩn bị câu trả lời…</span>
              </div>
            )}

            {/* Thông báo lỗi nếu có */}
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div ref={scrollEndRef} />
          </div>
        </div>

        {/* 3. THANH NHẬP LIỆU NỔI DẠNG VIÊN NANG (COMPOSER PILL) */}
        <footer className="shrink-0 pb-3 pt-1 px-4 sm:px-6">
          <div className="mx-auto max-w-[760px] space-y-2">
            {/* Hiển thị tệp đính kèm kết quả tập thật nếu có */}
            {attached.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted border border-border w-fit text-xs text-foreground">
                <Activity className="h-3.5 w-3.5 text-primary" />
                <span>Đang phân tích: <strong>{attached.map((a) => a.name).join(', ')}</strong></span>
                <button
                  type="button"
                  onClick={() => setAttached([])}
                  className="hover:text-destructive ml-1 cursor-pointer"
                  title="Gỡ đính kèm"
                >
                  ✕
                </button>
              </div>
            )}

            <form
              ref={formRef}
              onSubmit={send}
              className="relative flex items-center rounded-[28px] bg-card px-3 py-1.5 border border-border shadow-lg focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-ring/20 transition-all"
            >
              {/* Textarea tự co giãn */}
              <textarea
                ref={input}
                id="chat-message-input"
                rows={1}
                minLength={2}
                maxLength={3000}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={pending}
                placeholder="Hỏi SmartGym AI về bài tập, lịch tập, kỹ thuật, dinh dưỡng..."
                className="flex-1 resize-none bg-transparent px-3 py-1.5 text-[14.5px] text-foreground placeholder:text-muted-foreground focus:outline-none min-h-[36px] max-h-[160px]"
              />

              {/* Công cụ bên phải */}
              <div className="flex items-center gap-1 shrink-0">
                {/* Nút gửi / dừng hình tròn bằng Button shadcn */}
                {pending ? (
                  <Button
                    type="button"
                    size="icon"
                    onClick={cancel}
                    className="h-8 w-8 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 min-h-0"
                    title="Dừng sinh phản hồi"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    size="icon"
                    disabled={message.trim().length < 2}
                    className="h-8 w-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed min-h-0 shadow-xs"
                    title="Gửi câu hỏi"
                  >
                    <ArrowUp className="h-4 w-4 stroke-[2.5]" />
                  </Button>
                )}
              </div>
            </form>

            {/* Dòng ghi chú an toàn thể hình */}
            <p className="text-center text-[11px] text-muted-foreground">
              SmartGym AI cung cấp gợi ý tham khảo. Luôn lắng nghe cơ thể và tham khảo ý kiến chuyên gia y tế khi gặp chấn thương.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
