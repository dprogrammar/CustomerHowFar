import "server-only";
import { ASSISTANT } from "@/config/assistant";
import { rulesProvider } from "./rules-provider";
import type { AssistantReply } from "./types";

// Where chat replies come from. Today only the free rule-based provider exists. An AI provider
// can be added later behind ASSISTANT.AI_ENABLED (see src/config/assistant.ts); the rule-based
// provider then remains the fallback if it fails.

export type AssistantUser = { id: string; nameParts: string[] };

export type AssistantContext = {
  /** The signed-in person (verified on the server), loaded only when a reply needs it. */
  getUser: () => Promise<AssistantUser | null>;
};

export interface AssistantProvider {
  id: string;
  reply(text: string, ctx: AssistantContext): Promise<AssistantReply>;
}

/** Registered providers by id. Add an AI provider here when one is built. */
const PROVIDERS: Record<string, AssistantProvider> = {
  [rulesProvider.id]: rulesProvider,
};

function withFallback(primary: AssistantProvider): AssistantProvider {
  return {
    id: primary.id,
    async reply(text, ctx) {
      try {
        return await primary.reply(text, ctx);
      } catch {
        return rulesProvider.reply(text, ctx);
      }
    },
  };
}

export function getAssistantProvider(): AssistantProvider {
  const aiId = ASSISTANT.AI_PROVIDER;
  if (ASSISTANT.AI_ENABLED && aiId && aiId !== rulesProvider.id && PROVIDERS[aiId]) {
    return withFallback(PROVIDERS[aiId]);
  }
  return rulesProvider;
}
