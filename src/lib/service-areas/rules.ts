// Service areas (states). Shared by server and client; no server-only imports.

export type StateOption = { id: number; slug: string; name: string; isActive: boolean };

export const STATE_NOT_LIVE_MESSAGE =
  "Your state isn't available yet. CustomerHowFar is expanding one state at a time to keep listings trusted and quality high. Join the waitlist and we'll email you when we launch in your state.";

/** "Lagos", "Lagos and Ogun", "Lagos, Ogun and Oyo". */
export function formatNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** Live states first (alphabetical), then the rest (alphabetical). */
export function splitStates<T extends { isActive: boolean }>(states: T[]) {
  return { live: states.filter((s) => s.isActive), comingSoon: states.filter((s) => !s.isActive) };
}

export const WAITLIST_ROLES = [
  { value: "CUSTOMER", label: "I'm looking for businesses" },
  { value: "BUSINESS", label: "I want to list my business" },
] as const;
export type WaitlistRoleValue = (typeof WAITLIST_ROLES)[number]["value"];
