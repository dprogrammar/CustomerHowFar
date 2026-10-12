import { PASSWORD_MIN_LENGTH, passwordStrength } from "@/lib/validation/password";
import { cn } from "@/lib/utils";

const LEVELS = [
  { label: "Too short", bar: "bg-gray-200", text: "text-gray-600" },
  { label: "Weak", bar: "bg-red-500", text: "text-red-700" },
  { label: "Fair", bar: "bg-accent-500", text: "text-accent-800" },
  { label: "Good", bar: "bg-brand-500", text: "text-brand-800" },
  { label: "Strong", bar: "bg-brand-700", text: "text-brand-800" },
];

/** Visual strength hint. The server enforces the real rules. */
export function PasswordStrength({ password }: { password: string }) {
  const score = passwordStrength(password);
  const level = LEVELS[score]!;

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              password && score >= step ? level.bar : "bg-gray-200",
            )}
          />
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        {password ? (
          <>
            <span className={cn("font-medium", level.text)}>{level.label}.</span>{" "}
          </>
        ) : null}
        Use {PASSWORD_MIN_LENGTH}+ characters with letters and numbers. Longer is stronger.
      </p>
    </div>
  );
}
