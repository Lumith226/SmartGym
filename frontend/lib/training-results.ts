export type TrainingResult = {
  id: string;
  exerciseId: string;
  exerciseName: string;
  source: 'camera' | 'video';
  scope: 'live' | 'whole';
  savedAt: string;
  repCount: number | null;
  feedback: string | null;
  result: object;
};

const storageKey = (profileId: string) => `smartgym.training-results.${profileId}`;

export function readTrainingResults(profileId: string): TrainingResult[] {
  const entries: unknown = JSON.parse(localStorage.getItem(storageKey(profileId)) ?? '[]');
  return Array.isArray(entries) ? entries : [];
}

export function saveTrainingResult(profileId: string, result: TrainingResult) {
  const entries = readTrainingResults(profileId);
  localStorage.setItem(storageKey(profileId), JSON.stringify([result, ...entries]));
}

export function downloadTrainingResult(result: TrainingResult) {
  const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `smartgym-ket-qua-${result.id}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
