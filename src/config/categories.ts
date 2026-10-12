import type { CategoryIconName } from "./category-icons";

/**
 * SEED SOURCE for the categories table (prisma/seed.ts). The app reads categories from the
 * database (src/lib/data/catalog.ts); edit here and re-run `npm run db:seed` to change them
 * until an admin screen exists.
 */
export type CategorySeed = {
  /** URL-safe identifier, used in /category/[slug] and search filters. Never change once live. */
  slug: string;
  name: string;
  /** Short description for category cards and SEO. */
  description: string;
  icon: CategoryIconName;
};

/** Ordered: the first 12 are the "Popular categories" shown on the homepage. */
export const CATEGORIES = [
  {
    slug: "fashion-tailoring",
    name: "Fashion & Tailoring",
    description: "Tailors, fashion designers and alterations",
    icon: "Shirt",
  },
  {
    slug: "electricians",
    name: "Electricians",
    description: "Wiring, installations, inverters and repairs",
    icon: "Zap",
  },
  {
    slug: "plumbers",
    name: "Plumbers",
    description: "Pipes, leaks, borehole and bathroom fittings",
    icon: "Wrench",
  },
  {
    slug: "hair-beauty",
    name: "Hair & Beauty",
    description: "Hair stylists, braiders, wigs and nails",
    icon: "Sparkles",
  },
  {
    slug: "mechanics",
    name: "Mechanics",
    description: "Car repairs, servicing and diagnostics",
    icon: "Car",
  },
  {
    slug: "carpenters",
    name: "Carpenters",
    description: "Furniture, doors, roofing and woodwork",
    icon: "Hammer",
  },
  {
    slug: "caterers-food",
    name: "Caterers & Food",
    description: "Event catering, small chops and home cooks",
    icon: "UtensilsCrossed",
  },
  {
    slug: "photographers",
    name: "Photographers",
    description: "Events, portraits, products and video",
    icon: "Camera",
  },
  {
    slug: "phone-laptop-repair",
    name: "Phone & Laptop Repair",
    description: "Screens, batteries, software and accessories",
    icon: "Smartphone",
  },
  {
    slug: "cleaners",
    name: "Cleaners",
    description: "Home, office and post-construction cleaning",
    icon: "SprayCan",
  },
  {
    slug: "painters",
    name: "Painters",
    description: "Interior, exterior and screeding",
    icon: "PaintRoller",
  },
  {
    slug: "event-planners",
    name: "Event Planners",
    description: "Weddings, parties, decor and rentals",
    icon: "PartyPopper",
  },
  {
    slug: "bricklayers",
    name: "Bricklayers",
    description: "Block work, plastering, tiling and foundations",
    icon: "BrickWall",
  },
  {
    slug: "welders",
    name: "Welders",
    description: "Gates, burglary proofs, railings and fabrication",
    icon: "Flame",
  },
  {
    slug: "ac-fridge-repair",
    name: "AC & Fridge Repair",
    description: "Air conditioner and refrigerator installation and repair",
    icon: "Snowflake",
  },
  {
    slug: "generator-repair",
    name: "Generator Repair",
    description: "Generator servicing, rewinding and repairs",
    icon: "Fuel",
  },
  {
    slug: "solar-installers",
    name: "Solar Installers",
    description: "Solar panels, inverters and battery systems",
    icon: "Sun",
  },
  {
    slug: "makeup-artists",
    name: "Makeup Artists",
    description: "Bridal, event and photo-shoot makeup",
    icon: "Palette",
  },
  {
    slug: "barbers",
    name: "Barbers",
    description: "Haircuts, shaving and grooming, including home service",
    icon: "Scissors",
  },
  {
    slug: "tutors",
    name: "Tutors",
    description: "Home lessons, exam prep (WAEC, JAMB) and languages",
    icon: "GraduationCap",
  },
  {
    slug: "drivers",
    name: "Drivers",
    description: "Private drivers, chauffeurs and dispatch riders",
    icon: "CarTaxiFront",
  },
  {
    slug: "interior-decorators",
    name: "Interior Decorators",
    description: "Interior design, curtains, POP ceilings and furnishing",
    icon: "Sofa",
  },
  {
    slug: "laundry",
    name: "Laundry & Dry Cleaning",
    description: "Washing, ironing, dry cleaning and pickup",
    icon: "WashingMachine",
  },
  {
    slug: "shoemakers",
    name: "Shoemakers",
    description: "Handmade shoes, sandals and repairs",
    icon: "Footprints",
  },
  {
    slug: "bakers",
    name: "Bakers",
    description: "Birthday and wedding cakes, bread and pastries",
    icon: "CakeSlice",
  },
  {
    slug: "pos-mobile-money",
    name: "POS & Mobile Money Agents",
    description: "Cash withdrawal, transfers, bill payments and airtime",
    icon: "CreditCard",
  },
  {
    slug: "fumigation-pest-control",
    name: "Fumigation & Pest Control",
    description: "Fumigation, pest and termite control",
    icon: "Bug",
  },
] as const satisfies readonly CategorySeed[];

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];

/** Number of categories shown as "Popular" on the homepage. */
export const POPULAR_CATEGORY_COUNT = 12;

export function getCategorySeed(slug: string): CategorySeed | undefined {
  return CATEGORIES.find((category) => category.slug === slug);
}
