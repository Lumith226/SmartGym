export type LabelResultItem = {
  key: string;
  name_vi?: string;
  name?: string;
  detected?: boolean;
  kind?: string;
  confidence?: number;
  score?: number;
  probability?: number | null;
  threshold?: number | null;
  supported?: boolean;
  status?: string;
  hint_vi?: string;
  [key: string]: unknown;
};

export type PoseAnalysisResult = {
  status?: string;
  feedback_vi?: string;
  summary?: string;
  label_results?: LabelResultItem[];
  scope?: string;
  duration_seconds?: number;
  review_notes?: string[];
  quality?: {
    usable?: boolean;
    valid_frame_ratio?: number;
  };
  biomechanics?: {
    min_knee_angle?: number | null;
    max_torso_lean?: number | null;
  };
  angles?: Record<string, number>;
  metrics?: Record<string, number>;
  [key: string]: unknown;
};

export type TrainingResult = {
  id: string;
  exerciseId: string;
  exerciseName: string;
  source: 'camera' | 'video';
  scope: 'live' | 'whole';
  savedAt: string;
  repCount: number | null;
  feedback: string | null;
  result: PoseAnalysisResult;
};

const storageKey = (profileId: string) => `smartgym.training-results.${profileId}`;

export function readTrainingResults(profileId: string): TrainingResult[] {
  const entries: unknown = JSON.parse(localStorage.getItem(storageKey(profileId)) ?? '[]');
  return Array.isArray(entries) ? (entries as TrainingResult[]) : [];
}

export function saveTrainingResult(profileId: string, result: TrainingResult) {
  const entries = readTrainingResults(profileId);
  localStorage.setItem(storageKey(profileId), JSON.stringify([result, ...entries]));
}

export function deleteTrainingResult(profileId: string, id: string) {
  const entries = readTrainingResults(profileId).filter(e => e.id !== id);
  localStorage.setItem(storageKey(profileId), JSON.stringify(entries));
}

export function downloadTrainingResult(result: TrainingResult) {
  const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `smartgym-ket-qua-${result.exerciseId}-${result.id.slice(0, 8)}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
