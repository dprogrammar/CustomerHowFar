import {
  Camera,
  Car,
  Hammer,
  PaintRoller,
  PartyPopper,
  Scissors,
  Smartphone,
  Sparkles,
  SprayCan,
  UtensilsCrossed,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

export type Category = {
  /** URL-safe identifier, used in /categories/[slug] and search filters. Never change once live. */
  slug: string;
  name: string;
  /** Short description for category cards and SEO. */
  description: string;
  icon: LucideIcon;
};

export const CATEGORIES = [
  {
    slug: "fashion-tailoring",
    name: "Fashion & Tailoring",
    description: "Tailors, fashion designers and alterations",
    icon: Scissors,
  },
  {
    slug: "electricians",
    name: "Electricians",
    description: "Wiring, installations, inverters and repairs",
    icon: Zap,
  },
  {
    slug: "plumbers",
    name: "Plumbers",
    description: "Pipes, leaks, borehole and bathroom fittings",
    icon: Wrench,
  },
  {
    slug: "hair-beauty",
    name: "Hair & Beauty",
    description: "Hair stylists, barbers, makeup and nails",
    icon: Sparkles,
  },
  {
    slug: "mechanics",
    name: "Mechanics",
    description: "Car repairs, servicing and diagnostics",
    icon: Car,
  },
  {
    slug: "carpenters",
    name: "Carpenters",
    description: "Furniture, doors, roofing and woodwork",
    icon: Hammer,
  },
  {
    slug: "caterers-food",
    name: "Caterers & Food",
    description: "Event catering, small chops and home cooks",
    icon: UtensilsCrossed,
  },
  {
    slug: "photographers",
    name: "Photographers",
    description: "Events, portraits, products and video",
    icon: Camera,
  },
  {
    slug: "phone-laptop-repair",
    name: "Phone & Laptop Repair",
    description: "Screens, batteries, software and accessories",
    icon: Smartphone,
  },
  {
    slug: "cleaners",
    name: "Cleaners",
    description: "Home, office and post-construction cleaning",
    icon: SprayCan,
  },
  {
    slug: "painters",
    name: "Painters",
    description: "Interior, exterior and screeding",
    icon: PaintRoller,
  },
  {
    slug: "event-planners",
    name: "Event Planners",
    description: "Weddings, parties, decor and rentals",
    icon: PartyPopper,
  },
] as const satisfies readonly Category[];

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];

export function getCategory(slug: string): Category | undefined {
  return CATEGORIES.find((category) => category.slug === slug);
}
