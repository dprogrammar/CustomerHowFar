"use client";

import { useId, useState, type ComponentProps, type ReactNode } from "react";
import { CircleAlert, CircleCheck, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function FieldMessages({ id, errors, hint }: { id: string; errors?: string[]; hint?: ReactNode }) {
  if (errors?.length) {
    return (
      <ul id={id} className="mt-1.5 space-y-0.5 text-sm text-red-700">
        {errors.map((error) => (
          <li key={error} className="flex items-start gap-1.5">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {error}
          </li>
        ))}
      </ul>
    );
  }
  if (hint) {
    return (
      <div id={id} className="mt-1.5 text-sm text-muted-foreground">
        {hint}
      </div>
    );
  }
  return null;
}

type TextFieldProps = Omit<ComponentProps<"input">, "id"> & {
  label: string;
  name: string;
  errors?: string[];
  hint?: ReactNode;
  labelAction?: ReactNode;
};

export function TextField({ label, name, errors, hint, labelAction, ...props }: TextFieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const hasMessage = Boolean(errors?.length || hint);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {labelAction}
      </div>
      <Input
        id={id}
        name={name}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={hasMessage ? messageId : undefined}
        {...props}
      />
      <FieldMessages id={messageId} errors={errors} hint={hint} />
    </div>
  );
}

/** Password input with a show/hide toggle (helps a lot when typing on a phone). */
export function PasswordField({
  label,
  name,
  errors,
  hint,
  labelAction,
  ...props
}: TextFieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const [visible, setVisible] = useState(false);
  const hasMessage = Boolean(errors?.length || hint);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {labelAction}
      </div>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={errors?.length ? true : undefined}
          aria-describedby={hasMessage ? messageId : undefined}
          className="pr-12"
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-controls={id}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-lg text-gray-500 hover:text-gray-800"
        >
          {visible ? (
            <EyeOff aria-hidden="true" className="size-5" />
          ) : (
            <Eye aria-hidden="true" className="size-5" />
          )}
          <span className="sr-only">{visible ? "Hide password" : "Show password"}</span>
        </button>
      </div>
      <FieldMessages id={messageId} errors={errors} hint={hint} />
    </div>
  );
}

export function FormAlert({
  status,
  children,
  className,
}: {
  status: "error" | "success";
  children: ReactNode;
  className?: string;
}) {
  const Icon = status === "error" ? CircleAlert : CircleCheck;
  return (
    <div
      role={status === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-sm ring-1 ring-inset",
        status === "error"
          ? "bg-red-50 text-red-800 ring-red-200"
          : "bg-brand-50 text-brand-900 ring-brand-200",
        className,
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function SubmitButton({
  pending,
  pendingText,
  children,
  ...props
}: ButtonProps & { pending: boolean; pendingText: string }) {
  return (
    <Button type="submit" size="lg" fullWidth disabled={pending} aria-disabled={pending} {...props}>
      {pending ? (
        <>
          <LoaderCircle aria-hidden="true" className="animate-spin" />
          {pendingText}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
