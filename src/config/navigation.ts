// Central list of app routes. Several pages are not built yet; links point to their
// intended routes and show the 404 page until then.

export const ROUTES = {
  home: "/",
  search: "/search",
  categories: "/categories",
  category: (slug: string) => `/categories/${slug}`,
  business: (slug: string) => `/business/${slug}`,
  login: "/login",
  signup: "/signup",
  forgotPassword: "/forgot-password",
  account: "/account",
  listBusiness: "/list-business",
  about: "/about",
  howItWorks: "/#how-it-works",
  contact: "/contact",
  pricing: "/pricing",
  businessGuide: "/help/businesses",
  help: "/help",
  safety: "/safety",
  report: "/help/report",
  terms: "/terms",
  privacy: "/privacy",
  cookies: "/cookies",
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
      { label: "Pricing", href: ROUTES.pricing },
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
      { label: "Terms of use", href: ROUTES.terms },
      { label: "Privacy policy", href: ROUTES.privacy },
      { label: "Cookie policy", href: ROUTES.cookies },
    ],
  },
];
