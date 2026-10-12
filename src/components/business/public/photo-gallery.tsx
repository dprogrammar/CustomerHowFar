"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import { CloudinaryImage } from "@/components/cloudinary-image";

export type GalleryPhoto = {
  id: string;
  publicId: string;
  caption: string | null;
  width: number;
  height: number;
};

/**
 * Work photo grid with a full-screen lightbox. Swipe left/right on phones, arrow keys on
 * desktop, Escape or the close button to exit (native <dialog> keeps focus inside).
 * Thumbnails lazy-load; the lightbox loads one large image at a time.
 */
export function PhotoGallery({
  photos,
  businessName,
}: {
  photos: GalleryPhoto[];
  businessName: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState<number | null>(null);
  const touchStart = useRef<number | null>(null);
  const count = photos.length;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (index !== null && !dialog.open) dialog.showModal();
    if (index === null && dialog.open) dialog.close();
  }, [index]);

  const go = (delta: number) => setIndex((i) => (i === null ? i : (i + delta + count) % count));
  const photo = index !== null ? photos[index] : null;
  const alt = (p: GalleryPhoto, i: number) => p.caption || `Work photo ${i + 1} by ${businessName}`;

  return (
    <>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {photos.map((p, i) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => setIndex(i)}
              className="group relative block aspect-square w-full overflow-hidden rounded-lg bg-muted"
            >
              <CloudinaryImage
                publicId={p.publicId}
                alt={alt(p, i)}
                fill
                sizes="(min-width: 1024px) 220px, (min-width: 640px) 30vw, 50vw"
                className="object-cover transition-transform group-hover:scale-105"
              />
              <span className="absolute right-1.5 bottom-1.5 flex size-8 items-center justify-center rounded-full bg-black/50 text-white opacity-90">
                <Expand aria-hidden="true" className="size-4" />
              </span>
              <span className="sr-only">
                View photo {i + 1} of {count} full screen
              </span>
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialogRef}
        aria-label={`${businessName} photos`}
        onClose={() => setIndex(null)}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") go(1);
          if (event.key === "ArrowLeft") go(-1);
        }}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-black p-0 text-white backdrop:bg-black"
      >
        {photo && index !== null && (
          <div
            className="relative flex h-full flex-col"
            onTouchStart={(event) => (touchStart.current = event.touches[0]?.clientX ?? null)}
            onTouchEnd={(event) => {
              const start = touchStart.current;
              const end = event.changedTouches[0]?.clientX;
              touchStart.current = null;
              if (start === null || end === undefined) return;
              if (end - start > 50) go(-1);
              if (start - end > 50) go(1);
            }}
          >
            <div className="flex items-center justify-between gap-3 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
              <p className="text-sm text-white/90" aria-live="polite">
                {index + 1} / {count}
              </p>
              <button
                type="button"
                onClick={() => setIndex(null)}
                className="flex size-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
              >
                <X aria-hidden="true" className="size-6" />
                <span className="sr-only">Close photos</span>
              </button>
            </div>
            <div className="relative flex-1">
              <CloudinaryImage
                key={photo.id}
                publicId={photo.publicId}
                alt={alt(photo, index)}
                fill
                sizes="100vw"
                className="object-contain"
              />
            </div>
            {photo.caption && (
              <p className="px-4 py-3 text-center text-sm text-white/90">{photo.caption}</p>
            )}
            {count > 1 && (
              <div className="flex items-center justify-center gap-4 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <button
                  type="button"
                  onClick={() => go(-1)}
                  className="flex size-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
                >
                  <ChevronLeft aria-hidden="true" className="size-7" />
                  <span className="sr-only">Previous photo</span>
                </button>
                <span className="text-xs text-white/70">Swipe or use arrow keys</span>
                <button
                  type="button"
                  onClick={() => go(1)}
                  className="flex size-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
                >
                  <ChevronRight aria-hidden="true" className="size-7" />
                  <span className="sr-only">Next photo</span>
                </button>
              </div>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
