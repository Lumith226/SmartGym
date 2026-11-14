'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  Activity,
  Check,
  Dumbbell,
  Flame,
  HeartPulse,
  Layers,
  Minus,
  Plus,
  ShieldCheck,
  Sparkles,
  StretchHorizontal,
  User,
  Weight,
  Zap,
} from 'lucide-react';
import { bodyRegions, hairOutline, headOutline, outline, type BodySide } from './muscle-map-regions';
import { cn } from '../lib/utils';
import dynamic from 'next/dynamic';

const BodyMap3D = dynamic(
  () => import('../components/body-map-3d').then(mod => mod.BodyMap3D),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
        Đang khởi tạo không gian 3D...
      </div>
    ),
  },
);

export type MuscleGroup = { id: string; labelVi: string; svgRegions: string[] };

type EquipmentFilterItem = {
  key: string;
  paramKey: 'equipmentId' | 'workoutType' | 'focusArea';
  paramValue: string;
  label: string;
  icon: typeof Dumbbell;
};

const EQUIPMENT_PANEL_ITEMS: EquipmentFilterItem[] = [
  { key: 'featured', paramKey: 'workoutType', paramValue: '', label: 'Nổi bật', icon: Sparkles },
  { key: 'barbell', paramKey: 'equipmentId', paramValue: 'barbell', label: 'Thanh tạ', icon: Dumbbell },
  { key: 'bench', paramKey: 'equipmentId', paramValue: 'bench', label: 'Ghế đẩy', icon: Layers },
  { key: 'bodyweight', paramKey: 'equipmentId', paramValue: 'bodyweight', label: 'Tự trọng', icon: User },
  { key: 'rack', paramKey: 'equipmentId', paramValue: 'rack', label: 'Giá đỡ tạ', icon: Weight },
  { key: 'stretching', paramKey: 'workoutType', paramValue: 'stretching', label: 'Giãn cơ', icon: StretchHorizontal },
  { key: 'pull_up_bar', paramKey: 'equipmentId', paramValue: 'pull_up_bar', label: 'Xà đơn', icon: ShieldCheck },
  { key: 'strength', paramKey: 'workoutType', paramValue: 'strength', label: 'Sức mạnh', icon: Zap },
  { key: 'core', paramKey: 'workoutType', paramValue: 'core', label: 'Yoga / Core', icon: Activity },
  { key: 'cardio', paramKey: 'workoutType', paramValue: 'cardio', label: 'Tim mạch', icon: HeartPulse },
  { key: 'hiit', paramKey: 'workoutType', paramValue: 'hiit', label: 'Đốt mỡ HIIT', icon: Flame },
  { key: 'full_body', paramKey: 'focusArea', paramValue: 'full_body', label: 'Toàn thân', icon: User },
];

function mappedRegions(groups: MuscleGroup[], side: BodySide) {
  const explicit = new Map(groups.flatMap(group => group.svgRegions.map(key => [key, group] as const)));
  const defaults = new Map(groups.filter(group => !group.svgRegions.length).map(group => [group.id, group]));
  const mapped = new Map<string, { group: MuscleGroup; regions: (typeof bodyRegions)[BodySide] }>();
  for (const region of bodyRegions[side]) {
    const group = explicit.get(region.key) ?? defaults.get(region.groupId);
    if (!group) continue;
    if (!mapped.has(group.id)) mapped.set(group.id, { group, regions: [] });
    mapped.get(group.id)!.regions.push(region);
  }
  return [...mapped.values()];
}

export function MuscleMap({
  groups,
  query,
  basePath = '/bai-tap',
}: {
  groups: MuscleGroup[];
  query: string;
  basePath?: string;
  muscleCounts?: Record<string, number>;
}) {
  const router = useRouter();
  const [hoveredGroup, setHoveredGroup] = useState<MuscleGroup | null>(null);
  const [active, setActive] = useState<string>();
  const [ready, setReady] = useState(false);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [equipmentOpen, setEquipmentOpen] = useState(true);
  const [mobileSide, setMobileSide] = useState<BodySide>('front');

  const initialParams = new URLSearchParams(query);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string>(
    initialParams.get('equipmentId') ?? '',
  );
  const [selectedWorkoutType, setSelectedWorkoutType] = useState<string>(
    initialParams.get('workoutType') ?? '',
  );
  const [selectedFocusArea, setSelectedFocusArea] = useState<string>(
    initialParams.get('focusArea') ?? '',
  );

  useEffect(() => setReady(true), []);

  const nodes = useRef(new Map<string, SVGGElement>());
  const selectedId = initialParams.get('muscleGroupId');
  const selected = groups.find(group => group.id === selectedId);

  const frontControls = mappedRegions(groups, 'front');
  const backControls = mappedRegions(groups, 'back');
  const allControls = [...frontControls, ...backControls];
  const activeId =
    [active, selectedId].find(id => allControls.some(({ group }) => group.id === id)) ??
    allControls[0]?.group.id;

  function buildTargetHref(muscleGroupId?: string) {
    const params = new URLSearchParams();
    if (muscleGroupId) params.set('muscleGroupId', muscleGroupId);
    if (selectedEquipmentId) params.set('equipmentId', selectedEquipmentId);
    if (selectedWorkoutType) params.set('workoutType', selectedWorkoutType);
    if (selectedFocusArea) params.set('focusArea', selectedFocusArea);
    const search = params.toString();
    return search ? `${basePath}?${search}` : basePath;
  }

  function choose(id: string) {
    setActive(id);
    router.push(buildTargetHref(id));
  }

  function toggleEquipmentItem(item: EquipmentFilterItem) {
    if (item.key === 'featured') {
      setSelectedEquipmentId('');
      setSelectedWorkoutType('');
      setSelectedFocusArea('');
      return;
    }
    if (item.paramKey === 'equipmentId') {
      setSelectedEquipmentId(prev => (prev === item.paramValue ? '' : item.paramValue));
    } else if (item.paramKey === 'workoutType') {
      setSelectedWorkoutType(prev => (prev === item.paramValue ? '' : item.paramValue));
    } else if (item.paramKey === 'focusArea') {
      setSelectedFocusArea(prev => (prev === item.paramValue ? '' : item.paramValue));
    }
  }

  function isItemChecked(item: EquipmentFilterItem) {
    if (item.key === 'featured') {
      return !selectedEquipmentId && !selectedWorkoutType && !selectedFocusArea;
    }
    if (item.paramKey === 'equipmentId') return selectedEquipmentId === item.paramValue;
    if (item.paramKey === 'workoutType') return selectedWorkoutType === item.paramValue;
    if (item.paramKey === 'focusArea') return selectedFocusArea === item.paramValue;
    return false;
  }

  function keyDown(event: KeyboardEvent<SVGGElement>, controls: typeof frontControls, index: number) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!event.repeat) choose(controls[index].group.id);
      return;
    }
    const count = controls.length;
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (index + 1) % count;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (index - 1 + count) % count;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = count - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    nodes.current.get(controls[next].group.id)?.focus();
  }

  function renderBodyFigure(side: BodySide, controls: typeof frontControls) {
    return (
      <div
        key={side}
        className={cn(
          'relative items-center justify-center',
          mobileSide === side ? 'flex' : 'hidden sm:flex',
        )}
      >
        <svg
          className="muscle-map-svg block h-[50dvh] max-h-[440px] min-h-[320px] w-auto max-w-full select-none drop-shadow-[0_18px_38px_rgba(0,0,0,0.06)] dark:drop-shadow-[0_18px_38px_rgba(0,0,0,0.35)] transition-transform duration-300 sm:h-[58dvh] sm:max-h-[560px] sm:min-h-[420px] lg:h-[calc(100dvh-5.5rem)] lg:max-h-[820px] lg:min-h-[500px]"
          viewBox="0 0 280 500"
          width="280"
          height="500"
          role="group"
          aria-label={side === 'front' ? 'Mặt trước cơ thể' : 'Mặt sau cơ thể'}
        >
          {/* Khung giải phẫu thích ứng Light & Dark Mode theo hệ thống */}
          <g aria-hidden="true">
            {/* Khung thân nền */}
            <path
              d={outline}
              className="fill-[#e8eaf0] stroke-[#94a3b8] dark:fill-[#151824] dark:stroke-[#283145] transition-colors"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            {/* Đầu & Cổ */}
            <path
              d={headOutline}
              className="fill-[#e8eaf0] stroke-[#94a3b8] dark:fill-[#151824] dark:stroke-[#283145] transition-colors"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            {/* Tóc */}
            <path
              d={hairOutline}
              className="fill-[#cbd5e1] stroke-[#94a3b8] dark:fill-[#1e2333] dark:stroke-[#333e57] transition-colors"
              strokeWidth="1.65"
              strokeLinejoin="round"
            />
            {/* Cơ cầu vai cổ (Neck traps) */}
            <path
              d="M126 83 L105 99 L126 95 Z M154 83 L175 99 L154 95 Z"
              className="fill-[#cbd5e1] stroke-white dark:fill-[#1e2333] dark:stroke-[#151824] transition-colors"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            {/* Bàn tay trái & phải */}
            <path
              d="M25 241 L12 262 C9 270 12 277 17 279 C21 279 25 274 28 267 L33 277 C37 278 41 273 40 264 L39 249 Z M255 241 L268 262 C271 270 268 277 263 279 C259 279 255 274 252 267 L247 277 C243 278 239 273 240 264 L241 249 Z"
              className="fill-[#cbd5e1] stroke-[#94a3b8] dark:fill-[#1e2333] dark:stroke-[#333e57] transition-colors"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </g>

          {/* Các mảng nhóm cơ tương tác - Tone màu đồng bộ Indigo #6366f1 / #4f46e5 */}
          {controls.map(({ group, regions }, index) => {
            const isSelected = selected?.id === group.id;
            const isHovered = hoveredGroup?.id === group.id;
            return (
              <g
                key={`${side}-${group.id}`}
                role={ready ? 'button' : undefined}
                className={cn(
                  'muscle-map-region cursor-pointer transition-all duration-150',
                  isSelected
                    ? 'fill-[#4f46e5] stroke-white dark:fill-[#6366f1] dark:stroke-white drop-shadow-[0_0_12px_rgba(99,102,241,0.65)]'
                    : isHovered
                      ? 'fill-[#6366f1] stroke-white dark:fill-[#818cf8] dark:stroke-white drop-shadow-[0_0_8px_rgba(99,102,241,0.45)]'
                      : 'fill-[#94a3b8] stroke-white hover:fill-[#6366f1] dark:fill-[#222838] dark:stroke-[#151824] dark:hover:fill-[#6366f1]',
                )}
                style={{
                  strokeWidth: isSelected || isHovered ? 2.2 : 1.75,
                }}
                aria-label={group.labelVi}
                aria-pressed={ready ? isSelected : undefined}
                tabIndex={ready ? (activeId === group.id ? 0 : -1) : undefined}
                ref={node => {
                  if (node && side === 'front') nodes.current.set(group.id, node);
                }}
                onMouseEnter={() => setHoveredGroup(group)}
                onMouseLeave={() => setHoveredGroup(prev => (prev?.id === group.id ? null : prev))}
                onFocus={() => {
                  setActive(group.id);
                  setHoveredGroup(group);
                }}
                onClick={() => choose(group.id)}
                onKeyDown={event => keyDown(event, controls, index)}
              >
                <title>{group.labelVi}</title>
                {regions.map(region => (
                  <g key={region.key} aria-hidden="true">
                    <path d={region.path} strokeLinejoin="round" />
                    {region.paired && (
                      <path
                        d={region.path}
                        transform="translate(280 0) scale(-1 1)"
                        strokeLinejoin="round"
                      />
                    )}
                  </g>
                ))}

                {/* Rãnh múi cơ bụng 6-pack mặt trước */}
                {side === 'front' && group.id === 'core' && (
                  <path
                    aria-hidden="true"
                    d="M140 156 V254 M123 176 Q140 173 157 176 M121 196 Q140 193 159 196 M123 216 Q140 213 157 216"
                    fill="none"
                    className="stroke-white/80 dark:stroke-white/40"
                    strokeWidth="1.65"
                    strokeLinecap="round"
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  return (
    <section
      id="ban-do-co-the"
      aria-label="Bản đồ cơ thể tương tác"
      className="relative -mx-3 -my-4 flex min-h-[calc(100dvh-3.25rem)] items-center justify-center overflow-hidden bg-background px-4 py-4 sm:-mx-6 sm:-my-6 sm:px-8 lg:-mx-8 lg:-my-8 lg:px-12"
    >
      {/* Pill thông báo nhóm cơ đang trỏ */}
      {hoveredGroup && (
        <div
          role="status"
          className="pointer-events-none fixed top-16 left-1/2 z-40 -translate-x-1/2 inline-flex items-center gap-2 rounded-full border border-border bg-card/90 px-4 py-1.5 text-xs font-semibold tracking-tight text-foreground shadow-[0_8px_24px_rgba(0,0,0,0.12)] backdrop-blur-xl"
        >
          <span className="h-2 w-2 rounded-full bg-[#6366f1] shadow-[0_0_8px_#6366f1]" />
          <span>{hoveredGroup.labelVi}</span>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-[1640px] flex-col gap-3">
        {/* Thanh chuyển chế độ 2D / 3D */}
        <div className="flex items-center justify-start px-1">
          <div className="inline-flex items-center rounded-xl border border-border bg-card/85 p-1 text-xs font-bold shadow-xs backdrop-blur-md">
            <button
              type="button"
              onClick={() => setViewMode('2d')}
              className={cn(
                'rounded-lg px-4 py-1.5 transition-all cursor-pointer font-semibold',
                viewMode === '2d'
                  ? 'bg-[#6366f1] text-white shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              2D
            </button>
            <button
              type="button"
              onClick={() => setViewMode('3d')}
              className={cn(
                'rounded-lg px-4 py-1.5 transition-all cursor-pointer font-semibold',
                viewMode === '3d'
                  ? 'bg-[#6366f1] text-white shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              3D
            </button>
          </div>
        </div>

        <div className="grid w-full grid-cols-1 items-center gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_360px] lg:gap-8 xl:grid-cols-[1fr_1fr_380px]">
          {viewMode === '2d' ? (
            <>
              {/* Thanh chuyển Mặt trước / Mặt sau trên màn hình điện thoại (<640px) */}
              <div className="flex justify-center sm:hidden">
                <div className="inline-grid w-full max-w-[260px] grid-cols-2 rounded-lg bg-muted border border-border p-1 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setMobileSide('front')}
                    className={cn(
                      'cursor-pointer rounded-[6px] py-1.5 transition-all',
                      mobileSide === 'front'
                        ? 'bg-card font-semibold text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    Mặt trước
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileSide('back')}
                    className={cn(
                      'cursor-pointer rounded-[6px] py-1.5 transition-all',
                      mobileSide === 'back'
                        ? 'bg-card font-semibold text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    Mặt sau
                  </button>
                </div>
              </div>

              {/* Mô hình Mặt trước toàn màn hình */}
              {renderBodyFigure('front', frontControls)}

              {/* Mô hình Mặt sau toàn màn hình */}
              {renderBodyFigure('back', backControls)}
            </>
          ) : (
            /* Mô hình 3D tương tác không viền khung phóng toàn màn hình */
            <div className="sm:col-span-2 relative flex h-[54dvh] sm:h-[62dvh] lg:h-[calc(100dvh-5.5rem)] lg:max-h-[840px] w-full items-center justify-center overflow-hidden select-none">
              <BodyMap3D
                groups={groups}
                activeId={selected?.id || active}
                onSelect={choose}
                onHover={setHoveredGroup}
              />
            </div>
          )}

          {/* Bảng Dụng cụ & Chế độ dạng thẻ nổi (Floating Card) */}
          <aside className="self-center sm:self-start lg:self-center overflow-hidden rounded-2xl border border-border/80 bg-card/95 text-card-foreground shadow-xl shadow-black/5 dark:shadow-black/25 backdrop-blur-2xl sm:col-span-2 lg:col-span-1">
            <div className="p-5">
              <div className="flex items-center justify-between border-b border-border/80 pb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Dụng cụ &amp; Chế độ
                </span>
                <button
                  type="button"
                  onClick={() => setEquipmentOpen(v => !v)}
                  aria-label="Thu gọn hoặc mở rộng dụng cụ"
                  className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
                >
                  {equipmentOpen ? <Minus size={14} /> : <Plus size={14} />}
                </button>
              </div>

              {equipmentOpen && (
                <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2.5">
                  {EQUIPMENT_PANEL_ITEMS.map(item => {
                    const Icon = item.icon;
                    const checked = isItemChecked(item);
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => toggleEquipmentItem(item)}
                        className={cn(
                          'group flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] transition-all cursor-pointer',
                          checked
                            ? 'bg-[rgba(99,102,241,0.08)] font-semibold text-[#4f46e5] dark:bg-[rgba(99,102,241,0.16)] dark:text-[#818cf8]'
                            : 'font-medium text-foreground hover:bg-muted/60',
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors',
                            checked
                              ? 'border-[#6366f1] bg-[#6366f1] text-white'
                              : 'border-border bg-card group-hover:border-muted-foreground/40',
                          )}
                        >
                          {checked && <Check size={11} strokeWidth={3} />}
                        </span>
                        <Icon
                          size={15}
                          className={cn(
                            'shrink-0 transition-colors',
                            checked ? 'text-[#6366f1] dark:text-[#818cf8]' : 'text-muted-foreground group-hover:text-foreground',
                          )}
                        />
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
      </div>
    </div>
  </section>
  );
}


