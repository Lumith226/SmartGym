'use client';

import { RefreshCw, Sparkles } from 'lucide-react';
import { exercisePath, type Exercise } from './cms';
import { cleanWikiText, FOCUS_AREA_LABELS, WORKOUT_TYPE_LABELS } from '../../components/exercise-visuals';
import { DraftMediaReferences } from './draft-references';
import { ExerciseProfileDetails } from '../exercise-profile-details';
import { LoadError, useCmsPage } from './cms-request';

export function DraftPreview({ id }: { id: string }) {
  const { data, error, retry } = useCmsPage<Exercise>(exercisePath(id));

  if (error) return <LoadError error={error} retry={retry} />;
  if (!data) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground" role="status">
        <RefreshCw className="size-4 animate-spin" />
        Đang tải bản xem trước…
      </div>
    );
  }

  return (
    <article className="cms-preview mx-auto max-w-5xl space-y-6 rounded-xl border border-border bg-card p-5 sm:p-8">
      {/* Banner chế độ xem trước */}
      <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 px-3.5 py-2 text-xs font-semibold text-amber-600 dark:text-amber-400">
        <Sparkles className="size-4" />
        <p>Đang xem bản nháp · Phiên bản {data.draftVersion}</p>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{data.nameVi}</h1>
        {data.nameEn && <p className="mt-1 text-sm italic text-muted-foreground">{data.nameEn}</p>}
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">{cleanWikiText(data.summary)}</p>
      </div>

      {/* Thông số kỹ thuật bài tập */}
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-border/80 bg-muted/40 p-4 sm:grid-cols-4">
        <div>
          <span className="block text-[11px] font-semibold uppercase text-muted-foreground">Loại hình</span>
          <span className="mt-0.5 block text-sm font-bold text-foreground">{data.workoutType ? WORKOUT_TYPE_LABELS[data.workoutType] : 'Chưa đặt'}</span>
        </div>
        <div>
          <span className="block text-[11px] font-semibold uppercase text-muted-foreground">Trọng tâm</span>
          <span className="mt-0.5 block text-sm font-bold text-foreground">{data.focusArea ? FOCUS_AREA_LABELS[data.focusArea] : 'Chưa đặt'}</span>
        </div>
        <div>
          <span className="block text-[11px] font-semibold uppercase text-muted-foreground">Độ khó</span>
          <span className="mt-0.5 block text-sm font-bold text-foreground">{data.difficulty ?? 'Chưa đặt'}</span>
        </div>
        <div>
          <span className="block text-[11px] font-semibold uppercase text-muted-foreground">Nghỉ giữa hiệp</span>
          <span className="mt-0.5 block text-sm font-bold text-foreground">{data.restSeconds === undefined ? 'Chưa đặt' : `${data.restSeconds} giây`}</span>
        </div>
      </div>

      {/* Hướng dẫn chi tiết */}
      <div className="grid overflow-hidden rounded-xl border border-border lg:grid-cols-[7fr_5fr]">
      <div className="space-y-3 p-5">
        <h2 className="text-lg font-bold text-foreground">Cách thực hiện</h2>
        <ol className="space-y-2.5 rounded-2xl border border-border/60 bg-muted/20 p-5">
          {data.instructions.map((item, index) => (
            <li key={index} className="flex items-start gap-3 text-sm leading-relaxed text-foreground">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {index + 1}
              </span>
              <span className="pt-0.5">{cleanWikiText(item)}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Lỗi thường gặp */}
        <div className="space-y-3 border-t border-border bg-muted/30 p-5 lg:border-l lg:border-t-0">
          <h2 className="text-lg font-bold text-foreground">Lỗi thường gặp</h2>
          {data.commonMistakes?.length ? <ul className="space-y-2">
            {data.commonMistakes.map((item, index) => (
              <li key={index} className="flex items-start gap-2.5 text-sm text-foreground">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-destructive" />
                <span>{item}</span>
              </li>
            ))}
          </ul> : <p className="text-sm text-muted-foreground">Chưa có ghi chú.</p>}
        </div>
      </div>

      <ExerciseProfileDetails profile={data.profile} />
      <DraftMediaReferences ids={data.mediaIds} roles={data.imageRoles} />
    </article>
  );
}
