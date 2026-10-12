import type { ReactNode } from "react";
import { LogoMark } from "@/components/layout/logo";

/**
 * Shared shell for login, signup and password pages.
 * `social` is reserved for provider buttons (e.g. "Continue with Google"): pass them in and
 * an "or continue with email" divider appears above the email form automatically.
 */
export function AuthCard({
  title,
  description,
  social,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  social?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-2xl border border-border bg-white p-5 shadow-card sm:p-8">
        <div className="mb-6 text-center">
          <LogoMark className="mx-auto mb-4 size-10" />
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{title}</h1>
          {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
        </div>

        {social && (
          <>
            <div className="space-y-3">{social}</div>
            <div className="my-6 flex items-center gap-3 text-xs text-gray-500" role="separator">
              <span className="h-px flex-1 bg-border" />
              or continue with email
              <span className="h-px flex-1 bg-border" />
            </div>
          </>
        )}

        {children}
      </div>
      {footer && <div className="mt-6 text-center text-sm text-gray-700">{footer}</div>}
    </div>
  );
}
