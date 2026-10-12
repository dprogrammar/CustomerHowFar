// Password helpers without zod, so client components can use them without bundling zod.

export const PASSWORD_MIN_LENGTH = 8;

/** Rough client-side strength hint (0-4). Server validation is what actually applies. */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  if (!password) return 0;
  let score = 0;
  if (password.length >= PASSWORD_MIN_LENGTH) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  if (password.length < PASSWORD_MIN_LENGTH) score = Math.min(score, 1);
  return score as 0 | 1 | 2 | 3 | 4;
}
