import { CircleCheck, CircleX } from "lucide-react";

export type Tip = { ok: boolean; text: string };

export const ID_PHOTO_TIPS: Tip[] = [
  { ok: true, text: "All four corners of the ID in the photo" },
  { ok: true, text: "ID details readable, not blurry" },
  { ok: true, text: "Good lighting, no glare on the ID" },
  { ok: false, text: "No fingers covering any details" },
  { ok: false, text: "No photocopies or photos of a screen" },
];

export const SELFIE_TIPS: Tip[] = [
  { ok: true, text: "Face and ID both clearly visible" },
  { ok: true, text: "Hold the ID beside your chin, not covering your face" },
  { ok: true, text: "ID details readable, not blurry" },
  { ok: true, text: "Good lighting, no glare" },
  { ok: false, text: "No sunglasses, caps or face masks" },
  { ok: true, text: "The name on the ID must match the name on your account" },
];

export function TipList({ tips, label }: { tips: Tip[]; label: string }) {
  return (
    <ul aria-label={label} className="space-y-2">
      {tips.map((tip) => (
        <li key={tip.text} className="flex items-start gap-2 text-sm text-gray-800">
          {tip.ok ? (
            <CircleCheck aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 text-brand-600" />
          ) : (
            <CircleX aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 text-red-600" />
          )}
          <span>
            <span className="sr-only">{tip.ok ? "Do: " : "Don't: "}</span>
            {tip.text}
          </span>
        </li>
      ))}
    </ul>
  );
}
