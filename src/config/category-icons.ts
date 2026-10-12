import {
  BrickWall,
  Bug,
  CakeSlice,
  Camera,
  Car,
  CarTaxiFront,
  CreditCard,
  Flame,
  Footprints,
  Fuel,
  GraduationCap,
  Hammer,
  PaintRoller,
  Palette,
  PartyPopper,
  Scissors,
  Shirt,
  Smartphone,
  Snowflake,
  Sofa,
  Sparkles,
  SprayCan,
  Store,
  Sun,
  UtensilsCrossed,
  WashingMachine,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Icons a category may use. Categories store the icon *name* in the database; only names
 * listed here can be rendered, which keeps bundles small and icons consistent. Add an
 * import and an entry here before using a new icon.
 */
export const CATEGORY_ICONS = {
  BrickWall,
  Bug,
  CakeSlice,
  Camera,
  Car,
  CarTaxiFront,
  CreditCard,
  Flame,
  Footprints,
  Fuel,
  GraduationCap,
  Hammer,
  PaintRoller,
  Palette,
  PartyPopper,
  Scissors,
  Shirt,
  Smartphone,
  Snowflake,
  Sofa,
  Sparkles,
  SprayCan,
  Store,
  Sun,
  UtensilsCrossed,
  WashingMachine,
  Wrench,
  Zap,
} as const satisfies Record<string, LucideIcon>;

export type CategoryIconName = keyof typeof CATEGORY_ICONS;

export function isCategoryIconName(name: string): name is CategoryIconName {
  return Object.hasOwn(CATEGORY_ICONS, name);
}

/** Resolves a stored icon name; unknown names fall back to a generic shop icon. */
export function getCategoryIcon(name: string | null | undefined): LucideIcon {
  return name && isCategoryIconName(name) ? CATEGORY_ICONS[name] : Store;
}
