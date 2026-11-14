'use client';

import * as React from 'react';
import { Activity, Calculator, Check, Dumbbell, Flame, Plus, RotateCcw, Scale, Sparkles, X } from 'lucide-react';
import { cn } from '../lib/utils';

type Gender = 'male' | 'female';
type ActivityLevel = '1.2' | '1.375' | '1.55' | '1.725' | '1.9';
type GoalType = 'cut' | 'maintain' | 'bulk';

type FoodLogItem = {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string }[] = [
  { value: '1.2', label: 'Ít vận động' },
  { value: '1.375', label: 'Tập nhẹ (1–3 buổi/tuần)' },
  { value: '1.55', label: 'Tập vừa (3–5 buổi/tuần)' },
  { value: '1.725', label: 'Tập nặng (6–7 buổi/tuần)' },
  { value: '1.9', label: 'Vận động viên' },
];

const GOAL_OPTIONS: { key: GoalType; label: string; delta: number }[] = [
  { key: 'cut', label: 'Giảm mỡ', delta: -450 },
  { key: 'maintain', label: 'Duy trì', delta: 0 },
  { key: 'bulk', label: 'Tăng cơ', delta: 300 },
];

const QUICK_FOOD_PRESETS: Omit<FoodLogItem, 'id'>[] = [
  { name: 'Ức gà áp chảo · 150g', calories: 248, protein: 46, carbs: 0, fat: 5 },
  { name: 'Cơm trắng · 1 chén', calories: 170, protein: 3.5, carbs: 37, fat: 0.4 },
  { name: 'Khoai lang luộc · 150g', calories: 129, protein: 2.4, carbs: 30, fat: 0.2 },
  { name: 'Trứng luộc · 2 quả', calories: 155, protein: 13, carbs: 1.1, fat: 11 },
  { name: 'Whey Protein · 1 muỗng', calories: 120, protein: 24, carbs: 3, fat: 1.5 },
  { name: 'Thịt bò thăn · 100g', calories: 201, protein: 29, carbs: 0, fat: 9 },
  { name: 'Yến mạch · 50g', calories: 194, protein: 6.5, carbs: 34, fat: 3.2 },
  { name: 'Chuối chín · 1 quả', calories: 105, protein: 1.3, carbs: 27, fat: 0.4 },
];

const STORAGE_KEY = 'smartgym_macro_tracker_v1';
const SAMPLE_FOOD_IDS = new Set(['seed-1', 'seed-2', 'seed-3']);

function getBmiStatus(bmi: number) {
  if (bmi < 18.5) {
    return {
      label: 'Thiếu cân',
      dot: 'bg-sky-500',
      badge: 'border-sky-500/20 bg-sky-500/10 text-sky-600 dark:text-sky-400',
      summary: 'Cơ thể đang thiếu hụt khối lượng. Ưu tiên tăng nhẹ 300 kcal/ngày và tập kháng lực.',
    };
  }
  if (bmi < 25) {
    return {
      label: 'Cân đối',
      dot: 'bg-emerald-500',
      badge: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      summary: 'Chỉ số cơ thể ở ngưỡng khỏe mạnh. Duy trì vận động đều đặn và chế độ ăn cân bằng.',
    };
  }
  if (bmi < 30) {
    return {
      label: 'Thừa cân',
      dot: 'bg-amber-500',
      badge: 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400',
      summary: 'Khuyến nghị giảm nhẹ 400–500 kcal/ngày so với mức tiêu hao và tăng thời lượng vận động.',
    };
  }
  return {
    label: 'Béo phì',
    dot: 'bg-rose-500',
    badge: 'border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400',
    summary: 'Cần kiểm soát năng lượng nạp vào và ưu tiên các bài tập ít gây áp lực lên khớp gối.',
  };
}

export function FitnessTools() {
  const [activeTool, setActiveTool] = React.useState<'bmi' | 'macro'>('bmi');

  const [gender, setGender] = React.useState<Gender>('male');
  const [age, setAge] = React.useState<number>(24);
  const [heightCm, setHeightCm] = React.useState<number>(172);
  const [weightKg, setWeightKg] = React.useState<number>(68);
  const [activity, setActivity] = React.useState<ActivityLevel>('1.55');
  const [goal, setGoal] = React.useState<GoalType>('maintain');

  const [foodLogs, setFoodLogs] = React.useState<FoodLogItem[]>([]);
  const [foodLogsLoaded, setFoodLogsLoaded] = React.useState(false);
  const [customName, setCustomName] = React.useState('');
  const [customCal, setCustomCal] = React.useState('');
  const [customP, setCustomP] = React.useState('');
  const [customC, setCustomC] = React.useState('');
  const [customF, setCustomF] = React.useState('');

  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setFoodLogs(parsed.filter(item => !SAMPLE_FOOD_IDS.has(item?.id)));
      }
    } catch {}
    setFoodLogsLoaded(true);
  }, []);

  React.useEffect(() => {
    if (!foodLogsLoaded) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(foodLogs));
    } catch {}
  }, [foodLogs, foodLogsLoaded]);

  const safeHeightM = Math.max(1.0, Math.min(2.5, heightCm / 100));
  const safeWeight = Math.max(25, Math.min(250, weightKg));
  const safeAge = Math.max(12, Math.min(100, age));
  const bmi = safeWeight / (safeHeightM * safeHeightM);
  const bmiStatus = getBmiStatus(bmi);
  const minIdealWeight = +(18.5 * safeHeightM * safeHeightM).toFixed(1);
  const maxIdealWeight = +(24.9 * safeHeightM * safeHeightM).toFixed(1);
  const bmiPercent = Math.max(2, Math.min(98, ((bmi - 14) / (35 - 14)) * 100));

  const bmr = Math.round(
    10 * safeWeight + 6.25 * (safeHeightM * 100) - 5 * safeAge + (gender === 'male' ? 5 : -161),
  );
  const tdee = Math.round(bmr * Number(activity));
  const goalDelta = GOAL_OPTIONS.find(g => g.key === goal)?.delta ?? 0;
  const targetCalories = Math.max(1200, tdee + goalDelta);
  const targetProtein = Math.round((targetCalories * 0.32) / 4);
  const targetCarbs = Math.round((targetCalories * 0.43) / 4);
  const targetFat = Math.round((targetCalories * 0.25) / 9);

  const totals = foodLogs.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      protein: +(acc.protein + item.protein).toFixed(1),
      carbs: +(acc.carbs + item.carbs).toFixed(1),
      fat: +(acc.fat + item.fat).toFixed(1),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  function addPresetFood(preset: Omit<FoodLogItem, 'id'>) {
    setFoodLogs(prev => [
      ...prev,
      { ...preset, id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}` },
    ]);
  }

  function handleAddCustomFood(e: React.FormEvent) {
    e.preventDefault();
    const name = customName.trim();
    if (!name) return;
    const p = Math.max(0, Number(customP) || 0);
    const c = Math.max(0, Number(customC) || 0);
    const f = Math.max(0, Number(customF) || 0);
    const cal = Math.max(0, Number(customCal) || Math.round(p * 4 + c * 4 + f * 9));
    setFoodLogs(prev => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name,
        calories: cal,
        protein: p,
        carbs: c,
        fat: f,
      },
    ]);
    setCustomName('');
    setCustomCal('');
    setCustomP('');
    setCustomC('');
    setCustomF('');
  }

  return (
    <div className="mx-auto max-w-[1080px] space-y-8 pt-4 pb-16">
      {/* Header đồng bộ giao diện SmartGym */}
      <header className="flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-1 text-xs font-semibold text-primary">
          <Calculator size={13} />
          <span>Công cụ tính toán &amp; Dinh dưỡng</span>
        </div>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          Chỉ số cơ thể &amp; Dinh dưỡng
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Tính toán chỉ số BMI, lượng calo tiêu hao TDEE/BMR và theo dõi Macro dinh dưỡng hàng ngày.
        </p>

        {/* Thanh chuyển đổi công cụ dạng Tabs */}
        <div
          role="tablist"
          aria-label="Chọn công cụ"
          className="mt-6 inline-flex rounded-2xl border border-border bg-card/85 p-1.5 text-xs font-semibold shadow-xs backdrop-blur-md"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTool === 'bmi'}
            onClick={() => setActiveTool('bmi')}
            className={cn(
              'cursor-pointer rounded-xl px-5 py-2 transition-all font-semibold',
              activeTool === 'bmi'
                ? 'bg-[#6366f1] text-white shadow-xs'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            BMI &amp; Năng lượng tiêu hao
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTool === 'macro'}
            onClick={() => setActiveTool('macro')}
            className={cn(
              'cursor-pointer rounded-xl px-5 py-2 transition-all font-semibold',
              activeTool === 'macro'
                ? 'bg-[#6366f1] text-white shadow-xs'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            Calories &amp; Macro Tracker
          </button>
        </div>
      </header>

      {/* CHẾ ĐỘ 1: BMI CALCULATOR */}
      {activeTool === 'bmi' && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
          {/* Cột trái: Các thanh trượt thông số nhập liệu */}
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-7 shadow-xs backdrop-blur-sm md:col-span-5">
            <div className="divide-y divide-border/60">
              {/* Giới tính */}
              <div className="flex items-center justify-between pb-5">
                <span className="text-sm font-semibold text-foreground">Giới tính</span>
                <div className="inline-grid grid-cols-2 rounded-xl border border-border/80 bg-muted/60 p-1 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setGender('male')}
                    className={cn(
                      'cursor-pointer rounded-lg px-4 py-1.5 transition-all',
                      gender === 'male'
                        ? 'bg-[#6366f1] font-bold text-white shadow-xs'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    Nam
                  </button>
                  <button
                    type="button"
                    onClick={() => setGender('female')}
                    className={cn(
                      'cursor-pointer rounded-lg px-4 py-1.5 transition-all',
                      gender === 'female'
                        ? 'bg-[#6366f1] font-bold text-white shadow-xs'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    Nữ
                  </button>
                </div>
              </div>

              {/* Chiều cao */}
              <div className="py-5">
                <div className="flex items-baseline justify-between">
                  <label htmlFor="smartgym-height" className="text-sm font-semibold text-foreground">
                    Chiều cao
                  </label>
                  <div className="flex items-baseline gap-1">
                    <input
                      id="smartgym-height"
                      type="number"
                      min={120}
                      max={220}
                      value={heightCm}
                      onChange={e => setHeightCm(Number(e.target.value) || 0)}
                      className="w-16 bg-transparent text-right text-2xl font-extrabold tracking-tight text-foreground focus:outline-none"
                    />
                    <span className="text-xs font-semibold text-muted-foreground">cm</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={135}
                  max={205}
                  value={heightCm}
                  onChange={e => setHeightCm(Number(e.target.value))}
                  className="mt-3.5 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-[#6366f1]"
                />
              </div>

              {/* Cân nặng */}
              <div className="py-5">
                <div className="flex items-baseline justify-between">
                  <label htmlFor="smartgym-weight" className="text-sm font-semibold text-foreground">
                    Cân nặng
                  </label>
                  <div className="flex items-baseline gap-1">
                    <input
                      id="smartgym-weight"
                      type="number"
                      min={30}
                      max={180}
                      step="0.5"
                      value={weightKg}
                      onChange={e => setWeightKg(Number(e.target.value) || 0)}
                      className="w-16 bg-transparent text-right text-2xl font-extrabold tracking-tight text-foreground focus:outline-none"
                    />
                    <span className="text-xs font-semibold text-muted-foreground">kg</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={35}
                  max={140}
                  step="0.5"
                  value={weightKg}
                  onChange={e => setWeightKg(Number(e.target.value))}
                  className="mt-3.5 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-[#6366f1]"
                />
              </div>

              {/* Độ tuổi */}
              <div className="pt-5">
                <div className="flex items-baseline justify-between">
                  <label htmlFor="smartgym-age" className="text-sm font-semibold text-foreground">
                    Độ tuổi
                  </label>
                  <div className="flex items-baseline gap-1">
                    <input
                      id="smartgym-age"
                      type="number"
                      min={12}
                      max={100}
                      value={age}
                      onChange={e => setAge(Number(e.target.value) || 0)}
                      className="w-14 bg-transparent text-right text-2xl font-extrabold tracking-tight text-foreground focus:outline-none"
                    />
                    <span className="text-xs font-semibold text-muted-foreground">tuổi</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={14}
                  max={85}
                  value={age}
                  onChange={e => setAge(Number(e.target.value))}
                  className="mt-3.5 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-[#6366f1]"
                />
              </div>
            </div>
          </div>

          {/* Cột phải: Hiển thị kết quả BMI & Thang đo */}
          <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-xs backdrop-blur-sm md:col-span-7">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Chỉ số khối cơ thể (BMI)
                </span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold',
                    bmiStatus.badge,
                  )}
                >
                  <span className={cn('h-2 w-2 rounded-full', bmiStatus.dot)} />
                  <span>{bmiStatus.label}</span>
                </span>
              </div>

              <div className="mt-3 flex items-baseline gap-3">
                <span className="text-5xl font-extrabold tracking-tight text-foreground sm:text-6xl">
                  {bmi.toFixed(1)}
                </span>
                <span className="text-sm font-semibold text-muted-foreground">kg/m²</span>
              </div>

              <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                {bmiStatus.summary}
              </p>
            </div>

            {/* Thang đo dải màu 4 ngưỡng chuẩn y khoa */}
            <div className="my-7 sm:my-8">
              <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted flex">
                <div className="h-full bg-sky-500/40 w-[21%]" title="Thiếu cân (< 18.5)" />
                <div className="h-full bg-emerald-500/50 w-[30%]" title="Cân đối (18.5 - 24.9)" />
                <div className="h-full bg-amber-500/50 w-[24%]" title="Thừa cân (25.0 - 29.9)" />
                <div className="h-full bg-rose-500/50 w-[25%]" title="Béo phì (>= 30.0)" />
              </div>
              <div className="relative w-full">
                <div
                  style={{ left: `${bmiPercent}%` }}
                  className="absolute -top-3.5 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-white bg-[#6366f1] shadow-md ring-2 ring-[#6366f1]/30 transition-all duration-200"
                />
              </div>
              <div className="mt-3 flex justify-between text-[11px] font-semibold text-muted-foreground">
                <span>18.5</span>
                <span className="hidden sm:inline text-emerald-600 dark:text-emerald-400">
                  Chuẩn khỏe mạnh (18.5 – 24.9)
                </span>
                <span>25.0</span>
                <span>30.0</span>
              </div>
            </div>

            {/* Hai thông số phụ: Cân nặng lý tưởng & TDEE */}
            <div className="grid grid-cols-1 gap-3.5 border-t border-border/80 pt-5 sm:grid-cols-2">
              <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
                <span className="block text-xs font-semibold text-muted-foreground">
                  Cân nặng lý tưởng
                </span>
                <strong className="mt-1 block text-xl font-extrabold tracking-tight text-foreground">
                  {minIdealWeight} – {maxIdealWeight} kg
                </strong>
              </div>
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <span className="block text-xs font-semibold text-primary">
                  Năng lượng duy trì (TDEE)
                </span>
                <strong className="mt-1 block text-xl font-extrabold tracking-tight text-primary">
                  {tdee.toLocaleString('vi-VN')} kcal/ngày
                </strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CHẾ ĐỘ 2: CALORIES & MACRO TRACKER */}
      {activeTool === 'macro' && (
        <div className="space-y-6">
          {/* Khối trên: Cấu hình mục tiêu & Bảng đồng hồ Calo/Macro */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
            {/* Cột trái: Cấu hình mục tiêu */}
            <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 sm:p-7 shadow-xs backdrop-blur-sm md:col-span-5">
              <div className="space-y-5">
                <div>
                  <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Mục tiêu thể hình
                  </span>
                  <div className="mt-2.5 grid grid-cols-3 rounded-xl border border-border/80 bg-muted/50 p-1 text-xs font-semibold">
                    {GOAL_OPTIONS.map(g => (
                      <button
                        key={g.key}
                        type="button"
                        onClick={() => setGoal(g.key)}
                        className={cn(
                          'cursor-pointer rounded-lg py-2 transition-all font-semibold text-center',
                          goal === g.key
                            ? 'bg-[#6366f1] text-white shadow-xs'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="smartgym-activity" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Mức độ vận động
                  </label>
                  <select
                    id="smartgym-activity"
                    value={activity}
                    onChange={e => setActivity(e.target.value as ActivityLevel)}
                    className="mt-2 h-10 w-full rounded-xl border border-border bg-muted/50 px-3.5 text-xs font-medium text-foreground transition-all focus:border-[#6366f1] focus:bg-card focus:outline-none focus:ring-2 focus:ring-[#6366f1]/20"
                  >
                    {ACTIVITY_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3 border-t border-border/80 pt-4">
                <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                  <span className="block text-[11px] font-medium text-muted-foreground">
                    Chuyển hóa nền (BMR)
                  </span>
                  <strong className="mt-0.5 block text-base font-extrabold text-foreground">
                    {bmr.toLocaleString('vi-VN')} kcal
                  </strong>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                  <span className="block text-[11px] font-medium text-muted-foreground">
                    Tiêu hao (TDEE)
                  </span>
                  <strong className="mt-0.5 block text-base font-extrabold text-foreground">
                    {tdee.toLocaleString('vi-VN')} kcal
                  </strong>
                </div>
              </div>
            </div>

            {/* Cột phải: Bảng đồng hồ Calo & 3 thanh Macro */}
            <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 sm:p-7 shadow-xs backdrop-blur-sm md:col-span-7">
              <div className="flex flex-wrap items-baseline justify-between gap-4">
                <div>
                  <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Đã nạp hôm nay
                  </span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
                      {totals.calories.toLocaleString('vi-VN')}
                    </span>
                    <span className="text-sm font-semibold text-muted-foreground">
                      / {targetCalories.toLocaleString('vi-VN')} kcal
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-primary">
                    Còn lại
                  </span>
                  <strong className="mt-1 block text-2xl font-extrabold tracking-tight text-primary sm:text-3xl">
                    {Math.max(0, targetCalories - totals.calories).toLocaleString('vi-VN')} kcal
                  </strong>
                </div>
              </div>

              {/* Thanh tiến độ năng lượng với dải màu Indigo */}
              <div className="my-6 h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  style={{ width: `${Math.min(100, (totals.calories / targetCalories) * 100)}%` }}
                  className="h-full rounded-full bg-linear-to-r from-[#6366f1] to-[#4f46e5] transition-all duration-300"
                />
              </div>

              {/* 3 cột Macro */}
              <div className="grid grid-cols-1 gap-4 border-t border-border/80 pt-5 sm:grid-cols-3 sm:gap-6">
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-semibold text-foreground">Đạm (Protein)</span>
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      {totals.protein}/{targetProtein}g
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      style={{
                        width: `${Math.min(100, (totals.protein / Math.max(1, targetProtein)) * 100)}%`,
                      }}
                      className="h-full rounded-full bg-emerald-500 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-semibold text-foreground">Tinh bột (Carbs)</span>
                    <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                      {totals.carbs}/{targetCarbs}g
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      style={{
                        width: `${Math.min(100, (totals.carbs / Math.max(1, targetCarbs)) * 100)}%`,
                      }}
                      className="h-full rounded-full bg-amber-500 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-semibold text-foreground">Chất béo (Fat)</span>
                    <span className="text-xs font-semibold text-sky-600 dark:text-sky-400">
                      {totals.fat}/{targetFat}g
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      style={{
                        width: `${Math.min(100, (totals.fat / Math.max(1, targetFat)) * 100)}%`,
                      }}
                      className="h-full rounded-full bg-sky-500 transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Khối dưới: Danh sách bữa ăn & Thêm món */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
            {/* Chọn nhanh hoặc tự nhập món ăn */}
            <div className="space-y-6 rounded-2xl border border-border bg-card p-5 sm:p-7 shadow-xs backdrop-blur-sm md:col-span-5">
              <div>
                <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Thêm nhanh món ăn
                </span>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {QUICK_FOOD_PRESETS.map(item => (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => addPresetFood(item)}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-border/80 bg-muted/40 px-3 py-1.5 text-xs font-semibold text-foreground transition-all hover:border-primary/40 hover:bg-muted"
                    >
                      <Plus size={12} className="text-primary" />
                      <span>{item.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleAddCustomFood} className="space-y-3.5 border-t border-border/80 pt-5">
                <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Tự nhập món ăn
                </span>
                <input
                  placeholder="Tên món ăn..."
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  required
                  className="h-10 w-full rounded-xl border border-border bg-muted/50 px-3.5 text-xs text-foreground placeholder:text-muted-foreground transition-all focus:border-[#6366f1] focus:bg-card focus:outline-none focus:ring-2 focus:ring-[#6366f1]/20"
                />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <input
                    type="number"
                    min={0}
                    placeholder="Kcal"
                    value={customCal}
                    onChange={e => setCustomCal(e.target.value)}
                    className="h-9 rounded-xl border border-border bg-muted/50 px-2.5 text-xs text-foreground placeholder:text-muted-foreground transition-all focus:border-[#6366f1] focus:bg-card focus:outline-none"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    placeholder="Đạm (g)"
                    value={customP}
                    onChange={e => setCustomP(e.target.value)}
                    className="h-9 rounded-xl border border-border bg-muted/50 px-2.5 text-xs text-foreground placeholder:text-muted-foreground transition-all focus:border-[#6366f1] focus:bg-card focus:outline-none"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    placeholder="Carb (g)"
                    value={customC}
                    onChange={e => setCustomC(e.target.value)}
                    className="h-9 rounded-xl border border-border bg-muted/50 px-2.5 text-xs text-foreground placeholder:text-muted-foreground transition-all focus:border-[#6366f1] focus:bg-card focus:outline-none"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    placeholder="Fat (g)"
                    value={customF}
                    onChange={e => setCustomF(e.target.value)}
                    className="h-9 rounded-xl border border-border bg-muted/50 px-2.5 text-xs text-foreground placeholder:text-muted-foreground transition-all focus:border-[#6366f1] focus:bg-card focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="h-10 w-full cursor-pointer rounded-xl bg-[#6366f1] text-xs font-semibold text-white shadow-xs transition-all hover:bg-[#4f46e5]"
                >
                  Thêm vào hôm nay
                </button>
              </form>
            </div>

            {/* Danh sách bữa ăn đã thêm */}
            <div className="rounded-2xl border border-border bg-card p-5 sm:p-7 shadow-xs backdrop-blur-sm md:col-span-7">
              <div className="flex items-center justify-between border-b border-border/80 pb-3.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Bữa ăn hôm nay ({foodLogs.length})
                </span>
                {foodLogs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setFoodLogs([])}
                    className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                  >
                    <RotateCcw size={13} />
                    <span>Đặt lại</span>
                  </button>
                )}
              </div>

              {foodLogs.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                    <Flame size={20} />
                  </div>
                  <p className="m-0 mt-3 text-sm font-semibold text-foreground">
                    Chưa có thực phẩm nào được ghi nhận hôm nay
                  </p>
                  <p className="m-0 mt-1 text-xs text-muted-foreground">
                    Chọn các món ăn nhanh hoặc tự nhập ở bảng bên trái.
                  </p>
                </div>
              ) : (
                <ul className="m-0 divide-y divide-border/60 list-none p-0">
                  {foodLogs.map(item => (
                    <li key={item.id} className="m-0 flex items-center justify-between py-3.5">
                      <div>
                        <span className="block text-sm font-semibold text-foreground">
                          {item.name}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {item.protein}g đạm · {item.carbs}g tinh bột · {item.fat}g chất béo
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                          {item.calories} kcal
                        </span>
                        <button
                          type="button"
                          onClick={() => setFoodLogs(prev => prev.filter(x => x.id !== item.id))}
                          aria-label={`Xoá ${item.name}`}
                          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

