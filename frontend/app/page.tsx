import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { libraryQuery, type CatalogParams, catalog } from './catalog';
import { publicMetadata } from './catalog-public';
import { PoseStudio } from '../components/pose-studio';
import { DEFAULT_V4_EXERCISES, type V4ExerciseConfig } from '../components/pose-studio-contracts';
import { poseCapabilities } from './exercise-pose';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<CatalogParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const query = libraryQuery(await searchParams);
  return publicMetadata(
    query.size ? undefined : '/',
    'SmartGym — Phòng tập (Quay Realtime & Phân tích Video)',
    'Quay trực tiếp qua Camera hoặc tải tệp Video bài tập để đếm lượt tập và phân tích kỹ thuật chuyển động theo thời gian thực.',
  );
}

export default async function Home({ searchParams }: Props) {
  const params = await searchParams;
  const query = libraryQuery(params);

  // Tương thích các đường dẫn lọc nhóm cơ hoặc tìm kiếm cũ
  if (query.get('muscleGroupId') || query.get('q')) {
    redirect(`/bai-tap?${query.toString()}`);
  }

  const [supported, linksRes, catalogRes] = await Promise.all([
    poseCapabilities().catch(() => []),
    catalog('/api/v1/pose-exercise-links').catch(() => ({ items: [] })),
    catalog('/api/v1/exercises?limit=100&status=PUBLISHED').catch(() => ({ items: [] })),
  ]);

  // Tạo map trạng thái bật/tắt (enabled) từ CMS
  const enabledMap = new Map<string, boolean>();
  for (const link of linksRes?.items ?? []) {
    if (link.poseId) {
      enabledMap.set(link.poseId, link.enabled !== false);
    }
  }

  // Danh sách bài tập hỗ trợ Pose kèm trạng thái enabled
  const baseExercises = supported.length ? supported.map(item => {
    const builtin = DEFAULT_V4_EXERCISES.find(value => value.id === item.id);
    return builtin ?? {
      id: item.id,
      name: item.name,
      version: item.version,
      label_count: item.label_count,
      labels: [],
      subtitle: '',
      catalogSlug: '',
    };
  }) : DEFAULT_V4_EXERCISES;

  const exercises: V4ExerciseConfig[] = baseExercises.map(ex => ({
    ...ex,
    enabled: enabledMap.has(ex.id) ? enabledMap.get(ex.id)! : true,
  }));

  // Danh sách bài tập toàn thư viện phục vụ tìm kiếm
  const libraryExercises = (catalogRes?.items ?? []).map((item: any) => ({
    id: item.id as string,
    name: (item.nameVi || item.name || item.id) as string,
    slug: (item.slug || '') as string,
  }));

  // Ưu tiên bài tập được chọn từ query URL và đang bật, hoặc bài tập đang bật đầu tiên
  const exerciseFromLink = exercises.find(item => item.id === params.exercise);
  const firstEnabled = exercises.find(item => item.enabled !== false);
  const exercise = exerciseFromLink ?? firstEnabled ?? exercises[0];

  return (
    <PoseStudio
      key={exercise.id}
      initialExercise={exercise.id}
      initialExercises={exercises}
      exerciseFromLink={Boolean(exerciseFromLink)}
      libraryExercises={libraryExercises}
    />
  );
}
