'use client';

import { useState } from 'react';
import type { CatalogMedia } from './catalog';
import { imageRoleLabels } from './exercise-profile';

export function ExerciseMedia({ item, card = false }: { item: CatalogMedia; card?: boolean }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  if (failed)
    return card ? null : (
      <p role="status" className="text-xs text-muted-foreground">
        Chưa tải được media minh họa. Hướng dẫn bằng chữ vẫn có ở bên dưới.
      </p>
    );

  return (
    <figure className={card ? "m-0 aspect-square overflow-hidden rounded-md bg-muted" : "overflow-hidden rounded-xl border border-border bg-card"}>
      {item.kind === 'IMAGE' ? (
        <img
          src={item.url}
          alt={item.altText}
          width={640}
          height={360}
          loading="lazy"
          decoding="async"
          ref={image => {
            if (image?.complete && !image.naturalWidth) setFailed(true);
          }}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className={card ? "h-full w-full object-contain" : "w-full object-cover"}
        />
      ) : open ? (
        <video
          aria-label={item.altText}
          src={item.url}
          controls
          playsInline
          preload="metadata"
          poster={item.posterUrl}
          onError={() => setFailed(true)}
          className="w-full"
        />
      ) : (
        <div className={item.posterUrl ? 'relative' : 'relative aspect-video bg-black'}>
          {item.posterUrl && (
            <img
              src={item.posterUrl}
              alt=""
              width={640}
              height={360}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              className="w-full object-cover"
            />
          )}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm font-semibold text-white backdrop-blur-[2px] transition-colors hover:bg-black/50"
          >
            Mở video minh họa
          </button>
        </div>
      )}
      {!card && (item.kind === 'VIDEO' || item.credit || item.role) && (
        <figcaption className="p-3 text-xs text-muted-foreground">
          {item.role ? imageRoleLabels[item.role] : item.kind === 'VIDEO' ? item.altText : null}
          {item.credit && <>{(item.kind === 'VIDEO' || item.role) && ' · '}Nguồn {item.credit}</>}
        </figcaption>
      )}
    </figure>
  );
}
