import { type ExerciseCard, type FocusArea, type WorkoutType } from '../app/catalog';

export const WORKOUT_TYPE_LABELS: Record<WorkoutType, string> = {
  STRENGTH: 'Sức mạnh (Strength)',
  CARDIO: 'Tim mạch (Cardio)',
  HIIT: 'Đốt mỡ (HIIT)',
  CORE: 'Trọng tâm (Core)',
  STRETCHING: 'Giãn cơ (Stretch)',
};

export const FOCUS_AREA_LABELS: Record<FocusArea, string> = {
  FULL_BODY: 'Toàn thân (Full Body)',
  UPPER_BODY: 'Thân trên (Upper Body)',
  LOWER_BODY: 'Thân dưới (Lower Body)',
  ABS: 'Cơ bụng (Abs)',
};

export const DIFFICULTY_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'Level I · Light (Nhẹ)',
  2: 'Level II · Easy (Cơ bản)',
  3: 'Level III · Normal (Vừa)',
  4: 'Level IV · Hard (Nặng)',
  5: 'Level V · Advanced (Nâng cao)',
};

const UPPER_MUSCLES = new Set(['chest', 'shoulders', 'triceps', 'lats', 'upper_back', 'biceps', 'forearms']);
const CORE_MUSCLES = new Set(['core', 'obliques', 'lower_back', 'hip_flexors']);
const LOWER_MUSCLES = new Set(['quadriceps', 'glutes', 'calves', 'hamstrings', 'adductors']);

export function exerciseActiveRegions(exercise: Pick<ExerciseCard, 'primaryMuscleIds' | 'secondaryMuscleIds' | 'focusArea'>) {
  const { focusArea } = exercise;
  const allMuscles = [...(exercise.primaryMuscleIds ?? []), ...(exercise.secondaryMuscleIds ?? [])];
  const activeRegions: ('upper' | 'core' | 'lower')[] = [];
  if (allMuscles.some(m => UPPER_MUSCLES.has(m)) || focusArea === 'UPPER_BODY' || focusArea === 'FULL_BODY') {
    activeRegions.push('upper');
  }
  if (allMuscles.some(m => CORE_MUSCLES.has(m)) || focusArea === 'ABS' || focusArea === 'FULL_BODY') {
    activeRegions.push('core');
  }
  if (allMuscles.some(m => LOWER_MUSCLES.has(m)) || focusArea === 'LOWER_BODY' || focusArea === 'FULL_BODY') {
    activeRegions.push('lower');
  }

  return activeRegions;
}

export function cleanWikiText(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

export function ExerciseDifficultyBars({ level }: { level: 1 | 2 | 3 | 4 | 5 }) {
  const roman = ['I', 'II', 'III', 'IV', 'V'][level - 1];
  return (
    <div className="inline-flex items-center gap-1.5" aria-label={`Độ khó cấp ${roman}`}>
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Level {roman}
      </span>
      <span className="inline-flex items-center gap-0.5" aria-hidden="true">
        {[1, 2, 3, 4, 5].map(i => (
          <span
            key={i}
            className={`h-2.5 w-1.5 rounded-[1px] ${
              i <= level ? 'bg-[#cc0000]' : 'bg-[#e0e0e5]'
            }`}
          />
        ))}
      </span>
    </div>
  );
}

export function ExerciseMuscleDiagram({
  activeRegions,
}: {
  activeRegions: ('upper' | 'core' | 'lower')[];
}) {
  const isUpper = activeRegions.includes('upper');
  const isCore = activeRegions.includes('core');
  const isLower = activeRegions.includes('lower');
  return (
    <svg viewBox="0 0 36 68" className="h-11 w-6 shrink-0" aria-hidden="true">
      <circle cx="18" cy="7" r="5" fill="#d2d2d7" />
      <rect x="8" y="14" width="20" height="13" rx="3" fill={isUpper ? '#cc0000' : '#d2d2d7'} />
      <rect x="11" y="28" width="14" height="11" rx="2" fill={isCore ? '#cc0000' : '#d2d2d7'} />
      <rect x="10" y="41" width="7" height="23" rx="2.5" fill={isLower ? '#cc0000' : '#d2d2d7'} />
      <rect x="19" y="41" width="7" height="23" rx="2.5" fill={isLower ? '#cc0000' : '#d2d2d7'} />
    </svg>
  );
}
