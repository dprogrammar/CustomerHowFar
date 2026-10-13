import { getStates } from "@/lib/data/catalog";
import { formatNames } from "@/lib/service-areas/rules";

/** "Lagos", "Lagos and Ogun", ... built from the live states (cached; refreshed on toggle). */
export async function liveStatesText() {
  const states = await getStates();
  const live = states.filter((s) => s.isActive).map((s) => s.name);
  return { names: formatNames(live), allLive: live.length === states.length };
}

/** "Now live in Lagos · More states coming soon". */
export async function LiveStatesNote({ className }: { className?: string }) {
  const { names, allLive } = await liveStatesText();
  return (
    <span className={className}>
      Now live in {names}
      {allLive ? "" : " · More states coming soon"}
    </span>
  );
}
