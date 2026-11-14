'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowUpRight, Calendar, Check, Dumbbell, Plus, RotateCcw, Sparkles, X } from 'lucide-react';
import { type ExerciseCard } from '../app/catalog';
import { cn } from '../lib/utils';

type ProgramId = 'full_body' | 'upper_lower' | 'ppl' | 'bodyweight';

type PlannedExercise = {
  id: string;
  slug: string;
  nameVi: string;
  sets: string;
  rest: string;
  done?: boolean;
};

type DayPlan = {
  dayIndex: number;
  shortLabel: string;
  fullLabel: string;
  title: string;
  durationMin: number;
  isRest?: boolean;
  exercises: PlannedExercise[];
};

type ProgramTemplate = {
  id: ProgramId;
  label: string;
  tagline: string;
  frequency: string;
  level: string;
  days: DayPlan[];
};

const PROGRAM_TEMPLATES: ProgramTemplate[] = [
  {
    id: 'full_body',
    label: 'Full Body · 3 buổi',
    tagline: 'Kích hoạt toàn bộ nhóm cơ lớn 3 lần/tuần, xen kẽ ngày nghỉ phục hồi 48 giờ.',
    frequency: '3 buổi / tuần',
    level: 'Cơ bản – Trung bình',
    days: [
      {
        dayIndex: 0,
        shortLabel: 'T2',
        fullLabel: 'Thứ Hai',
        title: 'Toàn thân A — Trọng tâm Đùi & Đẩy ngực',
        durationMin: 45,
        exercises: [
          { id: 'fb-1', slug: 'squat-khong-ta', nameVi: 'Squat không tạ', sets: '4 hiệp × 12 lần', rest: '90s' },
          { id: 'fb-2', slug: 'chong-day', nameVi: 'Chống đẩy cơ bản', sets: '4 hiệp × 10 lần', rest: '90s' },
          { id: 'fb-3', slug: 'chung-chan-ve-truoc-luan-phien', nameVi: 'Chùng chân về trước luân phiên', sets: '3 hiệp × 12 lần', rest: '60s' },
          { id: 'fb-4', slug: 'plank-khuyu-tay', nameVi: 'Plank khuỷu tay', sets: '3 hiệp × 45 giây', rest: '60s' },
        ],
      },
      {
        dayIndex: 1,
        shortLabel: 'T3',
        fullLabel: 'Thứ Ba',
        title: 'Nghỉ phục hồi chủ động',
        durationMin: 15,
        isRest: true,
        exercises: [],
      },
      {
        dayIndex: 2,
        shortLabel: 'T4',
        fullLabel: 'Thứ Tư',
        title: 'Toàn thân B — Trọng tâm Lưng xô & Cơ mông',
        durationMin: 45,
        exercises: [
          { id: 'fb-5', slug: 'keo-xa-don', nameVi: 'Kéo xà đơn', sets: '4 hiệp × 8 lần', rest: '120s' },
          { id: 'fb-6', slug: 'nang-hong-mot-chan-luan-phien', nameVi: 'Nâng hông một chân luân phiên', sets: '3 hiệp × 12 lần', rest: '60s' },
          { id: 'fb-7', slug: 'chong-day-yoga', nameVi: 'Chống đẩy Yoga', sets: '3 hiệp × 10 lần', rest: '90s' },
          { id: 'fb-8', slug: 'gap-bung-nguoc', nameVi: 'Gập bụng ngược', sets: '3 hiệp × 15 lần', rest: '60s' },
        ],
      },
      {
        dayIndex: 3,
        shortLabel: 'T5',
        fullLabel: 'Thứ Năm',
        title: 'Nghỉ phục hồi chủ động',
        durationMin: 15,
        isRest: true,
        exercises: [],
      },
      {
        dayIndex: 4,
        shortLabel: 'T6',
        fullLabel: 'Thứ Sáu',
        title: 'Toàn thân C — Sức mạnh & Sức bền',
        durationMin: 50,
        exercises: [
          { id: 'fb-9', slug: 'ganh-ta-don', nameVi: 'Gánh tạ đòn (Barbell Squat)', sets: '4 hiệp × 8 lần', rest: '120s' },
          { id: 'fb-10', slug: 'day-nguc-nam-voi-thanh-ta', nameVi: 'Đẩy ngực nằm với thanh tạ', sets: '4 hiệp × 8 lần', rest: '120s' },
          { id: 'fb-11', slug: 'plank-nghieng', nameVi: 'Plank nghiêng', sets: '3 hiệp × 40 giây', rest: '60s' },
        ],
      },
      {
        dayIndex: 5,
        shortLabel: 'T7',
        fullLabel: 'Thứ Bảy',
        title: 'Nghỉ ngơi & Giãn cơ nhẹ',
        durationMin: 20,
        isRest: true,
        exercises: [],
      },
      {
        dayIndex: 6,
        shortLabel: 'CN',
        fullLabel: 'Chủ Nhật',
        title: 'Nghỉ hoàn toàn',
        durationMin: 0,
        isRest: true,
        exercises: [],
      },
    ],
  },
  {
    id: 'upper_lower',
    label: 'Upper / Lower · 4 buổi',
    tagline: 'Tách riêng ngày Thân trên và Thân dưới để tăng khối lượng tập trên mỗi nhóm cơ.',
    frequency: '4 buổi / tuần',
    level: 'Trung bình',
    days: [
      {
        dayIndex: 0,
        shortLabel: 'T2',
        fullLabel: 'Thứ Hai',
        title: 'Thân trên A — Ngực, Lưng xô, Vai',
        durationMin: 50,
        exercises: [
          { id: 'ul-1', slug: 'day-nguc-nam-voi-thanh-ta', nameVi: 'Đẩy ngực nằm với thanh tạ', sets: '4 hiệp × 8 lần', rest: '120s' },
          { id: 'ul-2', slug: 'keo-xa-don', nameVi: 'Kéo xà đơn', sets: '4 hiệp × 8 lần', rest: '120s' },
          { id: 'ul-3', slug: 'chong-day-nguoi-nhin', nameVi: 'Chống đẩy kiểu người nhện', sets: '3 hiệp × 10 lần', rest: '90s' },
        ],
      },
      {
        dayIndex: 1,
        shortLabel: 'T3',
        fullLabel: 'Thứ Ba',
        title: 'Thân dưới A — Đùi trước, Đùi sau, Bắp chân',
        durationMin: 50,
        exercises: [
          { id: 'ul-4', slug: 'ganh-ta-don', nameVi: 'Gánh tạ đòn (Barbell Squat)', sets: '4 hiệp × 8 lần', rest: '120s' },
          { id: 'ul-5', slug: 'chung-chan-ve-truoc-luan-phien', nameVi: 'Chùng chân về trước luân phiên', sets: '3 hiệp × 12 lần', rest: '90s' },
          { id: 'ul-6', slug: 'squat-bat-nhay', nameVi: 'Squat bật nhảy', sets: '3 hiệp × 12 lần', rest: '90s' },
        ],
      },
      {
        dayIndex: 2,
        shortLabel: 'T4',
        fullLabel: 'Thứ Tư',
        title: 'Nghỉ phục hồi',
        durationMin: 0,
        isRest: true,
        exercises: [],
      },
      {
        dayIndex: 3,
        shortLabel: 'T5',
        fullLabel: 'Thứ Năm',
        title: 'Thân trên B — Kiểm soát & Cơ trọng tâm',
        durationMin: 45,
        exercises: [
          { id: 'ul-7', slug: 'chong-day', nameVi: 'Chống đẩy cơ bản', sets: '4 hiệp × 12 lần', rest: '90s' },
          { id: 'ul-8', slug: 'plank-cao', nameVi: 'Plank cao', sets: '3 hiệp × 60 giây', rest: '60s' },
          { id: 'ul-9', slug: 'gap-bung-chu-v-luan-phien', nameVi: 'Gập bụng chữ V luân phiên', sets: '3 hiệp × 15 lần', rest: '60s' },
        ],
      },
      {
        dayIndex: 4,
        shortLabel: 'T6',
        fullLabel: 'Thứ Sáu',
        title: 'Thân dưới B — Cơ mông & Độ linh hoạt hông',
        durationMin: 45,
        exercises: [
          { id: 'ul-10', slug: 'chung-chan-sang-ngang-luan-phien', nameVi: 'Chùng chân sang ngang luân phiên', sets: '4 hiệp × 12 lần', rest: '90s' },
          { id: 'ul-11', slug: 'nang-hong-mot-chan-luan-phien', nameVi: 'Nâng hông một chân luân phiên', sets: '4 hiệp × 12 lần', rest: '60s' },
          { id: 'ul-12', slug: 'plank-khuyu-tay', nameVi: 'Plank khuỷu tay', sets: '3 hiệp × 45 giây', rest: '60s' },
        ],
      },
      {
        dayIndex: 5,
        shortLabel: 'T7',
        fullLabel: 'Thứ Bảy',
        title: 'Nghỉ phục hồi',
        durationMin: 0,
        isRest: true,
        exercises: [],
      },
      {
        dayIndex: 6,
        shortLabel: 'CN',
        fullLabel: 'Chủ Nhật',
        title: 'Nghỉ hoàn toàn',
        durationMin: 0,
        isRest: true,
        exercises: [],
      },
    ],
  },
  {
    id: 'ppl',
    label: 'Push / Pull / Legs',
    tagline: 'Phân nhóm các cơ có cùng chức năng Đẩy – Kéo – Chân để tối ưu cường độ tập.',
    frequency: '3–6 buổi / tuần',
    level: 'Trung – Nâng cao',
    days: [
      {
        dayIndex: 0,
        shortLabel: 'T2',
        fullLabel: 'Thứ Hai',
        title: 'Push (Ngày Đẩy) — Ngực, Vai, Tay sau',
        durationMin: 50,
        exercises: [
          { id: 'ppl-1', slug: 'day-nguc-nam-voi-thanh-ta', nameVi: 'Đẩy ngực nằm với thanh tạ', sets: '4 hiệp × 8 lần', rest: '120s' },
          { id: 'ppl-2', slug: 'chong-day', nameVi: 'Chống đẩy cơ bản', sets: '4 hiệp × 12 lần', rest: '90s' },
          { id: 'ppl-3', slug: 'chong-day-yoga', nameVi: 'Chống đẩy Yoga', sets: '3 hiệp × 10 lần', rest: '90s' },
        ],
      },
      {
        dayIndex: 1,
        shortLabel: 'T3',
        fullLabel: 'Thứ Ba',
        title: 'Pull (Ngày Kéo) — Lưng xô, Tay trước, Core',
        durationMin: 50,
        exercises: [
          { id: 'ppl-4', slug: 'keo-xa-don', nameVi: 'Kéo xà đơn', sets: '4 hiệp × 8 lần', rest: '120s' },
          { id: 'ppl-5', slug: 'gap-bung-nguoc', nameVi: 'Gập bụng ngược', sets: '4 hiệp × 15 lần', rest: '60s' },
          { id: 'ppl-6', slug: 'plank-nghieng', nameVi: 'Plank nghiêng', sets: '3 hiệp × 45 giây', rest: '60s' },
        ],
      },
      {
        dayIndex: 2,
        shortLabel: 'T4',
        fullLabel: 'Thứ Tư',
        title: 'Legs (Ngày Chân) — Đùi trước, Đùi sau, Mông',
        durationMin: 55,
        exercises: [
          { id: 'ppl-7', slug: 'ganh-ta-don', nameVi: 'Gánh tạ đòn (Barbell Squat)', sets: '4 hiệp × 8 lần', rest: '120s' },
          { id: 'ppl-8', slug: 'chung-chan-ve-truoc-luan-phien', nameVi: 'Chùng chân về trước luân phiên', sets: '4 hiệp × 12 lần', rest: '90s' },
          { id: 'ppl-9', slug: 'nang-hong-mot-chan-luan-phien', nameVi: 'Nâng hông một chân luân phiên', sets: '3 hiệp × 12 lần', rest: '60s' },
        ],
      },
      {
        dayIndex: 3,
        shortLabel: 'T5',
        fullLabel: 'Thứ Năm',
        title: 'Nghỉ giữa chu kỳ',
        durationMin: 0,
        isRest: true,
        exercises: [],
      },
      {
        dayIndex: 4,
        shortLabel: 'T6',
        fullLabel: 'Thứ Sáu',
        title: 'Push & Core — Sức bền thân trên',
        durationMin: 45,
        exercises: [
          { id: 'ppl-10', slug: 'chong-day-nguoi-nhin', nameVi: 'Chống đẩy kiểu người nhện', sets: '4 hiệp × 10 lần', rest: '90s' },
          { id: 'ppl-11', slug: 'plank-khuyu-tay', nameVi: 'Plank khuỷu tay', sets: '3 hiệp × 60 giây', rest: '60s' },
        ],
      },
      {
        dayIndex: 5,
        shortLabel: 'T7',
        fullLabel: 'Thứ Bảy',
        title: 'Legs & HIIT — Sức mạnh bùng nổ thân dưới',
        durationMin: 45,
        exercises: [
          { id: 'ppl-12', slug: 'squat-bat-nhay', nameVi: 'Squat bật nhảy', sets: '4 hiệp × 12 lần', rest: '90s' },
          { id: 'ppl-13', slug: 'chung-chan-bat-nhay', nameVi: 'Chùng chân bật nhảy', sets: '3 hiệp × 12 lần', rest: '90s' },
        ],
      },
      {
        dayIndex: 6,
        shortLabel: 'CN',
        fullLabel: 'Chủ Nhật',
        title: 'Nghỉ hoàn toàn',
        durationMin: 0,
        isRest: true,
        exercises: [],
      },
    ],
  },
  {
    id: 'bodyweight',
    label: 'Tại nhà · Không dụng cụ',
    tagline: 'Lộ trình tập luyện 100% bằng trọng lượng cơ thể ngay tại phòng cá nhân.',
    frequency: '4 buổi / tuần',
    level: 'Mọi trình độ',
    days: [
      {
        dayIndex: 0,
        shortLabel: 'T2',
        fullLabel: 'Thứ Hai',
        title: 'Thân trên & Cơ bụng tại nhà',
        durationMin: 35,
        exercises: [
          { id: 'bw-1', slug: 'chong-day', nameVi: 'Chống đẩy cơ bản', sets: '4 hiệp × 12 lần', rest: '60s' },
          { id: 'bw-2', slug: 'plank-khuyu-tay', nameVi: 'Plank khuỷu tay', sets: '3 hiệp × 45 giây', rest: '60s' },
          { id: 'bw-3', slug: 'gap-bung-nguoc', nameVi: 'Gập bụng ngược', sets: '3 hiệp × 15 lần', rest: '60s' },
        ],
      },
      {
        dayIndex: 1,
        shortLabel: 'T3',
        fullLabel: 'Thứ Ba',
        title: 'Thân dưới & Khớp hông tại nhà',
        durationMin: 35,
        exercises: [
          { id: 'bw-4', slug: 'squat-khong-ta', nameVi: 'Squat không tạ', sets: '4 hiệp × 15 lần', rest: '60s' },
          { id: 'bw-5', slug: 'chung-chan-ve-truoc-luan-phien', nameVi: 'Chùng chân về trước luân phiên', sets: '3 hiệp × 12 lần', rest: '60s' },
          { id: 'bw-6', slug: 'nang-hong-mot-chan-luan-phien', nameVi: 'Nâng hông một chân luân phiên', sets: '3 hiệp × 12 lần', rest: '60s' },
        ],
      },
      {
        dayIndex: 2,
        shortLabel: 'T4',
        fullLabel: 'Thứ Tư',
        title: 'Nghỉ phục hồi',
        durationMin: 0,
        isRest: true,
        exercises: [],
      },
      {
        dayIndex: 3,
        shortLabel: 'T5',
        fullLabel: 'Thứ Năm',
        title: 'Cardio & Đốt mỡ toàn thân',
        durationMin: 30,
        exercises: [
          { id: 'bw-7', slug: 'bat-nhay-vung-tay', nameVi: 'Bật nhảy vung tay (Jumping Jacks)', sets: '4 hiệp × 45 giây', rest: '45s' },
          { id: 'bw-8', slug: 'nhay-day-tuong-tuong', nameVi: 'Nhảy dây tưởng tượng', sets: '4 hiệp × 60 giây', rest: '45s' },
          { id: 'bw-9', slug: 'squat-da-chan', nameVi: 'Squat đá chân', sets: '3 hiệp × 12 lần', rest: '60s' },
        ],
      },
      {
        dayIndex: 4,
        shortLabel: 'T6',
        fullLabel: 'Thứ Sáu',
        title: 'Sức bền Core & Linh hoạt',
        durationMin: 30,
        exercises: [
          { id: 'bw-10', slug: 'plank-cao', nameVi: 'Plank cao', sets: '3 hiệp × 60 giây', rest: '60s' },
          { id: 'bw-11', slug: 'plank-nghieng', nameVi: 'Plank nghiêng', sets: '3 hiệp × 40 giây', rest: '60s' },
          { id: 'bw-12', slug: 'chong-day-yoga', nameVi: 'Chống đẩy Yoga', sets: '3 hiệp × 10 lần', rest: '60s' },
        ],
      },
      {
        dayIndex: 5,
        shortLabel: 'T7',
        fullLabel: 'Thứ Bảy',
        title: 'Nghỉ phục hồi',
        durationMin: 0,
        isRest: true,
        exercises: [],
      },
      {
        dayIndex: 6,
        shortLabel: 'CN',
        fullLabel: 'Chủ Nhật',
        title: 'Nghỉ hoàn toàn',
        durationMin: 0,
        isRest: true,
        exercises: [],
      },
    ],
  },
];

const STORAGE_KEY = 'smartgym_weekly_plan_v1';

export function WorkoutPlanner({ catalogExercises }: { catalogExercises: ExerciseCard[] }) {
  const [programId, setProgramId] = React.useState<ProgramId>('full_body');
  const [selectedDay, setSelectedDay] = React.useState<number>(0);
  const [customDaysByProgram, setCustomDaysByProgram] = React.useState<
    Record<string, DayPlan[]>
  >({});
  const [selectedAddSlug, setSelectedAddSlug] = React.useState<string>(
    catalogExercises[0]?.slug ?? '',
  );
  const [selectedAddSets, setSelectedAddSets] = React.useState<string>('3 hiệp × 12 lần');

  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') setCustomDaysByProgram(parsed);
      }
    } catch {}
  }, []);

  function saveState(next: Record<string, DayPlan[]>) {
    setCustomDaysByProgram(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }

  const template = PROGRAM_TEMPLATES.find(p => p.id === programId) ?? PROGRAM_TEMPLATES[0];
  const days = customDaysByProgram[programId] ?? template.days;
  const activeDay = days[selectedDay] ?? days[0];

  const totalWeeklySessions = days.filter(d => d.exercises.length > 0).length;
  const totalDayExercises = activeDay.exercises.length;
  const completedDayExercises = activeDay.exercises.filter(e => e.done).length;

  function updateActiveDay(updater: (day: DayPlan) => DayPlan) {
    const nextDays = days.map((d, idx) => (idx === selectedDay ? updater(d) : d));
    saveState({ ...customDaysByProgram, [programId]: nextDays });
  }

  function toggleExerciseDone(id: string) {
    updateActiveDay(day => ({
      ...day,
      exercises: day.exercises.map(ex => (ex.id === id ? { ...ex, done: !ex.done } : ex)),
    }));
  }

  function removeExercise(id: string) {
    updateActiveDay(day => {
      const nextList = day.exercises.filter(ex => ex.id !== id);
      return {
        ...day,
        isRest: nextList.length === 0,
        exercises: nextList,
      };
    });
  }

  function handleAddExercise(e: React.FormEvent) {
    e.preventDefault();
    const found = catalogExercises.find(x => x.slug === selectedAddSlug);
    if (!found) return;
    updateActiveDay(day => ({
      ...day,
      isRest: false,
      title: day.isRest ? `Buổi tập ${day.fullLabel}` : day.title,
      durationMin: Math.max(30, day.durationMin || 40),
      exercises: [
        ...day.exercises,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          slug: found.slug,
          nameVi: found.nameVi,
          sets: selectedAddSets.trim() || '3 hiệp × 12 lần',
          rest: `${found.restSeconds ?? 60}s`,
          done: false,
        },
      ],
    }));
  }

  function resetCurrentProgram() {
    const copy = { ...customDaysByProgram };
    delete copy[programId];
    saveState(copy);
  }

  return (
    <div className="mx-auto max-w-[1080px] space-y-8 pt-4 pb-16">
      {/* Header đồng bộ ngôn ngữ thiết kế SmartGym */}
      <header className="flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-1 text-xs font-semibold text-primary">
          <Sparkles size={13} />
          <span>Lộ trình tập luyện cá nhân hóa</span>
        </div>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          Kế hoạch tập luyện
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {template.tagline}
        </p>

        {/* Thanh chuyển đổi lộ trình dạng Tabs đồng bộ hệ thống */}
        <div
          role="tablist"
          aria-label="Chọn lộ trình tập luyện"
          className="mt-6 inline-flex flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-border bg-card/85 p-1.5 text-xs font-semibold shadow-xs backdrop-blur-md"
        >
          {PROGRAM_TEMPLATES.map(prog => (
            <button
              key={prog.id}
              type="button"
              role="tab"
              aria-selected={programId === prog.id}
              onClick={() => {
                setProgramId(prog.id);
                setSelectedDay(0);
              }}
              className={cn(
                'cursor-pointer rounded-xl px-4 py-2 transition-all font-semibold',
                programId === prog.id
                  ? 'bg-[#6366f1] text-white shadow-xs'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {prog.label}
            </button>
          ))}
        </div>
      </header>

      {/* Thanh lịch 7 ngày trong tuần */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-xs backdrop-blur-sm sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Lịch tuần hiện tại
            </span>
            <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {totalWeeklySessions} buổi tập / tuần
            </span>
          </div>
          {customDaysByProgram[programId] && (
            <button
              type="button"
              onClick={resetCurrentProgram}
              className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              <RotateCcw size={13} />
              <span>Khôi phục lịch mẫu</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-7 gap-2 sm:gap-3">
          {days.map((day, idx) => {
            const active = selectedDay === idx;
            const hasWorkout = day.exercises.length > 0;
            const allDone = hasWorkout && day.exercises.every(e => e.done);
            return (
              <button
                key={day.shortLabel}
                type="button"
                onClick={() => setSelectedDay(idx)}
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-between rounded-xl p-2 sm:p-3.5 text-center transition-all border',
                  active
                    ? 'border-[#6366f1] bg-[#6366f1] text-white shadow-md shadow-[#6366f1]/25'
                    : 'border-border/60 bg-muted/40 text-foreground hover:bg-muted hover:border-border',
                )}
              >
                <span
                  className={cn(
                    'hidden text-[11px] font-medium sm:block',
                    active ? 'text-white/85' : 'text-muted-foreground',
                  )}
                >
                  {day.fullLabel}
                </span>
                <strong className="text-sm font-bold tracking-tight sm:mt-1 sm:text-base">
                  {day.shortLabel}
                </strong>
                <span
                  className={cn(
                    'mt-1.5 h-1.5 w-1.5 rounded-full sm:mt-2',
                    allDone
                      ? 'bg-emerald-400'
                      : hasWorkout
                        ? active
                          ? 'bg-white'
                          : 'bg-[#6366f1]'
                        : 'bg-transparent',
                  )}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Chi tiết buổi tập của ngày đang chọn */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
        {/* Cột trái: Tổng quan buổi tập & Thêm bài tập từ thư viện */}
        <div className="flex flex-col justify-between space-y-6 rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs backdrop-blur-sm md:col-span-5">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Calendar size={13} />
              <span>{activeDay.fullLabel}</span>
            </div>
            <h2 className="m-0 mt-1.5 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {activeDay.title}
            </h2>

            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border/80 pt-4">
              <div className="rounded-xl border border-border/60 bg-muted/30 p-3.5">
                <span className="block text-xs font-medium text-muted-foreground">Số bài tập</span>
                <strong className="mt-1 block text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
                  {totalDayExercises}
                </strong>
              </div>
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5">
                <span className="block text-xs font-medium text-primary">Đã hoàn thành</span>
                <strong className="mt-1 block text-2xl font-extrabold tracking-tight text-primary sm:text-3xl">
                  {completedDayExercises}/{totalDayExercises}
                </strong>
              </div>
            </div>
          </div>

          {/* Form thêm bài tập từ Catalog vào ngày đang chọn */}
          {catalogExercises.length > 0 && (
            <form
              onSubmit={handleAddExercise}
              className="space-y-3.5 border-t border-border/80 pt-5"
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Dumbbell size={13} className="text-primary" />
                <span>Thêm bài tập vào {activeDay.fullLabel}</span>
              </div>
              <select
                aria-label="Chọn bài tập từ thư viện"
                value={selectedAddSlug}
                onChange={e => setSelectedAddSlug(e.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-muted/50 px-3.5 text-xs font-medium text-foreground transition-all focus:border-[#6366f1] focus:bg-card focus:outline-none focus:ring-2 focus:ring-[#6366f1]/20"
              >
                {catalogExercises.map(ex => (
                  <option key={ex.id} value={ex.slug}>
                    {ex.nameVi}
                  </option>
                ))}
              </select>

              <input
                value={selectedAddSets}
                onChange={e => setSelectedAddSets(e.target.value)}
                placeholder="Số hiệp × số lần (ví dụ: 4 hiệp × 10 lần)"
                className="h-10 w-full rounded-xl border border-border bg-muted/50 px-3.5 text-xs text-foreground placeholder:text-muted-foreground transition-all focus:border-[#6366f1] focus:bg-card focus:outline-none focus:ring-2 focus:ring-[#6366f1]/20"
              />

              <button
                type="submit"
                className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#6366f1] text-xs font-semibold text-white shadow-xs transition-all hover:bg-[#4f46e5]"
              >
                <Plus size={15} />
                <span>Thêm vào {activeDay.fullLabel}</span>
              </button>
            </form>
          )}
        </div>

        {/* Cột phải: Danh sách bài tập trong ngày */}
        <div className="rounded-2xl border border-border bg-card p-5 sm:p-7 shadow-xs backdrop-blur-sm md:col-span-7">
          <div className="flex items-center justify-between border-b border-border/80 pb-3.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Danh sách động tác ({totalDayExercises})
            </span>
            <Link
              href="/bai-tap"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary transition-colors hover:text-primary/80"
            >
              <span>Mở thư viện bài tập</span>
              <ArrowUpRight size={13} />
            </Link>
          </div>

          {totalDayExercises === 0 ? (
            <div className="py-16 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <Calendar size={20} />
              </div>
              <p className="m-0 mt-3 text-base font-semibold text-foreground">
                Ngày nghỉ phục hồi cơ bắp
              </p>
              <p className="m-0 mt-1 text-xs text-muted-foreground">
                Bạn có thể nghỉ ngơi thư giãn hoặc thêm bài tập từ bảng bên trái.
              </p>
            </div>
          ) : (
            <ul className="m-0 divide-y divide-border/60 list-none p-0">
              {activeDay.exercises.map((item, idx) => (
                <li key={item.id} className="m-0 flex items-center justify-between gap-3 py-3.5">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => toggleExerciseDone(item.id)}
                      aria-label={`Đánh dấu hoàn thành ${item.nameVi}`}
                      className={cn(
                        'flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-lg border transition-all',
                        item.done
                          ? 'border-emerald-500 bg-emerald-500 text-white shadow-xs'
                          : 'border-border bg-card hover:border-primary/60',
                      )}
                    >
                      {item.done && <Check size={14} strokeWidth={3} />}
                    </button>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-muted-foreground">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <Link
                          href={'/bai-tap/' + item.slug}
                          className={cn(
                            'inline-flex items-center gap-1 text-sm font-semibold transition-colors hover:text-primary',
                            item.done ? 'line-through text-muted-foreground' : 'text-foreground',
                          )}
                        >
                          <span>{item.nameVi}</span>
                          <ArrowUpRight size={13} className="text-muted-foreground" />
                        </Link>
                      </div>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {item.sets} · Nghỉ {item.rest}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeExercise(item.id)}
                    aria-label={`Xoá ${item.nameVi}`}
                    className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

