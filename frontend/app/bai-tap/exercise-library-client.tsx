'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Filter,
  Grid,
  List,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { type CatalogFacets, type ExerciseCard, type TaxonomyItem, type WorkoutType } from '../catalog';
import { ExerciseBlueprintArt } from '../../components/exercise-blueprint-art';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/button';

interface Props {
  results?: { items: ExerciseCard[]; totalCount: number; totalPages: number; page: number; pageSize: number };
  muscleGroups: TaxonomyItem[];
  equipmentList: TaxonomyItem[];
  facets?: CatalogFacets;
  totalCount: number;
  poseLinks: Record<string, string>;
}

const WORKOUT_TYPES: { id: WorkoutType; label: string }[] = [
  { id: 'STRENGTH', label: 'Sức mạnh (Strength)' },
  { id: 'CARDIO', label: 'Tim mạch (Cardio)' },
  { id: 'HIIT', label: 'Đốt mỡ (HIIT)' },
  { id: 'CORE', label: 'Trọng tâm (Core)' },
  { id: 'STRETCHING', label: 'Giãn cơ (Stretching)' },
];

const DIFFICULTY_LEVELS: { id: 1 | 2 | 3 | 4 | 5; label: string; text: string; bg: string }[] = [
  { id: 1, label: 'Cấp I — Nhập môn', text: 'CẤP I', bg: '#38bdf8' },
  { id: 2, label: 'Cấp II — Căn bản', text: 'CẤP II', bg: '#10b981' },
  { id: 3, label: 'Cấp III — Trung cấp', text: 'CẤP III', bg: '#f59e0b' },
  { id: 4, label: 'Cấp IV — Nâng cao', text: 'CẤP IV', bg: '#f97316' },
  { id: 5, label: 'Cấp V — Chuyên nghiệp', text: 'CẤP V', bg: '#ef4444' },
];

export function ExerciseLibraryClient({
  results,
  muscleGroups,
  equipmentList,
  facets,
  totalCount,
  poseLinks,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const activeMuscle = searchParams.get('muscleGroupId') ?? 'all';
  const urlQuery = searchParams.get('q') ?? '';
  const [searchQuery, setSearchQuery] = React.useState(urlQuery);
  const searchTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const composing = React.useRef(false);
  const submittedQuery = React.useRef<string | undefined>(undefined);
  const sortBy = searchParams.get('sort') ?? '';
  const [viewMode, setViewMode] = React.useState<'grid' | 'list'>('grid');
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (submittedQuery.current === urlQuery) {
      submittedQuery.current = undefined;
      return;
    }
    clearTimeout(searchTimer.current);
    setSearchQuery(urlQuery);
  }, [urlQuery]);
  React.useEffect(() => () => clearTimeout(searchTimer.current), []);

  function navigate(changes: Record<string, string>, query = searchQuery) {
    clearTimeout(searchTimer.current);
    const next = new URLSearchParams(searchParams);
    next.delete('cursor');
    next.delete('page');
    const q = query.trim();
    for (const [key, value] of Object.entries({ q, ...changes })) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (next.toString() === searchParams.toString()) return;
    submittedQuery.current = q === urlQuery ? undefined : q;
    startTransition(() => router.replace('/bai-tap' + (next.size ? '?' + next : ''), { scroll: false }));
  }

  const [previewExercise, setPreviewExercise] = React.useState<ExerciseCard | null>(null);
  const previewPoseId = previewExercise && Object.hasOwn(poseLinks, previewExercise.id) ? poseLinks[previewExercise.id] : undefined;

  // Lắng nghe phím Escape để đóng Modal hoặc Drawer
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setPreviewExercise(null);
        setDrawerOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ─── HỖ TRỢ KÉO THẢ CHUỘT (DRAG-TO-SCROLL) & CUỘN BẰNG CON LĂN CHO DẢI PILLS ───
  const pillsContainerRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);
  const isDraggingPillsRef = React.useRef(false);
  const startXPillsRef = React.useRef(0);
  const scrollLeftPillsRef = React.useRef(0);
  const hasMovedPillsRef = React.useRef(false);

  const checkPillsScroll = React.useCallback(() => {
    const el = pillsContainerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  }, []);

  React.useEffect(() => {
    const el = pillsContainerRef.current;
    if (!el) return;
    checkPillsScroll();
    el.addEventListener('scroll', checkPillsScroll, { passive: true });
    window.addEventListener('resize', checkPillsScroll);
    return () => {
      el.removeEventListener('scroll', checkPillsScroll);
      window.removeEventListener('resize', checkPillsScroll);
    };
  }, [checkPillsScroll]);

  // Cuộn bằng con lăn chuột (Mouse Wheel -> Horizontal Scroll)
  const handlePillsWheel = (e: React.WheelEvent) => {
    const el = pillsContainerRef.current;
    if (!el) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      el.scrollLeft += e.deltaY;
    }
  };

  // Bắt đầu kéo chuột
  const handlePillsMouseDown = (e: React.MouseEvent) => {
    const el = pillsContainerRef.current;
    if (!el) return;
    isDraggingPillsRef.current = true;
    hasMovedPillsRef.current = false;
    startXPillsRef.current = e.pageX - el.offsetLeft;
    scrollLeftPillsRef.current = el.scrollLeft;
  };

  // Di chuyển chuột khi đang kéo
  const handlePillsMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingPillsRef.current) return;
    const el = pillsContainerRef.current;
    if (!el) return;
    const x = e.pageX - el.offsetLeft;
    const walk = (x - startXPillsRef.current) * 1.4;
    if (Math.abs(walk) > 4) {
      hasMovedPillsRef.current = true;
    }
    el.scrollLeft = scrollLeftPillsRef.current - walk;
  };

  // Thả chuột
  const handlePillsMouseUp = () => {
    isDraggingPillsRef.current = false;
  };

  // Cuộn bằng nút mũi tên
  const scrollPills = (offset: number) => {
    pillsContainerRef.current?.scrollBy({ left: offset, behavior: 'smooth' });
  };

  const listParam = (name: string, legacy: string) =>
    (searchParams.get(name) ?? searchParams.get(legacy) ?? '').split(',').filter(Boolean);
  const selectedTypes = listParam('workoutTypes', 'workoutType');
  const selectedEquipment = listParam('equipmentIds', 'equipmentId');
  const selectedDifficulties = listParam('difficulties', 'difficulty').map(Number);

  function toggleFilter<T extends string | number>(key: string, legacy: string, selected: T[], value: T) {
    const values = selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value];
    navigate({ [key]: values.join(','), [legacy]: '' });
  }

  // Bản đồ tên nhóm cơ và dụng cụ để hiển thị nhãn thân thiện
  const muscleMap = React.useMemo(() => {
    const map = new Map<string, string>();
    muscleGroups.forEach(g => map.set(g.id, g.labelVi));
    return map;
  }, [muscleGroups]);

  const equipmentMap = React.useMemo(() => {
    const map = new Map<string, string>();
    equipmentList.forEach(e => map.set(e.id, e.labelVi));
    return map;
  }, [equipmentList]);

  // Danh sách Quick Muscle Pills tạo động từ Taxonomy thật
  const quickMusclePills = React.useMemo(() => {
    const allPill = {
      id: 'all',
      label: 'Tất cả',
      count: facets?.total ?? totalCount,
    };

    const groupPills = muscleGroups.map(g => ({
      id: g.id,
      label: g.labelVi,
      count: facets?.muscleGroups?.[g.id] ?? 0,
    }));

    return [allPill, ...groupPills];
  }, [muscleGroups, facets, totalCount]);

  const PAGE_SIZE = results?.pageSize ?? 9;
  const totalFilteredCount = results?.totalCount ?? 0;
  const totalPages = results?.totalPages ?? 1;
  const currentPage = results?.page ?? 1;
  const paginatedExercises = results?.items ?? [];

  function resetAllFilters() {
    clearTimeout(searchTimer.current);
    setSearchQuery('');
    submittedQuery.current = urlQuery ? '' : undefined;
    startTransition(() => router.replace('/bai-tap', { scroll: false }));
  }

  const currentPillObj = quickMusclePills.find(p => p.id === activeMuscle);

  return (
    <div className="relative flex min-h-dvh flex-col bg-[#f8f9fc] text-[#0f172a] dark:bg-[#0b0c10] dark:text-[#f1f3f9]">
      {/* ─── 1. TOP HEADER (OPTION A ARCHITECTURAL SPEC) ─── */}
      <header
        className="sticky top-0 z-30 border-b border-[#e2e8f0] bg-[rgba(248,249,252,0.88)] px-7 pt-4 pb-3 transition-colors dark:border-[#232736] dark:bg-[rgba(11,12,16,0.88)]"
        style={{
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
        }}
      >
        {/* Hàng trên: Tiêu đề + Tìm kiếm + Bộ lọc */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-3.5">
          <div>
            <div className="font-mono text-[10.5px] font-medium tracking-[0.12em] text-[#94a3b8] uppercase dark:text-[#596277]">
              SmartGym Architectural Library
            </div>
            <h1 className="flex items-center gap-2.5 text-[20px] font-extrabold tracking-[-0.02em] text-[#0f172a] dark:text-[#f1f3f9]">
              <span>THƯ VIỆN BÀI TẬP</span>
              <span className="font-mono text-[11px] font-semibold text-[#4f46e5] bg-[rgba(79,70,229,0.08)] border border-[rgba(99,102,241,0.3)] rounded-full px-2 py-0.5 dark:text-[#818cf8] dark:bg-[rgba(99,102,241,0.14)]">
                {totalCount} bài tập
              </span>
            </h1>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Ô tìm kiếm Cmd+K */}
            <div className="relative w-full sm:w-[320px]">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8] dark:text-[#596277]"
              />
              <input
                type="search"
                aria-label="Tìm bài tập"
                maxLength={100}
                value={searchQuery}
                onChange={event => {
                  const value = event.target.value;
                  setSearchQuery(value);
                  clearTimeout(searchTimer.current);
                  if (!composing.current) searchTimer.current = setTimeout(() => navigate({}, value), 300);
                }}
                onCompositionStart={() => { composing.current = true; clearTimeout(searchTimer.current); }}
                onCompositionEnd={event => {
                  composing.current = false;
                  const value = event.currentTarget.value;
                  clearTimeout(searchTimer.current);
                  searchTimer.current = setTimeout(() => navigate({}, value), 300);
                }}
                onKeyDown={event => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) navigate({});
                }}
                placeholder="Tìm theo tên tiếng Việt hoặc tiếng Anh…"
                className="h-[38px] w-full rounded-[10px] border border-[#e2e8f0] bg-white pl-9 pr-14 text-[13px] text-[#0f172a] placeholder-[#94a3b8] transition-all focus:border-[#4f46e5] focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/15 dark:border-[#232736] dark:bg-[#12141c] dark:text-[#f1f3f9] dark:placeholder-[#596277] dark:focus:border-[#6366f1]"
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-[4px] border border-[#e2e8f0] bg-[#f8fafc] px-1.5 py-0.5 font-mono text-[10px] text-[#94a3b8] dark:border-[#232736] dark:bg-[#191d28] dark:text-[#596277]">
                ⌘K
              </span>
            </div>

            {/* Nút Bộ lọc nâng cao */}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className={cn(
                'inline-flex h-[38px] items-center gap-2 rounded-[10px] border border-[#e2e8f0] bg-white px-3.5 text-[12.5px] font-semibold text-[#0f172a] transition-all hover:border-[#cbd5e1] hover:bg-[#f3f6fc] dark:border-[#232736] dark:bg-[#141721] dark:text-[#f1f3f9] dark:hover:border-[#333a4f] dark:hover:bg-[#1b1f2c]',
                drawerOpen && 'border-[#4f46e5] bg-[rgba(79,70,229,0.08)] text-[#4f46e5] dark:border-[#6366f1] dark:text-[#818cf8]',
              )}
            >
              <SlidersHorizontal size={14} />
              <span>Bộ lọc nâng cao</span>
              {(selectedDifficulties.length > 0 || selectedTypes.length > 0 || selectedEquipment.length > 0) && (
                <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#4f46e5] font-mono text-[10px] font-bold text-white dark:bg-[#6366f1]">
                  {selectedDifficulties.length + selectedTypes.length + selectedEquipment.length}
                </span>
              )}
            </button>

            {/* Nút Đặt lại */}
            <button
              type="button"
              onClick={resetAllFilters}
              className="inline-flex h-[38px] items-center gap-1.5 rounded-[10px] border border-transparent px-2.5 text-[12.5px] font-medium text-[#94a3b8] transition-colors hover:bg-slate-200/50 hover:text-[#0f172a] dark:text-[#596277] dark:hover:bg-[#191d28] dark:hover:text-[#f1f3f9]"
              title="Đặt lại tất cả bộ lọc"
            >
              <RotateCcw size={13} />
              <span>Đặt lại</span>
            </button>
          </div>
        </div>

        {/* Dải Quick Muscle Pills cuộn ngang lấy từ Taxonomy thật (Hỗ trợ kéo chuột, cuộn lăn & nút mũi tên) */}
        <div className="relative flex items-center w-full">
          {/* Nút cuộn trái */}
          {canScrollLeft && (
            <div className="absolute left-0 z-20 flex items-center pr-3 bg-gradient-to-r from-[rgba(248,249,252,0.95)] via-[rgba(248,249,252,0.85)] to-transparent dark:from-[rgba(11,12,16,0.95)] dark:via-[rgba(11,12,16,0.85)] h-full">
              <button
                type="button"
                onClick={() => scrollPills(-260)}
                aria-label="Cuộn sang trái"
                className="flex h-7 w-7 items-center justify-center rounded-full border border-[#e2e8f0] bg-white text-[#475569] shadow-md transition-all hover:scale-105 hover:bg-[#eef2ff] hover:text-[#4338ca] dark:border-[#232736] dark:bg-[#151822] dark:text-[#9098ac] dark:hover:bg-[#1f2433] dark:hover:text-[#f1f3f9]"
              >
                <ChevronLeft size={14} />
              </button>
            </div>
          )}

          {/* Container danh sách Pills */}
          <div
            ref={pillsContainerRef}
            onWheel={handlePillsWheel}
            onMouseDown={handlePillsMouseDown}
            onMouseMove={handlePillsMouseMove}
            onMouseUp={handlePillsMouseUp}
            onMouseLeave={handlePillsMouseUp}
            className="flex w-full items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden cursor-grab active:cursor-grabbing select-none"
          >
            {quickMusclePills.map(pill => {
              const active = activeMuscle === pill.id;
              return (
                <button
                  key={pill.id}
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (hasMovedPillsRef.current) return;
                    navigate({ muscleGroupId: pill.id === 'all' ? '' : pill.id });
                  }}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-all duration-150',
                    active
                      ? 'border-[#4f46e5] bg-[#4f46e5] text-white shadow-[0_4px_14px_rgba(79,70,229,0.3)] dark:border-[#6366f1] dark:bg-[#6366f1] dark:shadow-[0_4px_14px_rgba(99,102,241,0.4)]'
                      : 'border-[#e2e8f0] bg-white text-[#475569] hover:border-[#cbd5e1] hover:bg-[#f3f6fc] hover:text-[#0f172a] dark:border-[#232736] dark:bg-[#151822] dark:text-[#9098ac] dark:hover:border-[#333a4f] dark:hover:bg-[#1b1f2c] dark:hover:text-[#f1f3f9]',
                  )}
                >
                  <span>{pill.label}</span>
                  <span
                    className={cn(
                      'font-mono text-[10.5px]',
                      active
                        ? 'text-white/90'
                        : 'text-[#94a3b8] dark:text-[#596277]',
                    )}
                  >
                    {pill.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Nút cuộn phải */}
          {canScrollRight && (
            <div className="absolute right-0 z-20 flex items-center pl-3 bg-gradient-to-l from-[rgba(248,249,252,0.95)] via-[rgba(248,249,252,0.85)] to-transparent dark:from-[rgba(11,12,16,0.95)] dark:via-[rgba(11,12,16,0.85)] h-full">
              <button
                type="button"
                onClick={() => scrollPills(260)}
                aria-label="Cuộn sang phải"
                className="flex h-7 w-7 items-center justify-center rounded-full border border-[#e2e8f0] bg-white text-[#475569] shadow-md transition-all hover:scale-105 hover:bg-[#eef2ff] hover:text-[#4338ca] dark:border-[#232736] dark:bg-[#151822] dark:text-[#9098ac] dark:hover:bg-[#1f2433] dark:hover:text-[#f1f3f9]"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ─── 2. SUB-TOOLBAR & STATUS ─── */}
      <section className="flex flex-col gap-3 px-7 pt-4 pb-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#edf2f7] dark:border-[#1c202d]">
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-[#475569] dark:text-[#9098ac]">
          <span>
            Hiển thị{' '}
            <strong className="font-bold text-[#0f172a] dark:text-[#f1f3f9]">
              {totalFilteredCount === 0
                ? 0
                : `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, totalFilteredCount)}`}
            </strong>{' '}
            trên{' '}
            <strong className="font-bold text-[#0f172a] dark:text-[#f1f3f9]">
              {totalFilteredCount}
            </strong>{' '}
            bài tập
          </span>
          {activeMuscle !== 'all' && (
            <span className="inline-flex items-center gap-1.5 rounded-[4px] bg-[rgba(79,70,229,0.08)] border border-[rgba(99,102,241,0.2)] px-2 py-0.5 text-[11.5px] font-semibold text-[#4f46e5] dark:bg-[rgba(99,102,241,0.14)] dark:text-[#818cf8]">
              <span>{currentPillObj?.label}</span>
              <button
                type="button"
                onClick={() => navigate({ muscleGroupId: '' })}
                className="hover:opacity-75"
                aria-label="Xóa bộ lọc nhóm cơ"
              >
                <X size={12} />
              </button>
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Dropdown Sắp xếp */}
          <div className="flex items-center gap-2 text-[12.5px] text-[#94a3b8] dark:text-[#596277]">
            <span>Sắp xếp:</span>
            <select
              value={sortBy}
              disabled={pending}
              aria-label="Sắp xếp bài tập"
              onChange={e => navigate({ sort: e.target.value })}
              className="h-8 rounded-[6px] border border-[#e2e8f0] bg-white px-2.5 text-[12px] font-semibold text-[#0f172a] outline-none focus:border-[#4f46e5] dark:border-[#232736] dark:bg-[#151822] dark:text-[#f1f3f9] dark:focus:border-[#6366f1]"
            >
              <option value="">Mặc định</option>
              <option value="diff-asc">Độ khó tăng dần</option>
              <option value="diff-desc">Độ khó giảm dần</option>
              <option value="name">Tên A-Z</option>
            </select>
          </div>

          {/* Nút Grid / List Toggle */}
          <div className="flex items-center rounded-[6px] border border-[#e2e8f0] bg-white p-0.5 dark:border-[#232736] dark:bg-[#151822]">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-[4px] transition-all',
                viewMode === 'grid'
                  ? 'bg-[#4f46e5] text-white shadow-[0_2px_6px_rgba(79,70,229,0.3)] dark:bg-[#6366f1]'
                  : 'text-[#94a3b8] hover:text-[#0f172a] dark:text-[#596277] dark:hover:text-[#f1f3f9]',
              )}
              title="Xem dạng lưới (Grid)"
            >
              <Grid size={14} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-[4px] transition-all',
                viewMode === 'list'
                  ? 'bg-[#4f46e5] text-white shadow-[0_2px_6px_rgba(79,70,229,0.3)] dark:bg-[#6366f1]'
                  : 'text-[#94a3b8] hover:text-[#0f172a] dark:text-[#596277] dark:hover:text-[#f1f3f9]',
              )}
              title="Xem dạng danh sách (List)"
            >
              <List size={14} />
            </button>
          </div>
        </div>
      </section>

      {/* ─── 3. CONTENT AREA & EXERCISE CARDS GRID ─── */}
      <main className="flex-1 px-7 py-6">
        {pending && <p role="status" className="mb-3 text-sm text-muted-foreground">Đang cập nhật kết quả…</p>}
        {!results ? (
          <p role="alert" className="rounded-xl border border-border bg-card p-5 text-sm">
            Chưa tải được bài tập. <button type="button" className="text-primary underline" onClick={() => startTransition(() => router.refresh())}>Thử lại</button>
          </p>
        ) : paginatedExercises.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#e2e8f0] bg-white py-16 text-center dark:border-[#232736] dark:bg-[#151822]">
            <Dumbbell className="h-10 w-10 text-[#94a3b8] mb-3 stroke-[1.5]" />
            <p className="text-sm font-semibold text-[#0f172a] dark:text-[#f1f3f9]">
              Không tìm thấy bài tập nào khớp với tiêu chí lọc
            </p>
            <p className="mt-1 text-xs text-[#94a3b8] dark:text-[#596277]">
              Vui lòng thử điều chỉnh lại từ khóa tìm kiếm hoặc chọn lại nhóm cơ.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={resetAllFilters}
              className="mt-4"
            >
              Đặt lại bộ lọc
            </Button>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 mb-10">
            {paginatedExercises.map((exercise, index) => {
              const diffObj =
                DIFFICULTY_LEVELS.find(d => d.id === exercise.difficulty) ||
                DIFFICULTY_LEVELS[1];
              const specNo = String(index + 1).padStart(2, '0');
              const mediaImage = exercise.media?.find(m => m.kind === 'IMAGE')?.url;

              return (
                <article
                  key={exercise.id}
                  onClick={() => setPreviewExercise(exercise)}
                  className="group relative flex cursor-pointer flex-col overflow-hidden rounded-[14px] border border-[#e2e8f0] bg-white transition-all duration-250 hover:-translate-y-1 hover:border-[#6366f1]/50 hover:shadow-[0_14px_30px_-4px_rgba(15,23,42,0.14)] dark:border-[#232736] dark:bg-[#151822] dark:hover:shadow-[0_14px_30px_-4px_rgba(0,0,0,0.65)]"
                >
                  {/* ─── Poster Frame (Giấy ngà vintage ivory + lưới kẻ 20px) ─── */}
                  <div
                    className="relative flex h-[230px] w-full items-center justify-center overflow-hidden border-b border-[#edf2f7] select-none dark:border-[#1c202d]"
                    style={{
                      backgroundColor: '#f4efe6',
                      backgroundImage:
                        'linear-gradient(to right, rgba(17, 19, 23, 0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(17, 19, 23, 0.06) 1px, transparent 1px)',
                      backgroundSize: '20px 20px',
                    }}
                  >
                    {/* Viền nét đứt bên trong (Dashed Architectural Frame) */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-2 rounded-[4px]"
                      style={{ border: '1px dashed rgba(24, 26, 32, 0.12)' }}
                    />

                    {/* Huy hiệu Góc trên trái: LOẠI BÀI TẬP */}
                    <div className="absolute top-3 left-3 z-10">
                      <span className="font-mono text-[10px] font-bold tracking-[0.06em] uppercase rounded-[4px] bg-[rgba(15,23,42,0.88)] text-white px-2 py-0.5 shadow-sm border border-white/10">
                        {exercise.workoutType || 'SỨC MẠNH'}
                      </span>
                    </div>

                    {/* Huy hiệu Góc trên phải: CẤP ĐỘ KHÓ */}
                    <div className="absolute top-3 right-3 z-10">
                      <span
                        className="font-mono text-[10px] font-bold tracking-[0.05em] uppercase rounded-[4px] text-white px-2 py-0.5 shadow-sm"
                        style={{ backgroundColor: diffObj.bg }}
                      >
                        {diffObj.text}
                      </span>
                    </div>

                    {/* Watermark kỹ thuật góc dưới trái */}
                    <div className="pointer-events-none absolute bottom-3 left-3.5 z-10 font-mono text-[9px] font-semibold tracking-[0.15em] uppercase text-[#181a20]/40">
                      SMARTGYM · SPEC #{specNo}
                    </div>

                    {Object.hasOwn(poseLinks, exercise.id) && <Link
                      href={'/?exercise=' + encodeURIComponent(poseLinks[exercise.id])}
                      onClick={event => event.stopPropagation()}
                      aria-label={`Tập tại phòng tập: ${exercise.nameVi}`}
                      className="absolute bottom-3 right-3 z-10 rounded bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:underline">Phòng tập</Link>}

                    {/* Artwork: Nếu có ảnh media thật thì hiển thị ảnh, nếu không thì hiển thị vector blueprint */}
                    <div className="relative z-1 flex h-[82%] w-[82%] max-h-[190px] items-center justify-center transition-transform duration-300 group-hover:scale-105">
                      {mediaImage ? (
                        <img
                          src={mediaImage}
                          alt={exercise.nameVi}
                          className="h-full w-full object-contain filter drop-shadow-[0_4px_10px_rgba(0,0,0,0.08)]"
                          loading="lazy"
                        />
                      ) : (
                        <ExerciseBlueprintArt
                          exerciseId={exercise.slug || exercise.id}
                          className="h-full w-full object-contain filter drop-shadow-[0_4px_10px_rgba(0,0,0,0.08)]"
                        />
                      )}
                    </div>
                  </div>

                  {/* ─── Card Body ─── */}
                  <div className="flex flex-1 flex-col p-5">
                    {/* Tên tiếng Việt */}
                    <h3 className="text-[16px] font-bold text-[#0f172a] line-clamp-1 tracking-[-0.01em] transition-colors group-hover:text-[#4f46e5] dark:text-[#f1f3f9] dark:group-hover:text-[#6366f1]">
                      {exercise.nameVi}
                    </h3>

                    {/* Tên tiếng Anh */}
                    <div className="text-[12px] italic text-[#94a3b8] line-clamp-1 mb-3 dark:text-[#596277]">
                      {exercise.nameEn || exercise.slug}
                    </div>

                    {/* Dải thông số kỹ thuật (DM Mono Spec Row) */}
                    <div className="mb-3.5 flex items-center gap-2 rounded-[6px] border border-[#edf2f7] bg-[#f8fafc] px-3 py-1.5 font-mono text-[11.5px] text-[#475569] dark:border-[#1c202d] dark:bg-[#191d28] dark:text-[#9098ac]">
                      <span className="text-[#4f46e5] dark:text-[#818cf8]">●</span>
                      <span className="line-clamp-1">
                        {exercise.summary}
                      </span>
                    </div>

                    {/* Tags Nhóm cơ & Dụng cụ lấy từ taxonomy thật */}
                    <div className="mb-4 flex flex-wrap gap-1.5">
                      {exercise.primaryMuscleIds?.slice(0, 2).map(id => (
                        <span
                          key={id}
                          className="rounded-[4px] border border-[rgba(99,102,241,0.25)] bg-[rgba(79,70,229,0.08)] px-2 py-0.5 text-[11px] font-semibold text-[#4f46e5] dark:bg-[rgba(99,102,241,0.14)] dark:text-[#818cf8]"
                        >
                          {muscleMap.get(id) || id}
                        </span>
                      ))}
                      {exercise.equipmentIds?.slice(0, 1).map(id => (
                        <span
                          key={id}
                          className="rounded-[4px] border border-[#e2e8f0] bg-[#f8fafc] px-2 py-0.5 text-[11px] font-medium text-[#475569] dark:border-[#232736] dark:bg-[#141721] dark:text-[#9098ac]"
                        >
                          {equipmentMap.get(id) || id}
                        </span>
                      ))}
                    </div>

                    {/* Card Footer: Link Xem chi tiết */}
                    <div className="mt-auto flex items-center justify-between border-t border-[#edf2f7] pt-3.5 dark:border-[#1c202d]">
                      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-[#4f46e5] transition-all group-hover:gap-2 dark:text-[#818cf8]">
                        <span>Xem chi tiết động tác</span>
                        <span>→</span>
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          /* Chế độ List View */
          <div className="flex flex-col gap-3 mb-10">
            {paginatedExercises.map(exercise => {
              const mediaImage = exercise.media?.find(m => m.kind === 'IMAGE')?.url;
              return (
                <article
                  key={exercise.id}
                  onClick={() => setPreviewExercise(exercise)}
                  className="group flex h-[110px] cursor-pointer items-center overflow-hidden rounded-[12px] border border-[#e2e8f0] bg-white transition-all hover:border-[#6366f1]/50 dark:border-[#232736] dark:bg-[#151822]"
                >
                  <div
                    className="flex h-full w-[140px] shrink-0 items-center justify-center border-r border-[#edf2f7] dark:border-[#1c202d]"
                    style={{ backgroundColor: '#f4efe6' }}
                  >
                    {mediaImage ? (
                      <img
                        src={mediaImage}
                        alt={exercise.nameVi}
                        className="h-16 w-16 object-contain"
                        loading="lazy"
                      />
                    ) : (
                      <ExerciseBlueprintArt
                        exerciseId={exercise.slug || exercise.id}
                        className="h-16 w-16 object-contain"
                      />
                    )}
                  </div>
                  <div className="flex flex-1 items-center justify-between px-6">
                    <div>
                      <h4 className="text-[15px] font-bold text-[#0f172a] group-hover:text-[#4f46e5] dark:text-[#f1f3f9] dark:group-hover:text-[#6366f1]">
                        {exercise.nameVi}
                      </h4>
                      <div className="text-[12px] italic text-[#94a3b8] dark:text-[#596277]">
                        {exercise.nameEn || exercise.slug}
                      </div>
                      {Object.hasOwn(poseLinks, exercise.id) && <Link
                        href={'/?exercise=' + encodeURIComponent(poseLinks[exercise.id])}
                        onClick={event => event.stopPropagation()}
                        aria-label={`Tập tại phòng tập: ${exercise.nameVi}`}
                        className="text-xs font-medium text-primary hover:underline">Phòng tập</Link>}
                    </div>
                    <div className="font-mono text-xs text-[#475569] dark:text-[#9098ac]">
                      {exercise.summary}
                    </div>
                    <span className="text-[12.5px] font-bold text-[#4f46e5] dark:text-[#818cf8]">
                      Chi tiết →
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* ─── 4. PAGINATION (DỮ LIỆU THẬT) ─── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-[#edf2f7] pt-5 dark:border-[#1c202d]">
          <div className="font-mono text-[12.5px] text-[#94a3b8] dark:text-[#596277]">
            Trang {currentPage} / {totalPages} · Tổng cộng {totalFilteredCount} bài tập
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={pending || currentPage <= 1}
              onClick={() => navigate({ page: String(currentPage - 1) })}
              className="inline-flex h-[34px] items-center justify-center rounded-[6px] border border-[#e2e8f0] bg-white px-3 text-[12.5px] font-semibold text-[#475569] transition-all hover:bg-[#f3f6fc] disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#232736] dark:bg-[#151822] dark:text-[#9098ac]"
            >
              ← Trước
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
              const active = page === currentPage;
              return (
                <button
                  key={page}
                  type="button"
                  disabled={pending}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => navigate({ page: String(page) })}
                  className={cn(
                    'inline-flex h-[34px] min-w-[34px] items-center justify-center rounded-[6px] border px-2.5 font-mono text-[12.5px] font-bold transition-all',
                    active
                      ? 'border-[#4f46e5] bg-[#4f46e5] text-white shadow-[0_2px_8px_rgba(79,70,229,0.3)] dark:border-[#6366f1] dark:bg-[#6366f1]'
                      : 'border-[#e2e8f0] bg-white text-[#475569] hover:bg-[#f3f6fc] dark:border-[#232736] dark:bg-[#151822] dark:text-[#9098ac]',
                  )}
                >
                  {page}
                </button>
              );
            })}

            <button
              type="button"
              disabled={pending || currentPage >= totalPages}
              onClick={() => navigate({ page: String(currentPage + 1) })}
              className="inline-flex h-[34px] items-center justify-center rounded-[6px] border border-[#e2e8f0] bg-white px-3 text-[12.5px] font-semibold text-[#475569] transition-all hover:bg-[#f3f6fc] disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#232736] dark:bg-[#151822] dark:text-[#9098ac]"
            >
              Sau →
            </button>
          </div>
        </div>
      </main>

      {/* ─── 5. SLIDE-OUT FILTER DRAWER (TRƯỢT TỪ BÊN PHẢI THEO YÊU CẦU NGƯỜI DÙNG) ─── */}
      {drawerOpen && (
        <>
          <div
            className="fixed inset-0 z-[100] bg-black/65 backdrop-blur-xs animate-in fade-in-0 duration-200"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="fixed inset-y-0 right-0 z-[110] flex w-[360px] max-w-[85vw] flex-col border-l border-[#e2e8f0] bg-white shadow-2xl animate-in slide-in-from-right duration-200 dark:border-[#232736] dark:bg-[#141721]">
            <div className="flex items-center justify-between border-b border-[#e2e8f0] px-5 py-4 dark:border-[#232736]">
              <div className="flex items-center gap-2 text-[14px] font-bold">
                <SlidersHorizontal size={16} className="text-[#4f46e5] dark:text-[#6366f1]" />
                <span>BỘ LỌC CHI TIẾT</span>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-md p-1.5 text-[#94a3b8] hover:bg-slate-100 hover:text-[#0f172a] dark:text-[#596277] dark:hover:bg-[#1b1f2c] dark:hover:text-[#f1f3f9]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Group 1: Loại hình bài tập */}
              <div>
                <div className="mb-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-[#94a3b8] dark:text-[#596277]">
                  Loại hình bài tập
                </div>
                <div className="space-y-2">
                  {WORKOUT_TYPES.map(type => {
                    const checked = selectedTypes.includes(type.id);
                    const count = facets?.workoutTypes?.[type.id] ?? 0;
                    return (
                      <label
                        key={type.id}
                        className="flex cursor-pointer items-center justify-between rounded-[6px] border border-[#edf2f7] bg-[#f8fafc] px-3 py-2 text-[12.5px] transition-colors hover:bg-slate-100 dark:border-[#1c202d] dark:bg-[#151822] dark:hover:bg-[#1b1f2c]"
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            disabled={pending}
                            checked={checked}
                            onChange={() => toggleFilter('workoutTypes', 'workoutType', selectedTypes, type.id)}
                            className="h-4 w-4 rounded accent-[#4f46e5]"
                          />
                          <span className="font-medium">{type.label}</span>
                        </div>
                        <span className="font-mono text-[11px] text-[#94a3b8] dark:text-[#596277]">
                          {count}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Group 2: Mức độ khó */}
              <div>
                <div className="mb-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-[#94a3b8] dark:text-[#596277]">
                  Mức độ kỹ thuật
                </div>
                <div className="space-y-2">
                  {DIFFICULTY_LEVELS.map(level => {
                    const checked = selectedDifficulties.includes(level.id);
                    const count = facets?.difficulties?.[String(level.id)] ?? 0;
                    return (
                      <label
                        key={level.id}
                        className="flex cursor-pointer items-center justify-between rounded-[6px] border border-[#edf2f7] bg-[#f8fafc] px-3 py-2 text-[12.5px] transition-colors hover:bg-slate-100 dark:border-[#1c202d] dark:bg-[#151822] dark:hover:bg-[#1b1f2c]"
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            disabled={pending}
                            checked={checked}
                            onChange={() => toggleFilter('difficulties', 'difficulty', selectedDifficulties, level.id)}
                            className="h-4 w-4 rounded accent-[#4f46e5]"
                          />
                          <span className="font-medium">{level.label}</span>
                        </div>
                        <span className="font-mono text-[11px] text-[#94a3b8] dark:text-[#596277]">
                          {count}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Group 3: Thiết bị & Dụng cụ thật */}
              {equipmentList.length > 0 && (
                <div>
                  <div className="mb-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-[#94a3b8] dark:text-[#596277]">
                    Thiết bị & Dụng cụ
                  </div>
                  <div className="space-y-2">
                    {equipmentList.map(item => {
                      const checked = selectedEquipment.includes(item.id);
                      const count = facets?.equipment?.[item.id] ?? 0;
                      return (
                        <label
                          key={item.id}
                          className="flex cursor-pointer items-center justify-between rounded-[6px] border border-[#edf2f7] bg-[#f8fafc] px-3 py-2 text-[12.5px] transition-colors hover:bg-slate-100 dark:border-[#1c202d] dark:bg-[#151822] dark:hover:bg-[#1b1f2c]"
                        >
                          <div className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              disabled={pending}
                              checked={checked}
                              onChange={() => toggleFilter('equipmentIds', 'equipmentId', selectedEquipment, item.id)}
                              className="h-4 w-4 rounded accent-[#4f46e5]"
                            />
                            <span className="font-medium">{item.labelVi}</span>
                          </div>
                          <span className="font-mono text-[11px] text-[#94a3b8] dark:text-[#596277]">
                            {count}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2.5 border-t border-[#e2e8f0] p-4 dark:border-[#232736]">
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="flex-1 rounded-[8px] bg-[#4f46e5] py-2.5 text-[13px] font-bold text-white shadow-md hover:bg-[#4338ca] dark:bg-[#6366f1]"
              >
                Áp dụng bộ lọc
              </button>
              <button
                type="button"
                onClick={() => navigate({ workoutTypes: '', workoutType: '', difficulties: '', difficulty: '', equipmentIds: '', equipmentId: '' })}
                className="rounded-[8px] border border-[#e2e8f0] px-4 py-2.5 text-[13px] font-medium text-[#475569] hover:bg-slate-100 dark:border-[#232736] dark:text-[#9098ac]"
              >
                Xóa
              </button>
            </div>
          </aside>
        </>
      )}

      {/* ─── 5. QUICK PREVIEW / DETAIL MODAL (OPTION A ARCHITECTURAL MODAL) ─── */}
      {previewExercise && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="previewModalTitle"
          className="fixed inset-0 z-[120] flex items-center justify-center p-3.5 sm:p-6 bg-black/75 backdrop-blur-md animate-in fade-in-0 duration-200"
          onClick={e => {
            if (e.target === e.currentTarget) setPreviewExercise(null);
          }}
        >
          <div className="relative flex w-[720px] max-w-[96vw] max-h-[90vh] flex-col overflow-hidden rounded-[18px] sm:rounded-[22px] border border-[#e2e8f0] bg-white shadow-2xl dark:border-[#232736] dark:bg-[#12141c] animate-in zoom-in-95 duration-200">
            {/* Banner hiển thị Poster Architectural (Chiều cao 260px) */}
            <div
              className="relative flex h-[230px] sm:h-[260px] w-full items-center justify-center overflow-hidden border-b border-[#e2e8f0] select-none dark:border-[#232736]"
              style={{
                backgroundColor: '#f4efe6',
                backgroundImage:
                  'linear-gradient(to right, rgba(17, 19, 23, 0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(17, 19, 23, 0.06) 1px, transparent 1px)',
                backgroundSize: '20px 20px',
              }}
            >
              {/* Viền đứt nét dashed bên trong */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-3 rounded-[6px]"
                style={{ border: '1px dashed rgba(24, 26, 32, 0.14)' }}
              />

              {/* Nút đóng tròn góc trên bên phải */}
              <button
                type="button"
                onClick={() => setPreviewExercise(null)}
                aria-label="Đóng cửa sổ"
                className="absolute top-3.5 right-3.5 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-[#0f172a]/80 text-white border border-white/20 transition-all hover:scale-110 hover:bg-[#0f172a]"
              >
                <X size={16} />
              </button>

              {/* Badges góc trên bên trái */}
              <div className="absolute top-3.5 left-3.5 z-10 flex items-center gap-2">
                <span className="font-mono text-[10px] font-bold tracking-[0.06em] uppercase rounded-[4px] bg-[rgba(15,23,42,0.88)] text-white px-2.5 py-0.5 shadow-sm border border-white/10">
                  {previewExercise.workoutType || 'SỨC MẠNH'}
                </span>
                <span className="font-mono text-[10px] font-bold tracking-[0.05em] uppercase rounded-[4px] bg-[#4f46e5] text-white px-2.5 py-0.5 shadow-sm dark:bg-[#6366f1]">
                  ARCHITECTURAL SPEC
                </span>
              </div>

              {/* Artwork SVG Blueprint */}
              <div className="relative z-1 flex h-[82%] w-[82%] max-h-[210px] items-center justify-center">
                {previewExercise.media?.find(m => m.kind === 'IMAGE')?.url ? (
                  <img
                    src={previewExercise.media.find(m => m.kind === 'IMAGE')!.url}
                    alt={previewExercise.nameVi}
                    className="h-full w-auto max-h-[210px] object-contain filter drop-shadow-[0_6px_14px_rgba(0,0,0,0.14)]"
                  />
                ) : (
                  <ExerciseBlueprintArt
                    exerciseId={previewExercise.slug || previewExercise.id}
                    className="h-full w-auto max-h-[210px] object-contain filter drop-shadow-[0_6px_14px_rgba(0,0,0,0.14)]"
                  />
                )}
              </div>
            </div>

            {/* Nội dung cuộn dọc (Modal Body Scroll) */}
            <div className="flex flex-col gap-4 overflow-y-auto p-5 sm:p-7">
              {/* Hàng Tiêu đề + Độ khó */}
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2.5">
                <div>
                  <h2
                    id="previewModalTitle"
                    className="text-[20px] font-extrabold tracking-[-0.02em] text-[#0f172a] dark:text-[#f1f3f9]"
                  >
                    {previewExercise.nameVi}
                  </h2>
                  <div className="text-[13px] italic text-[#64748b] dark:text-[#9098ac]">
                    {previewExercise.nameEn || previewExercise.slug}
                  </div>
                </div>

                <span
                  className="inline-flex self-start sm:self-auto rounded-[6px] px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wider text-white shadow-sm"
                  style={{
                    backgroundColor:
                      DIFFICULTY_LEVELS.find(d => d.id === previewExercise.difficulty)?.bg ||
                      '#10b981',
                  }}
                >
                  {DIFFICULTY_LEVELS.find(d => d.id === previewExercise.difficulty)?.text ||
                    'CẤP II'}
                </span>
              </div>

              <p className="text-sm leading-relaxed text-muted-foreground">{previewExercise.summary}</p>
              {!!previewExercise.instructions?.length && <div className="space-y-2">
                <h3 className="font-semibold">Cách thực hiện</h3>
                <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                  {previewExercise.instructions.map((step, index) => <li key={index}>{step}</li>)}
                </ol>
              </div>}
            </div>

            {/* Modal Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[#e2e8f0] bg-white px-5 sm:px-7 py-3.5 dark:border-[#232736] dark:bg-[#12141c]">
              <div className="flex items-center gap-3 text-[12px] text-[#94a3b8] dark:text-[#596277]">
                <span>
                  Nhấn <kbd className="rounded border border-[#e2e8f0] bg-[#f8fafc] px-1.5 py-0.5 font-mono text-[10.5px] dark:border-[#232736] dark:bg-[#191d28]">ESC</kbd> để đóng
                </span>
                <span>·</span>
                <Link
                  href={`/bai-tap/${previewExercise.slug || previewExercise.id}`}
                  className="font-semibold text-[#4f46e5] hover:underline dark:text-[#818cf8]"
                >
                  Xem trang đầy đủ →
                </Link>
              </div>

              {previewPoseId && <Link
                href={'/?exercise=' + encodeURIComponent(previewPoseId)}
                className="inline-flex h-[38px] sm:h-[40px] items-center gap-2 rounded-[10px] bg-gradient-to-r from-[#6366f1] to-[#4f46e5] px-4 sm:px-5 text-[12.5px] sm:text-[13px] font-bold text-white shadow-[0_4px_16px_rgba(99,102,241,0.35)] transition-all hover:scale-[1.02] hover:shadow-[0_6px_22px_rgba(99,102,241,0.5)]"
              >
                <Sparkles size={15} />
                <span>Tập tại phòng tập</span>
              </Link>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
