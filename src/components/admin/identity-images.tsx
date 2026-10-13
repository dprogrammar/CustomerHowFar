"use client";

import { useEffect, useRef, useState } from "react";
import { X, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";

type Img = { src: string; label: string };

/**
 * ID photo and selfie side by side; tap one to open it full screen with zoom. Images load from
 * the admin-only redirect route (short-lived signed links), never from a public URL.
 */
export function IdentityImages({ images }: { images: Img[] }) {
  const [open, setOpen] = useState<Img | null>(null);
  const [zoom, setZoom] = useState(1);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <ul className="grid grid-cols-2 gap-3">
        {images.map((img) => (
          <li key={img.src}>
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setOpen(img);
              }}
              className="group block w-full overflow-hidden rounded-lg bg-gray-900 text-left ring-1 ring-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived link */}
              <img
                src={img.src}
                alt={img.label}
                className="aspect-[3/4] w-full object-contain sm:aspect-[4/3]"
              />
              <span className="flex items-center justify-between gap-1 bg-white px-2 py-1.5 text-xs font-medium text-gray-800">
                {img.label}
                <ZoomIn aria-hidden="true" className="size-4 text-gray-600" />
                <span className="sr-only">(open and zoom)</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialog}
        onClose={() => setOpen(null)}
        aria-label={open?.label ?? "Image"}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-gray-950 p-0 text-white backdrop:bg-black/80"
      >
        {open && (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-2 p-2">
              <p className="truncate px-2 text-sm font-medium">{open.label}</p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
                  disabled={zoom <= 1}
                >
                  <ZoomOut aria-hidden="true" />
                  <span className="sr-only">Zoom out</span>
                </Button>
                <span className="self-center text-sm tabular-nums" aria-live="polite">
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setZoom((z) => Math.min(4, z + 0.5))}
                  disabled={zoom >= 4}
                >
                  <ZoomIn aria-hidden="true" />
                  <span className="sr-only">Zoom in</span>
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setOpen(null)}>
                  <X aria-hidden="true" />
                  <span className="sr-only">Close</span>
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived link */}
              <img
                src={open.src}
                alt={open.label}
                style={{ width: `${zoom * 100}%`, maxWidth: "none" }}
                className="mx-auto h-auto object-contain"
              />
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
