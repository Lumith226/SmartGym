import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { ArrowLeft, Camera, MessageSquare } from 'lucide-react';
import { catalog, readExercise, type TaxonomyItem } from '../../catalog';
import { allowedMedia, publicMetadata } from '../../catalog-public';
import { ExerciseMedia } from '../../exercise-media';
import { ExerciseProfileDetails } from '../../exercise-profile-details';
import { readExercisePoseLinks } from '../../exercise-pose';
import { Button } from '../../../components/ui/button';
import {
  cleanWikiText, ExerciseDifficultyBars, ExerciseMuscleDiagram, exerciseActiveRegions,
  WORKOUT_TYPE_LABELS, FOCUS_AREA_LABELS,
} from '../../../components/exercise-visuals';
import { WorkoutSetTracker } from '../../../components/workout-set-tracker';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const result = await readExercise((await params).slug);
    if (result.type === 'published') {
      const { exercise } = result;
      return publicMetadata('/bai-tap/' + exercise.slug, exercise.nameVi + ' — SmartGym', exercise.summary);
    }
  } catch {
    // Keep metadata available when Catalog is unreachable.
  }
  return publicMetadata(undefined, 'Chi tiết bài tập — SmartGym', 'Hướng dẫn tập luyện trong thư viện SmartGym.');
}

const panel = 'space-y-4 rounded-2xl border border-border bg-card p-5 sm:p-6';

async function taxonomy(path: string): Promise<TaxonomyItem[]> {
  return catalog(path).then(data => data.items).catch(() => []);
}

function ExerciseTaxonomy({ title, ids, items, filter }: {
  title: string;
  ids: string[];
  items: TaxonomyItem[];
  filter: 'muscleGroupId' | 'equipmentId';
}) {
  const labels = ids.flatMap(id => items.filter(item => item.id === id));
  if (!labels.length) return null;
  return <div className="space-y-2">
    <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
    <ul className="flex flex-wrap gap-2">
      {labels.map(item => <li key={item.id}>
        <Link href={'/bai-tap?' + new URLSearchParams({ [filter]: item.id })}
          className="inline-block rounded-md border border-border bg-background px-2.5 py-1 text-sm hover:border-primary hover:text-primary">
          {item.labelVi}
        </Link>
      </li>)}
    </ul>
  </div>;
}

export default async function ExercisePage({ params }: Props) {
  const result = await readExercise((await params).slug);
  if (result.type === 'missing') notFound();
  if (result.type === 'alias') permanentRedirect('/bai-tap/' + result.slug);
  const { exercise } = result;
  const [groups, equipment, poseLinks] = await Promise.all([
    taxonomy('/api/v1/muscle-groups'), taxonomy('/api/v1/equipment'), readExercisePoseLinks(),
  ]);
  const poseId = Object.hasOwn(poseLinks, exercise.id) ? poseLinks[exercise.id] : undefined;
  const media = allowedMedia(exercise.media);
  const imageOrder = { main: 0, start: 0, peak: 1 };
  const images = media.filter(item => item.kind === 'IMAGE')
    .sort((a, b) => (a.role ? imageOrder[a.role] : 2) - (b.role ? imageOrder[b.role] : 2));
  const videos = media.filter(item => item.kind === 'VIDEO');
  const { workoutType, focusArea, difficulty, levelSets, restSeconds } = exercise;
  const activeRegions = exerciseActiveRegions(exercise);

  return (
    <article className="mx-auto max-w-6xl space-y-6 pb-16">
      <nav aria-label="Đường dẫn điều hướng">
        <Link href="/bai-tap" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" /> Kho bài tập
        </Link>
      </nav>

      <header className="space-y-4 border-b border-border pb-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">{exercise.nameVi}</h1>
          {exercise.nameEn && <p lang="en" className="text-sm text-muted-foreground">{exercise.nameEn}</p>}
          <p className="max-w-3xl leading-relaxed">{cleanWikiText(exercise.summary)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          {workoutType && <Link href={'/bai-tap?workoutType=' + workoutType} className="font-medium text-foreground hover:underline">{WORKOUT_TYPE_LABELS[workoutType]}</Link>}
          {focusArea && <span>{FOCUS_AREA_LABELS[focusArea]}</span>}
          {difficulty && <span className="inline-flex items-center gap-2">Độ khó {difficulty}/5 <ExerciseDifficultyBars level={difficulty} /></span>}
        </div>
        <div className="flex flex-wrap gap-2">
          {poseId && <Button asChild size="sm">
            <Link href={'/?exercise=' + encodeURIComponent(poseId)}><Camera className="size-4" aria-hidden="true" /> Tập tại phòng tập</Link>
          </Button>}
          <Button asChild variant="outline" size="sm">
            <Link href="/hoi-dap">
              <MessageSquare className="size-4" aria-hidden="true" /> Hỏi AI Coach
            </Link>
          </Button>
        </div>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          {images.length > 0 && <section aria-labelledby="exercise-images" className="space-y-3">
            <h2 id="exercise-images" className="text-lg font-semibold">Ảnh minh họa</h2>
            <div className={images.length === 1 ? 'max-w-lg' : 'grid gap-3 sm:grid-cols-2'}>
              {images.map(item => <ExerciseMedia key={item.url} item={item} />)}
            </div>
          </section>}
          {videos.length > 0 && <section aria-labelledby="exercise-videos" className="space-y-3">
            <h2 id="exercise-videos" className="text-lg font-semibold">Video minh họa</h2>
            <div className="grid gap-3">{videos.map(item => <ExerciseMedia key={item.url} item={item} />)}</div>
          </section>}

          <section className={panel}>
            <h2 className="text-xl font-semibold">Cách thực hiện</h2>
            <ol className="list-decimal space-y-3 pl-6 leading-relaxed marker:font-semibold marker:text-primary">
              {exercise.instructions.map((step, index) => <li key={index} className="pl-1">{cleanWikiText(step)}</li>)}
            </ol>
          </section>

          {!!exercise.commonMistakes?.length && <section className={panel}>
            <h2 className="text-lg font-semibold">Lỗi thường gặp</h2>
            <ul className="list-disc space-y-2 pl-5">
              {exercise.commonMistakes.map((item, index) => <li key={index}>{cleanWikiText(item)}</li>)}
            </ul>
          </section>}
          <ExerciseProfileDetails profile={exercise.profile} publicView />
        </div>

        <aside className="space-y-5">
          <section className={panel}>
            <h2 className="text-lg font-semibold">Nhóm cơ và dụng cụ</h2>
            {activeRegions.length > 0 && <div className="flex justify-center"><ExerciseMuscleDiagram activeRegions={activeRegions} /></div>}
            <ExerciseTaxonomy title="Nhóm cơ chính" ids={exercise.primaryMuscleIds} items={groups} filter="muscleGroupId" />
            <ExerciseTaxonomy title="Nhóm cơ phụ" ids={exercise.secondaryMuscleIds} items={groups} filter="muscleGroupId" />
            {exercise.equipmentIds.length
              ? <ExerciseTaxonomy title="Dụng cụ" ids={exercise.equipmentIds} items={equipment} filter="equipmentId" />
              : <p className="text-sm text-muted-foreground">Không cần dụng cụ</p>}
          </section>
          {levelSets ? <section className={panel}><WorkoutSetTracker levelSets={levelSets} restSeconds={restSeconds} /></section>
            : restSeconds !== undefined && <section className={panel}>
              <h2 className="text-lg font-semibold">Nghỉ giữa hiệp</h2>
              <p>{restSeconds === 0 ? 'Không nghỉ' : restSeconds + ' giây'}</p>
            </section>}
        </aside>
      </div>
    </article>
  );
}
