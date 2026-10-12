/**
 * URL slug: lowercase ASCII letters, digits and single hyphens.
 * "Jama'are" -> "jamaare", "Itas/Gadau" -> "itas-gadau", "Ọ̀yọ́" -> "oyo".
 */
export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
