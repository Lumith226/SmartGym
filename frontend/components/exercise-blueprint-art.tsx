'use client';

import * as React from 'react';
import type { CatalogMedia } from '../app/catalog';
import { ExerciseMedia } from '../app/exercise-media';
import architecturalExercises from '../data/architectural-exercises.json';

interface BlueprintArtProps {
  exerciseId?: string;
  slug?: string;
  media?: CatalogMedia[];
  className?: string;
}

export function ExerciseBlueprintArt({
  exerciseId,
  slug,
  media,
  className,
}: BlueprintArtProps) {
  // Ưu tiên 1: Nếu có media ảnh/video thật từ Catalog API, hiển thị media
  if (media && media.length > 0 && media[0]?.url) {
    return (
      <div className="relative flex h-full w-full items-center justify-center p-3">
        <ExerciseMedia item={media[0]} card />
      </div>
    );
  }

  // Ưu tiên 2: Tìm vector bản vẽ kiến trúc tương ứng theo id hoặc slug
  const normalizedKey = (slug || exerciseId || '').toLowerCase().replace(/_/g, '-');
  const matched = architecturalExercises.find(
    item =>
      item.id === normalizedKey ||
      normalizedKey.includes(item.id) ||
      item.id.includes(normalizedKey),
  );

  if (matched) {
    return (
      <svg
        viewBox={matched.viewBox}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className || 'h-[85%] w-[85%] max-h-[190px] object-contain drop-shadow-sm transition-transform duration-300 group-hover:scale-105'}
        dangerouslySetInnerHTML={{ __html: matched.svgInner }}
      />
    );
  }

  // Mặc định: Vector Bench Press & Kinetic Force Arrow chuẩn kiến trúc
  return (
    <svg
      viewBox="0 0 320 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className || 'h-[85%] w-[85%] max-h-[190px] object-contain drop-shadow-sm transition-transform duration-300 group-hover:scale-105'}
    >
      <rect x="50" y="140" width="220" height="14" rx="4" fill="#181a20" stroke="#181a20" strokeWidth="2" />
      <rect x="75" y="154" width="12" height="32" fill="#2d313d" />
      <rect x="233" y="154" width="12" height="32" fill="#2d313d" />
      <circle cx="95" cy="130" r="11" fill="#181a20" />
      <path d="M106 132 C125 130 160 131 185 136 L185 140 L106 140 Z" fill="#181a20" />
      <path d="M118 126 C132 120 152 122 160 130 C145 134 130 133 118 126 Z" fill="#6366f1" fillOpacity="0.85" />
      <path d="M125 128 L142 85 L156 58" stroke="#181a20" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="25" y="52" width="270" height="7" rx="3.5" fill="#181a20" />
      <rect x="42" y="32" width="10" height="47" rx="3" fill="#181a20" />
      <rect x="34" y="38" width="6" height="35" rx="2" fill="#4338ca" />
      <rect x="268" y="32" width="10" height="47" rx="3" fill="#181a20" />
      <rect x="280" y="38" width="6" height="35" rx="2" fill="#4338ca" />
      <path d="M156 50 L156 26 M152 32 L156 25 L160 32" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M185 136 L210 155 L214 186" stroke="#181a20" strokeWidth="8" strokeLinecap="round" />
    </svg>
  );
}
