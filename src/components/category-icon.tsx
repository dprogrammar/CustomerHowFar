import { createElement } from "react";
import type { LucideProps } from "lucide-react";
import { getCategoryIcon } from "@/config/category-icons";

/** Renders a category's icon from its stored lucide name (unknown names get a fallback). */
export function CategoryIcon({
  name,
  ...props
}: LucideProps & { name: string | null | undefined }) {
  return createElement(getCategoryIcon(name), props);
}
