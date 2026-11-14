import type { Metadata } from 'next';
import {
  catalog,
  libraryQuery,
  type CatalogFacets,
  type CatalogParams,
  type ExerciseCard,
  type TaxonomyItem,
} from '../catalog';
import { publicMetadata } from '../catalog-public';
import { type MuscleGroup } from '../muscle-map';
import { ExerciseLibraryClient } from './exercise-library-client';
import { readExercisePoseLinks } from '../exercise-pose';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<CatalogParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const query = libraryQuery(await searchParams);
  return publicMetadata(
    query.size ? undefined : '/bai-tap',
    'Thư viện bài tập — SmartGym Architectural Library',
    'Khám phá thư viện bài tập kiến trúc kỹ thuật cao SmartGym theo nhóm cơ, dụng cụ và độ khó.',
  );
}

export default async function ExercisesDirectoryPage({ searchParams }: Props) {
  const query = libraryQuery(await searchParams);
  const apiQuery = new URLSearchParams(query);
  apiQuery.set('limit', '24');

  const [groupsResponse, equipmentResponse, facetsResponse, exercisesResponse, poseResponse] =
    await Promise.allSettled([
      catalog('/api/v1/muscle-groups'),
      catalog('/api/v1/equipment'),
      catalog('/api/v1/exercises/facets'),
      catalog('/api/v1/exercises?' + apiQuery),
      readExercisePoseLinks(),
    ]);

  const groups: MuscleGroup[] =
    groupsResponse.status === 'fulfilled' && groupsResponse.value?.items
      ? groupsResponse.value.items
      : [];
  const equipment: TaxonomyItem[] =
    equipmentResponse.status === 'fulfilled' && equipmentResponse.value?.items
      ? equipmentResponse.value.items
      : [];
  const facets: CatalogFacets | undefined =
    facetsResponse.status === 'fulfilled' ? facetsResponse.value : undefined;
  const exercisesData =
    exercisesResponse.status === 'fulfilled' ? exercisesResponse.value : undefined;

  const initialExercises: ExerciseCard[] = exercisesData?.items || [];
  const totalCount = facets?.total ?? exercisesData?.totalCount ?? initialExercises.length;

  return (
    <ExerciseLibraryClient
      initialExercises={initialExercises}
      muscleGroups={groups.map(g => ({ id: g.id, labelVi: g.labelVi, slug: g.id }))}
      equipmentList={equipment}
      facets={facets}
      totalCount={totalCount}
      poseLinks={poseResponse.status === 'fulfilled' ? poseResponse.value : {}}
    />
  );
}
