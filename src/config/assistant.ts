// HowFar Assistant: the help chat. It is FREE to run: answers come from our own data (help
// centre entries, live settings, approved businesses) using PostgreSQL search. No AI or paid API
// is called and chat content is never sent to a third party.
//
// Plugging in an AI provider later (see src/lib/assistant/provider.ts):
//  1. implement AssistantProvider in src/lib/assistant/providers/<name>.ts,
//  2. register it in PROVIDERS in provider.ts and set AI_PROVIDER below,
//  3. switch AI_ENABLED on only after updating the Privacy Policy (chat text would then be sent
//     to that provider) and checking its data-processing terms.
// The rule-based provider stays the fallback whenever the AI provider fails.

export const ASSISTANT = {
  name: "HowFar Assistant",
  /** Feature flag for an AI provider. Off: only the free rule-based provider is used. */
  AI_ENABLED: false,
  /** Which registered provider to use when AI_ENABLED is true. */
  AI_PROVIDER: null as string | null,
  /** Longest message a person can send. */
  MAX_MESSAGE_LENGTH: 300,
  /** Business cards shown in a chat reply. */
  MAX_BUSINESS_CARDS: 3,
  /** Unanswered questions are kept (anonymously) for this long. */
  UNANSWERED_RETENTION_DAYS: 180,
} as const;

/**
 * Quick questions offered when the chat opens. `slug` answers straight from that help entry.
 * `feeOnly`: shown only while the listing fee is switched on (never while listing is free).
 */
export const QUICK_QUESTIONS: {
  label: string;
  slug?: string;
  action?: "find";
  feeOnly?: boolean;
}[] = [
  { label: "How do I list my business?", slug: "how-to-list" },
  { label: "What does 'ID submitted' mean?", slug: "id-submitted" },
  { label: "How much is the listing fee?", slug: "listing-fee", feeOnly: true },
  { label: "Which states are you in?", slug: "which-states" },
  { label: "How do I stay safe?", slug: "stay-safe" },
  { label: "Find a business", action: "find" },
];
