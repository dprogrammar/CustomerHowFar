"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CircleAlert,
  ImagePlus,
  LoaderCircle,
  Trash2,
} from "lucide-react";
import {
  addPhotoAction,
  movePhotoAction,
  removeBrandImageAction,
  removePhotoAction,
  updatePhotoCaptionAction,
  type PhotoRecord,
} from "@/lib/business/actions";
import { CAPTION_MAX, MAX_WORK_PHOTOS } from "@/lib/business/rules";
import { prepareImage, uploadToCloudinary } from "@/lib/images/client-upload";
import { CloudinaryImage } from "@/components/cloudinary-image";
import { FormAlert } from "@/components/auth/form-fields";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Kind = "logo" | "cover" | "work";

type UploadItem = {
  key: string;
  kind: Kind;
  name: string;
  previewUrl: string;
  progress: number;
  stage: "preparing" | "uploading" | "saving" | "error";
  error?: string;
};

let uploadSeq = 0;
/** Stable, unique keys for in-progress uploads (only called from event handlers). */
function nextUploadKey() {
  uploadSeq += 1;
  return `upload-${uploadSeq}`;
}

const STAGE_TEXT = {
  preparing: "Optimizing...",
  uploading: "Uploading",
  saving: "Saving...",
  error: "Failed",
} as const;

export function StepPhotos({
  businessId,
  initial,
}: {
  businessId: string;
  initial: { logoPublicId: string | null; coverPublicId: string | null; photos: PhotoRecord[] };
}) {
  const [logo, setLogo] = useState(initial.logoPublicId);
  const [cover, setCover] = useState(initial.coverPublicId);
  const [photos, setPhotos] = useState<PhotoRecord[]>(initial.photos);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const queue = useRef(Promise.resolve());

  const pendingWork = uploads.filter((u) => u.kind === "work" && u.stage !== "error").length;
  const slotsLeft = MAX_WORK_PHOTOS - photos.length - pendingWork;

  function patch(key: string, changes: Partial<UploadItem>) {
    setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...changes } : u)));
  }

  function enqueue(files: File[], kind: Kind) {
    setMessage(null);
    let accepted = files;
    if (kind === "work" && files.length > slotsLeft) {
      accepted = files.slice(0, Math.max(0, slotsLeft));
      setMessage({
        tone: "error",
        text: `You can add up to ${MAX_WORK_PHOTOS} work photos. ${files.length - accepted.length} photo(s) were not added.`,
      });
    }
    for (const file of accepted) {
      const item: UploadItem = {
        key: nextUploadKey(),
        kind,
        name: file.name,
        previewUrl: URL.createObjectURL(file),
        progress: 0,
        stage: "preparing",
      };
      setUploads((list) => [...list, item]);
      // One upload at a time: kinder to slow, metered connections.
      queue.current = queue.current.then(() => runUpload(item, file));
    }
  }

  async function runUpload(item: UploadItem, file: File) {
    try {
      const prepared = await prepareImage(file, { keepTransparency: item.kind === "logo" });
      patch(item.key, { stage: "uploading" });
      const uploaded = await uploadToCloudinary(prepared.blob, (progress) =>
        patch(item.key, { progress }),
      );
      patch(item.key, { stage: "saving", progress: 100 });
      const result = await addPhotoAction({
        businessId,
        kind: item.kind,
        publicId: uploaded.publicId,
      });
      if (!result.ok) throw new Error(result.error);
      if (result.data.kind === "work") {
        const photo = result.data.photo;
        setPhotos((list) => [...list, photo]);
      } else if (result.data.kind === "logo") {
        setLogo(result.data.publicId);
      } else {
        setCover(result.data.publicId);
      }
      URL.revokeObjectURL(item.previewUrl);
      setUploads((list) => list.filter((u) => u.key !== item.key));
    } catch (error) {
      patch(item.key, {
        stage: "error",
        error: error instanceof Error ? error.message : "Upload failed. Please try again.",
      });
    }
  }

  function dismiss(key: string) {
    setUploads((list) => {
      const item = list.find((u) => u.key === key);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return list.filter((u) => u.key !== key);
    });
  }

  async function removeBrand(kind: "logo" | "cover") {
    if (confirmDelete !== kind) {
      setConfirmDelete(kind);
      return;
    }
    setBusy(kind);
    const result = await removeBrandImageAction({ businessId, kind });
    setBusy(null);
    setConfirmDelete(null);
    if (!result.ok) return setMessage({ tone: "error", text: result.error });
    if (kind === "logo") setLogo(null);
    else setCover(null);
  }

  async function removePhoto(photoId: string) {
    if (confirmDelete !== photoId) {
      setConfirmDelete(photoId);
      return;
    }
    setBusy(photoId);
    const result = await removePhotoAction({ businessId, photoId });
    setBusy(null);
    setConfirmDelete(null);
    if (!result.ok) return setMessage({ tone: "error", text: result.error });
    setPhotos((list) => list.filter((p) => p.id !== photoId));
  }

  async function move(photoId: string, direction: "up" | "down") {
    setBusy(photoId);
    const result = await movePhotoAction({ businessId, photoId, direction });
    setBusy(null);
    if (!result.ok) return setMessage({ tone: "error", text: result.error });
    setPhotos(result.data);
  }

  async function saveCaption(photo: PhotoRecord, caption: string) {
    if ((photo.caption ?? "") === caption.trim()) return;
    const result = await updatePhotoCaptionAction({ businessId, photoId: photo.id, caption });
    if (!result.ok) return setMessage({ tone: "error", text: result.error });
    setPhotos((list) =>
      list.map((p) => (p.id === photo.id ? { ...p, caption: caption.trim() || null } : p)),
    );
  }

  const canContinue = Boolean(logo) || photos.length > 0;
  const stillUploading = uploads.some((u) => u.stage !== "error");

  return (
    <div className="space-y-8">
      <p className="text-sm text-gray-700">
        Photos are resized on your phone before upload to save data. Add a logo or at least one
        photo of your work.
      </p>

      {message && <FormAlert status={message.tone}>{message.text}</FormAlert>}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <BrandSlot
          title="Logo"
          hint="Square works best."
          publicId={logo}
          kind="logo"
          aspect="aspect-square"
          uploads={uploads.filter((u) => u.kind === "logo")}
          onPick={(files) => enqueue(files.slice(0, 1), "logo")}
          onRemove={() => removeBrand("logo")}
          confirming={confirmDelete === "logo"}
          busy={busy === "logo"}
          onDismiss={dismiss}
        />
        <BrandSlot
          title="Cover photo"
          hint="A wide photo of your shop or best work."
          publicId={cover}
          kind="cover"
          aspect="aspect-[16/9]"
          uploads={uploads.filter((u) => u.kind === "cover")}
          onPick={(files) => enqueue(files.slice(0, 1), "cover")}
          onRemove={() => removeBrand("cover")}
          confirming={confirmDelete === "cover"}
          busy={busy === "cover"}
          onDismiss={dismiss}
        />
      </div>

      <section aria-labelledby="work-photos-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="work-photos-title" className="text-base font-semibold text-gray-900">
              Work photos
            </h2>
            <p className="text-sm text-gray-600" aria-live="polite">
              {photos.length} of {MAX_WORK_PHOTOS} added. Show real jobs you have done.
            </p>
          </div>
          <PickButton
            label="Add photos"
            multiple
            disabled={slotsLeft <= 0}
            onPick={(files) => enqueue(files, "work")}
          />
        </div>

        <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {photos.map((photo, index) => (
            <li
              key={photo.id}
              className="overflow-hidden rounded-xl border border-border bg-white shadow-card"
            >
              <div className="relative aspect-[4/3] bg-muted">
                <CloudinaryImage
                  publicId={photo.publicId}
                  alt={photo.caption || `Work photo ${index + 1}`}
                  fill
                  sizes="(min-width: 640px) 360px, 100vw"
                  className="object-cover"
                />
              </div>
              <div className="space-y-3 p-3">
                <div>
                  <label htmlFor={`caption-${photo.id}`} className="sr-only">
                    Caption for photo {index + 1}
                  </label>
                  <input
                    id={`caption-${photo.id}`}
                    defaultValue={photo.caption ?? ""}
                    maxLength={CAPTION_MAX}
                    placeholder="Add a caption (optional)"
                    onBlur={(event) => saveCaption(photo, event.target.value)}
                    className="h-10 w-full rounded-lg border border-border px-3 text-base focus-visible:border-brand-600 focus-visible:outline-2 focus-visible:outline-brand-600/30"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={index === 0 || busy === photo.id}
                    onClick={() => move(photo.id, "up")}
                  >
                    <ArrowUp aria-hidden="true" />
                    <span className="sr-only">Move photo {index + 1}</span> Up
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={index === photos.length - 1 || busy === photo.id}
                    onClick={() => move(photo.id, "down")}
                  >
                    <ArrowDown aria-hidden="true" />
                    <span className="sr-only">Move photo {index + 1}</span> Down
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy === photo.id}
                    onClick={() => removePhoto(photo.id)}
                    onBlur={() => setConfirmDelete(null)}
                    className="ml-auto text-red-700 hover:border-red-200 hover:bg-red-50"
                  >
                    <Trash2 aria-hidden="true" />
                    {confirmDelete === photo.id ? "Tap again to delete" : "Delete"}
                    <span className="sr-only"> photo {index + 1}</span>
                  </Button>
                </div>
              </div>
            </li>
          ))}
          {uploads
            .filter((u) => u.kind === "work")
            .map((item) => (
              <li key={item.key}>
                <UploadCard item={item} onDismiss={dismiss} />
              </li>
            ))}
        </ul>
      </section>

      <div className="sticky bottom-[calc(var(--spacing-bottom-nav)+env(safe-area-inset-bottom))] z-10 -mx-4 flex gap-3 border-t border-border bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 md:bottom-0">
        <Link
          href={`/business/${businessId}/edit?step=3`}
          className={buttonVariants({ variant: "outline", size: "lg", className: "px-4 sm:px-6" })}
        >
          <ArrowLeft aria-hidden="true" />
          Back
        </Link>
        <Link
          href={`/business/${businessId}/edit?step=5`}
          aria-disabled={stillUploading || undefined}
          onClick={(event) => {
            if (stillUploading) {
              event.preventDefault();
              setMessage({
                tone: "error",
                text: "Please wait for your photos to finish uploading.",
              });
            }
          }}
          className={buttonVariants({
            size: "lg",
            className: cn(
              "min-w-0 flex-1 px-4 sm:flex-none sm:px-8",
              stillUploading && "opacity-60",
            ),
          })}
        >
          {canContinue ? "Continue" : "Skip for now"}
          <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

function PickButton({
  label,
  multiple = false,
  disabled,
  onPick,
}: {
  label: string;
  multiple?: boolean;
  disabled?: boolean;
  onPick: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        multiple={multiple}
        hidden
        aria-hidden="true"
        tabIndex={-1}
        data-upload={label}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) onPick(files);
        }}
      />
      <Button
        type="button"
        variant="secondary"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
      >
        <ImagePlus aria-hidden="true" />
        {label}
      </Button>
    </>
  );
}

function UploadCard({ item, onDismiss }: { item: UploadItem; onDismiss: (key: string) => void }) {
  const failed = item.stage === "error";
  return (
    <div
      className={cn(
        "flex gap-3 rounded-xl border p-3",
        failed ? "border-red-200 bg-red-50" : "border-border bg-white",
      )}
    >
      {/* Local preview of the file being uploaded (object URL, not a remote image). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.previewUrl} alt="" className="size-16 shrink-0 rounded-lg object-cover" />
      <div className="min-w-0 flex-1" aria-live="polite">
        <p className="truncate text-sm font-medium text-gray-900">{item.name}</p>
        {failed ? (
          <>
            <p className="mt-1 flex items-start gap-1.5 text-sm text-red-800">
              <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {item.error}
            </p>
            <button
              type="button"
              onClick={() => onDismiss(item.key)}
              className="mt-1 text-sm font-semibold text-red-800 underline"
            >
              Dismiss
            </button>
          </>
        ) : (
          <>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-gray-600">
              {item.stage !== "uploading" && (
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              )}
              {STAGE_TEXT[item.stage]}
              {item.stage === "uploading" && ` ${item.progress}%`}
            </p>
            <div
              role="progressbar"
              aria-label={`Uploading ${item.name}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={item.progress}
              className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200"
            >
              <div
                className="h-full rounded-full bg-brand-600 transition-[width]"
                style={{ width: `${item.progress}%` }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function BrandSlot({
  title,
  hint,
  publicId,
  kind,
  aspect,
  uploads,
  onPick,
  onRemove,
  confirming,
  busy,
  onDismiss,
}: {
  title: string;
  hint: string;
  publicId: string | null;
  kind: "logo" | "cover";
  aspect: string;
  uploads: UploadItem[];
  onPick: (files: File[]) => void;
  onRemove: () => void;
  confirming: boolean;
  busy: boolean;
  onDismiss: (key: string) => void;
}) {
  const uploading = uploads.some((u) => u.stage !== "error");
  return (
    <section aria-label={title} className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-600">{hint}</p>
      </div>
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border border-dashed border-gray-300 bg-muted",
          aspect,
          kind === "logo" && "max-w-48",
        )}
      >
        {publicId ? (
          <CloudinaryImage
            publicId={publicId}
            alt={`${title} preview`}
            fill
            sizes="(min-width: 640px) 400px, 100vw"
            className={kind === "logo" ? "object-contain p-2" : "object-cover"}
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-sm text-gray-600">
            No {title.toLowerCase()} yet
          </span>
        )}
      </div>
      {uploads.map((item) => (
        <UploadCard key={item.key} item={item} onDismiss={onDismiss} />
      ))}
      <div className="flex flex-wrap gap-2">
        <PickButton
          label={publicId ? `Replace ${title.toLowerCase()}` : `Add ${title.toLowerCase()}`}
          disabled={uploading}
          onPick={onPick}
        />
        {publicId && (
          <Button
            type="button"
            variant="outline"
            disabled={busy || uploading}
            onClick={onRemove}
            className="text-red-700 hover:border-red-200 hover:bg-red-50"
          >
            <Trash2 aria-hidden="true" />
            {confirming ? "Tap again to remove" : "Remove"}
          </Button>
        )}
      </div>
    </section>
  );
}
