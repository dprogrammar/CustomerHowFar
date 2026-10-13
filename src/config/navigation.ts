// Central list of app routes. Every footer link must point to a real page or anchor
// (tests check that none of them 404).

export const ROUTES = {
  home: "/",
  search: "/search",
  categories: "/categories",
  category: (slug: string) => `/category/${slug}`,
  categoryInState: (slug: string, state: string) => `/category/${slug}/${state}`,
  saved: "/saved",
  business: (slug: string) => `/business/${slug}`,
  login: "/login",
  signup: "/signup",
  forgotPassword: "/forgot-password",
  account: "/account",
  dashboard: "/dashboard",
  listBusiness: "/business/new",
  about: "/about",
  howItWorks: "/#how-it-works",
  contact: "/contact",
  pricing: "/help#listing-fee",
  businessGuide: "/help#for-businesses",
  help: "/help",
  safety: "/safety",
  report: "/help#report-a-problem",
  terms: "/terms",
  privacy: "/privacy",
  cookies: "/privacy#cookies",
} as const;

export type NavLink = { label: string; href: string };

export const MAIN_NAV: NavLink[] = [
  { label: "Browse", href: ROUTES.search },
  { label: "Categories", href: ROUTES.categories },
];

export const FOOTER_NAV: { title: string; links: NavLink[] }[] = [
  {
    title: "About",
    links: [
      { label: "About us", href: ROUTES.about },
      { label: "How it works", href: ROUTES.howItWorks },
      { label: "Contact us", href: ROUTES.contact },
    ],
  },
  {
    title: "For Businesses",
    links: [
      { label: "List your business", href: ROUTES.listBusiness },
      { label: "Listing fee", href: ROUTES.pricing },
      { label: "Business guide", href: ROUTES.businessGuide },
    ],
  },
  {
    title: "Help",
    links: [
      { label: "Help centre", href: ROUTES.help },
      { label: "Safety tips", href: ROUTES.safety },
      { label: "Report a problem", href: ROUTES.report },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms of Service", href: ROUTES.terms },
      { label: "Privacy Policy", href: ROUTES.privacy },
      { label: "Cookies", href: ROUTES.cookies },
    ],
  },
];
