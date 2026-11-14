import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { libraryQuery, type CatalogParams } from './catalog';
import { publicMetadata } from './catalog-public';
import { PoseStudio } from '../components/pose-studio';
import { DEFAULT_V4_EXERCISES } from '../components/pose-studio-contracts';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<CatalogParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const query = libraryQuery(await searchParams);
  return publicMetadata(
    query.size ? undefined : '/',
    'SmartGym — Phòng tập AI (Quay Realtime & Phân tích Video)',
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

  const exercise = DEFAULT_V4_EXERCISES.find(item => item.id === params.exercise);
  return <PoseStudio key={exercise?.id} initialExercise={exercise?.id} />;
}
