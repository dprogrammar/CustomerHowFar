import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Centers page content with consistent side padding and maximum width. */
export function Container({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("mx-auto w-full max-w-page px-4 sm:px-6 lg:px-8", className)} {...props} />
  );
}
