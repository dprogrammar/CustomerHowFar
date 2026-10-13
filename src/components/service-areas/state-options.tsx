/**
 * <option>s for a state <select>: live states first, then the rest under "Coming soon".
 * Customers can still pick any state (they can browse everywhere); a business form should
 * pass `disableComingSoon`. Works in server and client components.
 */
export function StateOptions<T extends { isActive: boolean; name: string }>({
  states,
  valueOf,
  disableComingSoon = false,
  keepEnabled,
}: {
  states: T[];
  valueOf: (s: T) => string | number;
  disableComingSoon?: boolean;
  /** A coming-soon state that must stay selectable (e.g. a draft's current state). */
  keepEnabled?: string | number;
}) {
  const live = states.filter((s) => s.isActive);
  const soon = states.filter((s) => !s.isActive);
  if (soon.length === 0) {
    return live.map((s) => (
      <option key={valueOf(s)} value={valueOf(s)}>
        {s.name}
      </option>
    ));
  }
  return (
    <>
      <optgroup label="Live now">
        {live.map((s) => (
          <option key={valueOf(s)} value={valueOf(s)}>
            {s.name}
          </option>
        ))}
      </optgroup>
      <optgroup label="Coming soon">
        {soon.map((s) => {
          const value = valueOf(s);
          const disabled = disableComingSoon && String(value) !== String(keepEnabled ?? "");
          return (
            <option key={value} value={value} disabled={disabled}>
              {s.name}
              {disableComingSoon ? " (coming soon)" : ""}
            </option>
          );
        })}
      </optgroup>
    </>
  );
}
