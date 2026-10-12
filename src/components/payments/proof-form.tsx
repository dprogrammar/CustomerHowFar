"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { FileText, LoaderCircle, Upload } from "lucide-react";
import { MAX_IMAGE_BYTES } from "@/config/uploads";
import { prepareImage, uploadToCloudinary } from "@/lib/images/client-upload";
import { submitTransferProofAction } from "@/lib/payments/transfer-actions";
import { FormAlert, TextField } from "@/components/auth/form-fields";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

function lagosToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
}

/** Sender details + receipt upload (image or PDF, max 5 MB). The server re-verifies the file. */
export function ProofForm({ businessId, feeNaira }: { businessId: string; feeNaira: number }) {
  const fileId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  function pick(f: File | undefined) {
    setFileError(null);
    setFile(null);
    if (!f) return;
    const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    if (!isPdf && !IMAGE_TYPES.includes(f.type)) {
      setFileError("That file type isn't allowed. Upload a JPG, PNG, WebP photo or a PDF.");
      return;
    }
    if (isPdf && f.size > MAX_IMAGE_BYTES) {
      setFileError(
        "That PDF is larger than 5 MB. Please upload a smaller file or a photo of the receipt.",
      );
      return;
    }
    if (!isPdf && f.size > 30 * 1024 * 1024) {
      setFileError("That photo is too large. Please choose a smaller one.");
      return;
    }
    setFile(f);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    if (!file) {
      setFileError("Please upload your payment slip or receipt.");
      return;
    }
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      // Photos are shrunk on the phone first to save data; PDFs are sent as they are.
      const isPdf = !IMAGE_TYPES.includes(file.type);
      const blob = isPdf ? file : (await prepareImage(file)).blob;
      if (blob.size > MAX_IMAGE_BYTES) throw new Error("The file is larger than 5 MB.");
      setProgress(0);
      const uploaded = await uploadToCloudinary(blob, setProgress, undefined, "proof");
      const result = await submitTransferProofAction({
        businessId,
        senderName: String(form.get("senderName") ?? ""),
        senderBank: String(form.get("senderBank") ?? ""),
        amountSent: String(form.get("amountSent") ?? ""),
        transferDate: String(form.get("transferDate") ?? ""),
        proofPublicId: uploaded.publicId,
      });
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Please try again.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate aria-label="Payment proof">
      {error && <FormAlert status="error">{error}</FormAlert>}
      <TextField
        label="Name on the account you paid from"
        name="senderName"
        autoComplete="name"
        required
        errors={fieldErrors.senderName}
      />
      <TextField
        label="Bank you paid from"
        name="senderBank"
        placeholder="e.g. GTBank, Opay, Moniepoint"
        required
        errors={fieldErrors.senderBank}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="Amount sent (₦)"
          name="amountSent"
          inputMode="decimal"
          defaultValue={String(feeNaira)}
          required
          errors={fieldErrors.amountSent}
        />
        <TextField
          label="Date of transfer"
          name="transferDate"
          type="date"
          defaultValue={lagosToday()}
          max={lagosToday()}
          required
          errors={fieldErrors.transferDate}
        />
      </div>

      <div>
        <Label htmlFor={fileId}>Payment slip or receipt</Label>
        <input
          ref={inputRef}
          id={fileId}
          name="proof"
          type="file"
          accept={ACCEPT}
          onChange={(e) => pick(e.target.files?.[0])}
          aria-describedby={`${fileId}-hint`}
          aria-invalid={fileError ? true : undefined}
          className="block w-full rounded-lg border border-dashed border-gray-300 bg-muted p-3 text-sm text-gray-800 file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:font-semibold file:text-white"
        />
        <p
          id={`${fileId}-hint`}
          className={fileError ? "mt-1.5 text-sm text-red-700" : "mt-1.5 text-sm text-gray-600"}
        >
          {fileError ??
            "A screenshot or photo of the transfer receipt, or a PDF. Max 5 MB. Only our admins can see it."}
        </p>
        {file && !fileError && (
          <p className="mt-2 flex items-center gap-2 text-sm text-gray-800">
            <FileText aria-hidden="true" className="size-4 text-gray-500" />
            {file.name}
          </p>
        )}
      </div>

      {progress !== null && (
        <div>
          <p className="mb-1 text-sm text-gray-700" aria-live="polite">
            Uploading {progress}%
          </p>
          <div
            role="progressbar"
            aria-label="Uploading receipt"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="h-2 overflow-hidden rounded-full bg-gray-200"
          >
            <div
              className="h-full rounded-full bg-brand-600 transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <Button type="submit" size="lg" fullWidth disabled={busy}>
        {busy ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <Upload aria-hidden="true" />
        )}
        {busy ? "Submitting..." : "Submit payment proof"}
      </Button>
    </form>
  );
}
