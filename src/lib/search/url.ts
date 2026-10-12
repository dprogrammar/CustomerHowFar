// URL helpers shared by the search page, category pages and their filters (server + client).

export type SearchValues = {
  q?: string;
  category?: string;
  state?: string;
  lga?: string;
  sort?: string;
  page?: number;
};

export type SearchMode = { kind: "search" } | { kind: "category"; categorySlug: string };

/**
 * Canonical URL for a set of filters. Category pages put the state in the path
 * (/category/tailors/lagos) for SEO; everything else is a query parameter.
 */
export function searchHref(mode: SearchMode, values: SearchValues) {
  const params = new URLSearchParams();
  let path = "/search";
  if (mode.kind === "category") {
    path = `/category/${mode.categorySlug}${values.state ? `/${values.state}` : ""}`;
    if (values.q) params.set("q", values.q);
  } else {
    if (values.q) params.set("q", values.q);
    if (values.category) params.set("category", values.category);
    if (values.state) params.set("state", values.state);
  }
  if (values.state && values.lga) params.set("lga", values.lga);
  if (values.sort && values.sort !== "best") params.set("sort", values.sort);
  if (values.page && values.page > 1) params.set("page", String(values.page));
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function readParam(value: string | string[] | undefined, max = 80) {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;
}
