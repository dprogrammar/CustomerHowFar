/**
 * ============================================================================
 *  SAMPLE DATA - NOT REAL BUSINESSES
 * ============================================================================
 * Placeholder profiles for designing the homepage. Names, ratings and review
 * counts are invented. Replace with real data from the database before launch,
 * then delete this file. While IS_SAMPLE_DATA is true, the UI labels these
 * listings as samples so visitors are not misled.
 */

import type { CategorySlug } from "@/config/categories";
import type { StateSlug } from "@/config/states";

export const IS_SAMPLE_DATA = true;

export type FeaturedBusiness = {
  slug: string;
  name: string;
  categorySlug: CategorySlug;
  /** One-line description of what they do. */
  tagline: string;
  city: string;
  stateSlug: StateSlug;
  rating: number;
  reviewCount: number;
  verified: boolean;
  yearsInBusiness: number;
};

export const SAMPLE_FEATURED_BUSINESSES: FeaturedBusiness[] = [
  {
    slug: "sample-adaeze-couture",
    name: "Adaeze Couture",
    categorySlug: "fashion-tailoring",
    tagline: "Bespoke native wear, bridal and aso-ebi",
    city: "Lekki",
    stateSlug: "lagos",
    rating: 4.9,
    reviewCount: 128,
    verified: true,
    yearsInBusiness: 8,
  },
  {
    slug: "sample-brightspark-electrical",
    name: "BrightSpark Electrical",
    categorySlug: "electricians",
    tagline: "House wiring, solar and inverter installation",
    city: "Wuse",
    stateSlug: "fct",
    rating: 4.8,
    reviewCount: 96,
    verified: true,
    yearsInBusiness: 11,
  },
  {
    slug: "sample-mama-tee-kitchen",
    name: "Mama Tee's Kitchen",
    categorySlug: "caterers-food",
    tagline: "Party jollof, small chops and event catering",
    city: "Ibadan",
    stateSlug: "oyo",
    rating: 4.9,
    reviewCount: 214,
    verified: true,
    yearsInBusiness: 6,
  },
  {
    slug: "sample-emeka-auto-works",
    name: "Emeka Auto Works",
    categorySlug: "mechanics",
    tagline: "Toyota and Honda specialist, computer diagnosis",
    city: "Enugu",
    stateSlug: "enugu",
    rating: 4.7,
    reviewCount: 73,
    verified: false,
    yearsInBusiness: 14,
  },
  {
    slug: "sample-glow-by-zainab",
    name: "Glow by Zainab",
    categorySlug: "hair-beauty",
    tagline: "Braids, wigs, bridal makeup and home service",
    city: "Kano",
    stateSlug: "kano",
    rating: 4.8,
    reviewCount: 152,
    verified: true,
    yearsInBusiness: 5,
  },
  {
    slug: "sample-fixit-gadgets",
    name: "FixIt Gadgets Hub",
    categorySlug: "phone-laptop-repair",
    tagline: "Same-day phone screens, batteries and laptops",
    city: "Port Harcourt",
    stateSlug: "rivers",
    rating: 4.6,
    reviewCount: 88,
    verified: true,
    yearsInBusiness: 7,
  },
];
