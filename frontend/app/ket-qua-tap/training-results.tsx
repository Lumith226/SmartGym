'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  Calendar,
  Camera,
  ChevronDown,
  Dumbbell,
  Download,
  Flame,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Video,
} from 'lucide-react';
import {
  downloadTrainingResult,
  deleteTrainingResult,
  readTrainingResults,
  type TrainingResult,
} from '../../lib/training-results';
import { PoseResultDetails } from './pose-result-details';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { toast } from '../../lib/toast';
import { cn } from '../../lib/utils';

const dateTimeFormat = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function TrainingResults({ profileId }: { profileId: string }) {
  const [results, setResults] = React.useState<TrainingResult[] | null>(null);
  const [readError, setReadError] = React.useState(false);

  // Bộ lọc và tìm kiếm
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedExercise, setSelectedExercise] = React.useState<string>('all');
  const [selectedSource, setSelectedSource] = React.useState<string>('all');
  const [sortBy, setSortBy] = React.useState<'latest' | 'oldest' | 'reps'>('latest');

  // Refresh dữ liệu
  const refresh = React.useCallback(() => {
    try {
      const data = readTrainingResults(profileId);
      setResults(data);
      setReadError(false);
    } catch {
      setReadError(true);
    }
  }, [profileId]);

  React.useEffect(() => {
    refresh();
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, [refresh]);

  // Xóa 1 bản ghi
  function handleDeleteOne(id: string, name: string) {
    if (!confirm(`Bạn có chắc muốn xóa kết quả bài tập "${name}" này không?`)) return;
    deleteTrainingResult(profileId, id);
    toast.success('Đã xóa kết quả bài tập');
    refresh();
  }

  // Xóa tất cả
  function handleClearAll() {
    if (!confirm('Bạn có chắc muốn xóa toàn bộ lịch sử kết quả tập luyện trên trình duyệt này?')) return;
    localStorage.removeItem(`smartgym.training-results.${profileId}`);
    toast.success('Đã xóa toàn bộ lịch sử kết quả');
    refresh();
  }

  // Danh sách các bài tập duy nhất có trong kết quả
  const exerciseOptions = React.useMemo(() => {
    if (!results) return [];
    const map = new Map<string, string>();
    for (const r of results) {
      map.set(r.exerciseId, r.exerciseName);
    }
    return Array.from(map.entries());
  }, [results]);

  const resultCount = results?.length ?? 0;
  const videoCount = results?.filter(entry => entry.scope === 'whole').length ?? 0;

  // Lọc và sắp xếp kết quả
  const filteredResults = React.useMemo(() => {
    if (!results) return [];

    let list = [...results];

    // Lọc theo search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        r =>
          r.exerciseName.toLowerCase().includes(q) ||
          r.feedback?.toLowerCase().includes(q) ||
          r.exerciseId.toLowerCase().includes(q),
      );
    }

    // Lọc theo bài tập
    if (selectedExercise !== 'all') {
      list = list.filter(r => r.exerciseId === selectedExercise);
    }

    // Lọc theo nguồn
    if (selectedSource !== 'all') {
      list = list.filter(r => r.source === selectedSource);
    }

    // Sắp xếp
    list.sort((a, b) => {
      if (sortBy === 'latest') {
        return new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime();
      }
      if (sortBy === 'oldest') {
        return new Date(a.savedAt).getTime() - new Date(b.savedAt).getTime();
      }
      if (sortBy === 'reps') {
        return (b.repCount ?? 0) - (a.repCount ?? 0);
      }
      return 0;
    });

    return list;
  }, [results, searchQuery, selectedExercise, selectedSource, sortBy]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      {/* Header chính */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Kết quả tập
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild size="sm" className="gap-1.5 shadow-xs">
            <Link href="/">
              <Dumbbell size={15} />
              <span>Phòng tập</span>
            </Link>
          </Button>
          {results && results.length > 0 && (
            <Button
              variant="outline"
              size="icon"
              onClick={refresh}
              title="Tải lại kết quả"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <RotateCcw size={14} />
            </Button>
          )}
        </div>
      </div>

      {readError ? (
        <div role="alert" className="flex items-center gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-rose-600 dark:text-rose-400">
          <AlertCircle size={18} className="shrink-0" />
          <p className="text-xs">Chưa đọc được dữ liệu kết quả trong trình duyệt. Hãy thử tải lại trang.</p>
        </div>
      ) : results === null ? (
        <div className="flex items-center justify-center p-10 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <RotateCcw size={14} className="animate-spin text-primary" />
            <span>Đang tải kết quả…</span>
          </div>
        </div>
      ) : results.length === 0 ? (
        /* Empty State tối giản */
        <div className="rounded-2xl border border-dashed border-border/80 bg-card/60 p-8 text-center backdrop-blur-xl sm:p-12">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Dumbbell size={24} />
          </div>
          <h2 className="mt-4 text-base font-bold text-foreground">Chưa có kết quả tập nào</h2>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            Bấm "Lưu kết quả" trong Phòng tập sau khi phân tích để theo dõi tại đây.
          </p>
          <div className="mt-5">
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/">
                <Play size={13} fill="currentColor" />
                <span>Đến Phòng tập</span>
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              ['Kết quả đã lưu', resultCount],
              ['Phân tích trực tiếp', resultCount - videoCount],
              ['Phân tích cả video', videoCount],
            ].map(([label, count]) => (
              <div key={label} className="rounded-2xl border border-border/70 bg-card/80 p-3.5 sm:p-4">
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <p className="mt-2 text-2xl font-bold tabular-nums">{count}</p>
              </div>
            ))}
          </div>

          {/* Thanh công cụ Tìm kiếm & Bộ lọc */}
          <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/60 p-3.5 shadow-xs backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
            {/* Ô tìm kiếm */}
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Tìm bài tập hoặc nhận xét..."
                className="w-full rounded-xl border border-border/60 bg-background/80 pl-9 pr-3 py-1.5 text-xs text-foreground outline-none transition-colors focus:border-primary placeholder:text-muted-foreground/60"
              />
            </div>

            {/* Các dropdown bộ lọc */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Lọc theo bài tập */}
              <Select value={selectedExercise} onValueChange={setSelectedExercise}>
                <SelectTrigger aria-label="Chọn bài tập" className="h-8 rounded-xl border border-border/60 bg-background/80 px-2.5 text-xs text-foreground hover:bg-background">
                  <SelectValue placeholder="Chọn bài tập" />
                </SelectTrigger>
                <SelectContent className="w-52">
                  <SelectItem value="all">Tất cả bài tập</SelectItem>
                  {exerciseOptions.map(([id, name]) => (
                    <SelectItem key={id} value={id}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Lọc theo nguồn */}
              <Select value={selectedSource} onValueChange={setSelectedSource}>
                <SelectTrigger aria-label="Chọn nguồn" className="h-8 rounded-xl border border-border/60 bg-background/80 px-2.5 text-xs text-foreground hover:bg-background">
                  <SelectValue placeholder="Chọn nguồn" />
                </SelectTrigger>
                <SelectContent className="w-56">
                  <SelectItem value="all">Mọi nguồn (Camera & Video)</SelectItem>
                  <SelectItem value="camera">Chỉ Camera</SelectItem>
                  <SelectItem value="video">Chỉ Video</SelectItem>
                </SelectContent>
              </Select>

              {/* Sắp xếp */}
              <Select value={sortBy} onValueChange={val => setSortBy(val as typeof sortBy)}>
                <SelectTrigger aria-label="Sắp xếp kết quả" className="h-8 rounded-xl border border-border/60 bg-background/80 px-2.5 text-xs text-foreground hover:bg-background">
                  <SelectValue placeholder="Sắp xếp" />
                </SelectTrigger>
                <SelectContent className="w-48">
                  <SelectItem value="latest">Mới nhất</SelectItem>
                  <SelectItem value="oldest">Cũ nhất</SelectItem>
                  <SelectItem value="reps">Nhiều reps nhất</SelectItem>
                </SelectContent>
              </Select>

              {/* Xóa toàn bộ */}
              <button
                type="button"
                onClick={handleClearAll}
                title="Xóa toàn bộ kết quả"
                className="inline-flex cursor-pointer items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500 transition-colors"
              >
                <Trash2 size={13} />
                <span className="hidden md:inline">Xóa tất cả</span>
              </button>
            </div>
          </div>

          {/* Danh sách thẻ kết quả */}
          {filteredResults.length === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-card/40 p-8 text-center text-sm text-muted-foreground">
              Không tìm thấy kết quả nào khớp với bộ lọc.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredResults.map(entry => (
                <SessionCard
                  key={entry.id}
                  entry={entry}
                  onDelete={() => handleDeleteOne(entry.id, entry.exerciseName)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Thẻ chi tiết từng buổi tập
function SessionCard({
  entry,
  onDelete,
}: {
  entry: TrainingResult;
  onDelete: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const scopeLabel = entry.scope === 'whole' ? 'Cả video' : entry.scope === 'live' ? 'Trực tiếp' : 'Chưa rõ chế độ';
  return (
    <article className="overflow-hidden rounded-2xl border border-border/80 bg-card/90 shadow-md backdrop-blur-xl transition-all hover:border-foreground/20">
      {/* Header thẻ buổi tập */}
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3.5">
          {/* Icon bài tập */}
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent text-primary shadow-inner">
            <Dumbbell size={20} />
          </div>

          {/* Tên và thông tin buổi tập */}
          <div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="text-base font-bold text-foreground sm:text-lg">
                {entry.exerciseName}
              </h2>
              <Badge variant={entry.scope === 'whole' ? 'default' : 'outline'} className="px-2 py-0.5 text-[11px]">
                {scopeLabel}
              </Badge>
            </div>

            {/* Thời gian và nguồn */}
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Calendar size={12} />
                <time dateTime={entry.savedAt}>{dateTimeFormat.format(new Date(entry.savedAt))}</time>
              </span>
              <span>•</span>
              <span className="inline-flex items-center gap-1">
                {entry.source === 'camera' ? <Camera size={12} /> : <Video size={12} />}
                <span>{entry.source === 'camera' ? 'Camera' : 'Video'}</span>
              </span>
            </p>
          </div>
        </div>

        {/* Số Reps và nút mở rộng */}
        <div className="flex items-center justify-between gap-4 border-t border-border/50 pt-2 sm:border-0 sm:pt-0">
          {entry.repCount !== null && (
            <div className="flex items-center gap-2 rounded-xl bg-primary/10 px-3.5 py-1.5 text-primary">
              <Flame size={16} />
              <div className="leading-tight">
                <span className="text-lg font-extrabold sm:text-xl">{entry.repCount}</span>
                <span className="ml-1 text-xs font-semibold">lượt (reps)</span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setDetailsOpen(v => !v)}
              aria-expanded={detailsOpen}
              className="gap-1.5 text-xs"
            >
              <span>{detailsOpen ? 'Thu gọn' : 'Chi tiết'}</span>
              <ChevronDown size={14} className={cn('transition-transform duration-200', detailsOpen && 'rotate-180')} />
            </Button>
          </div>
        </div>
      </div>

      {/* Nhận xét AI ngắn gọn */}
      {entry.feedback && (
        <div className="border-t border-border/60 bg-muted/40 px-4 py-3 sm:px-5">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Sparkles size={12} />
            </span>
            <div className="text-xs leading-relaxed text-foreground/90">
              <strong className="font-semibold text-primary mr-1">AI:</strong>
              <span>{entry.feedback}</span>
            </div>
          </div>
        </div>
      )}

      {/* Phần mở rộng: Chi tiết các tiêu chí kỹ thuật */}
      {detailsOpen && (
        <div className="space-y-4 border-t border-border/60 bg-card/40 p-4 sm:p-5">
          <PoseResultDetails entry={entry} />

          {/* Các nút hành động nhanh dưới chân thẻ */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-3">
            <div className="flex items-center gap-2">
              <Button asChild size="sm" variant="default" className="gap-1.5 text-xs">
                <Link href={`/?exercise=${entry.exerciseId}`}>
                  <Play size={13} fill="currentColor" />
                  <span>Tập lại bài này</span>
                </Link>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => downloadTrainingResult(entry)}
                className="gap-1.5 text-xs"
              >
                <Download size={13} />
                <span>Tải JSON</span>
              </Button>
            </div>

            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onDelete}
              className="gap-1.5 text-xs text-rose-500 hover:bg-rose-500/10 hover:text-rose-600"
            >
              <Trash2 size={13} />
              <span>Xóa kết quả này</span>
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}
