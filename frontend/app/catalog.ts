import { cache } from 'react';
import type { ExerciseImageRole, ExerciseProfile } from './exercise-profile';

export const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const idPattern = /^[a-z][a-z0-9_]{0,79}$/;
export type CatalogParams = Record<string, string | string[] | undefined>;
export type TaxonomyItem = { id: string; labelVi: string; slug: string };
export type CatalogMedia = { kind: 'IMAGE' | 'VIDEO'; url: string; altText: string; credit?: string; posterUrl?: string; role?: ExerciseImageRole };

export type WorkoutType = 'STRENGTH' | 'CARDIO' | 'HIIT' | 'CORE' | 'STRETCHING';
export type FocusArea = 'FULL_BODY' | 'UPPER_BODY' | 'LOWER_BODY' | 'ABS';
export type PoseStyle = 'squat' | 'pushup' | 'plank' | 'jump' | 'pull' | 'lunge' | 'core' | 'barbell';

export type ExerciseCard = {
  id: string;
  slug: string;
  nameVi: string;
  nameEn?: string;
  summary: string;
  primaryMuscleIds?: string[];
  secondaryMuscleIds?: string[];
  equipmentIds?: string[];
  instructions?: string[];
  workoutType?: WorkoutType;
  focusArea?: FocusArea;
  difficulty?: 1 | 2 | 3 | 4 | 5;
  levelSets?: [number, number, number];
  restSeconds?: number;
  poseStyle?: PoseStyle;
  media: CatalogMedia[];
};

export type CatalogFacets = {
  total: number;
  workoutTypes: Record<string, number>;
  focusAreas: Record<string, number>;
  difficulties: Record<string, number>;
  equipment: Record<string, number>;
  muscleGroups: Record<string, number>;
};

export type Exercise = ExerciseCard & {
  primaryMuscleIds: string[];
  secondaryMuscleIds: string[];
  equipmentIds: string[];
  instructions: string[];
  commonMistakes: string[];
  profile?: ExerciseProfile;
  variants: { id: string; nameVi: string; notes?: string }[];
};

const WORKOUT_TYPES = new Set(['STRENGTH', 'CARDIO', 'HIIT', 'CORE', 'STRETCHING']);
const FOCUS_AREAS = new Set(['FULL_BODY', 'UPPER_BODY', 'LOWER_BODY', 'ABS']);
const DIFFICULTIES = new Set(['1', '2', '3', '4', '5']);

export function libraryQuery(params: CatalogParams) {
  const query = new URLSearchParams();
  if (typeof params.q === 'string' && params.q.trim()) query.set('q', params.q.trim().slice(0, 100));
  for (const key of ['muscleGroupId', 'equipmentId']) {
    if (typeof params[key] === 'string' && idPattern.test(params[key])) query.set(key, params[key]);
  }
  if (typeof params.workoutType === 'string' && WORKOUT_TYPES.has(params.workoutType)) {
    query.set('workoutType', params.workoutType);
  }
  if (typeof params.focusArea === 'string' && FOCUS_AREAS.has(params.focusArea)) {
    query.set('focusArea', params.focusArea);
  }
  if (typeof params.difficulty === 'string' && DIFFICULTIES.has(params.difficulty)) {
    query.set('difficulty', params.difficulty);
  }
  for (const [key, valid] of [
    ['workoutTypes', (value: string) => WORKOUT_TYPES.has(value)],
    ['difficulties', (value: string) => DIFFICULTIES.has(value)],
    ['equipmentIds', (value: string) => idPattern.test(value)],
  ] as const) {
    const raw = params[key];
    if (typeof raw !== 'string') continue;
    const values = [...new Set(raw.split(',').filter(valid))].slice(0, 20);
    if (values.length) query.set(key, values.join(','));
  }
  if (typeof params.sort === 'string' && ['diff-asc', 'diff-desc', 'name'].includes(params.sort)) query.set('sort', params.sort);
  if (typeof params.page === 'string' && /^[1-9][0-9]{0,3}$/.test(params.page) && params.page !== '1') {
    query.set('page', params.page);
  }
  if (typeof params.cursor === 'string' && /^[A-Za-z0-9_-]{1,1024}$/.test(params.cursor)) query.set('cursor', params.cursor);
  return query;
}

function catalogOrigin() { return process.env.CATALOG_URL ?? 'http://127.0.0.1:3001'; }

export async function catalog(path: string, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(3000);
  const response = await fetch(catalogOrigin() + path, { cache: 'no-store', signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!response.ok) throw new Error('Catalog unavailable');
  return response.json();
}

type ExerciseResponse = { type: 'published'; exercise: Exercise } | { type: 'alias'; slug: string } | { type: 'missing' };
export const readExercise = cache(async (slug: string): Promise<ExerciseResponse> => {
  if (slug.length > 100 || !slugPattern.test(slug)) return { type: 'missing' };
  const response = await fetch(catalogOrigin() + '/api/v1/exercises/' + slug, {
    cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(3000),
  });
  if (response.status === 404) return { type: 'missing' };
  if (response.status === 308) {
    const canonical = /^\/api\/v1\/exercises\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(response.headers.get('location') ?? '')?.[1];
    if (!canonical || canonical.length > 100 || canonical === slug) throw new Error('Invalid Catalog alias');
    return { type: 'alias', slug: canonical };
  }
  if (!response.ok) throw new Error('Catalog unavailable');
  const exercise: Exercise = await response.json();
  if (exercise.slug !== slug) throw new Error('Invalid Catalog canonical slug');
  return { type: 'published', exercise };
});
