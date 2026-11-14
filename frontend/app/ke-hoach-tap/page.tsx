import type { Metadata } from 'next';
import { catalog, type ExerciseCard } from '../catalog';
import { publicMetadata } from '../catalog-public';
import { WorkoutPlanner } from '../../components/workout-planner';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return publicMetadata(
    '/ke-hoach-tap',
    'Kế hoạch tập luyện — SmartGym',
    'Chọn lộ trình tập luyện chuẩn hóa (Full Body, Upper/Lower, Push/Pull/Legs, Tại nhà) và quản lý lịch tập 7 ngày trong tuần.',
  );
}

export default async function WorkoutPlansLandingPage() {
  const response = await catalog('/api/v1/exercises?limit=50').catch(() => null);
  const exercises: ExerciseCard[] = response?.items ?? [];

  return <WorkoutPlanner catalogExercises={exercises} />;
}
