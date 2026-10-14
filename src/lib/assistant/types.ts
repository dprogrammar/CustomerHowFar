// Chat reply shapes, shared by the server (assistant providers) and the chat panel.
// `text` fields are short markdown written by us (never the person's own words); business names
// and other data are separate fields, rendered as plain text.

export type ChatLink = { label: string; href: string };

export type ChatBusinessCard = {
  slug: string;
  name: string;
  categoryName: string;
  /** e.g. "Ikeja, Lagos". */
  place: string | null;
  ratingAverage: number;
  reviewCount: number;
  idChecked: boolean;
  logoPublicId: string | null;
};

export type ListingStatusItem = {
  name: string;
  statusLabel: string;
  tone: "neutral" | "accent" | "info" | "success" | "danger" | "dark";
  /** Null while listing is free and the business has no payment record (nothing to say). */
  payment: string | null;
  idCheck: string;
  /** Admin's note when changes were requested or the listing was suspended. */
  note: string | null;
  nextStep: string;
  action: ChatLink | null;
};

export type RelatedQuestion = { slug: string; question: string };

export type AssistantReply =
  | { kind: "text"; text: string; links?: ChatLink[] }
  | {
      kind: "answer";
      faqId: string;
      slug: string;
      question: string;
      /** The answer with live facts filled in. */
      markdown: string;
      /** Extra line shown above the answer (e.g. "We're not in Kano yet."). */
      note?: string;
      links?: ChatLink[];
      related: RelatedQuestion[];
    }
  | {
      kind: "businesses";
      text: string;
      items: ChatBusinessCard[];
      seeAll: ChatLink | null;
      links?: ChatLink[];
    }
  | { kind: "status"; text: string; items: ListingStatusItem[]; links?: ChatLink[] }
  | { kind: "fallback"; text: string; links: ChatLink[] }
  | { kind: "error"; text: string };
