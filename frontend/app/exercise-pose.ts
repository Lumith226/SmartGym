import { cache } from 'react';
import { readPoseCapabilities } from '../server/pose-capabilities.mjs';
import { catalog } from './catalog';

export const poseCapabilities = cache(readPoseCapabilities);

export const readExercisePoseLinks = cache(async (): Promise<Record<string, string>> => {
  try {
    const [exercises, { items }] = await Promise.all([
      poseCapabilities(), catalog('/api/v1/pose-exercise-links'),
    ]);
    const supported = new Set(exercises.map(item => item.id));
    return Object.fromEntries(items.filter((item: { poseId: string }) => supported.has(item.poseId))
      .map((item: { poseId: string; exerciseId: string }) => [item.exerciseId, item.poseId]));
  } catch {
    return {};
  }
});
