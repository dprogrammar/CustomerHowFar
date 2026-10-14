"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowUp,
  BadgeCheck,
  ChevronRight,
  Star,
  Store,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { ASSISTANT, QUICK_QUESTIONS } from "@/config/assistant";
import {
  askAssistantAction,
  assistantFeedbackAction,
  assistantStartAction,
} from "@/lib/assistant/actions";
import type {
  AssistantReply,
  ChatBusinessCard,
  ChatLink,
  ListingStatusItem,
} from "@/lib/assistant/types";
import { Markdown } from "@/lib/help/markdown";
import { CloudinaryImage } from "@/components/cloudinary-image";
import { LogoMark } from "@/components/layout/logo";
import { cn } from "@/lib/utils";

// The HowFar Assistant chat panel. Loaded on demand by chat-launcher.tsx. A native modal
// <dialog> gives the focus trap, Escape to close and focus return for free. The conversation
// lives only in this component's memory: it is never stored.

type AskInput = Parameters<typeof askAssistantAction>[0];
type Message =
  { id: number; from: "user"; text: string } | { id: number; from: "bot"; reply: AssistantReply };

const GREETING: AssistantReply = {
  kind: "text",
  text: `Hi! I'm the **${ASSISTANT.name}**, an automated helper, not a person. Ask me about using CustomerHowFar, or tell me what you need, like **plumber in Lekki**.`,
};

const bubbleProse =
  "[&_p+p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_a]:font-medium [&_a]:text-brand-800 [&_a]:underline [&_a]:underline-offset-2 [&_strong]:font-semibold";

export default function ChatPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const titleId = useId();
  const inputId = useId();
  const noteId = useId();
  const [messages, setMessages] = useState<Message[]>([{ id: 0, from: "bot", reply: GREETING }]);
  const [text, setText] = useState("");
  const [showStatus, setShowStatus] = useState(false);
  // Unknown until the server says; fee-only questions stay hidden until then.
  const [feeOn, setFeeOn] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // On larger screens, go straight to typing. On phones, keep the keyboard closed so the
      // greeting and quick questions stay visible.
      if (window.matchMedia("(min-width: 40rem)").matches) inputRef.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Offer "My listing status" to business owners, and fee questions only while the fee is on.
  useEffect(() => {
    let alive = true;
    assistantStartAction()
      .then((r) => {
        if (!alive) return;
        setShowStatus(r.showListingStatus);
        setFeeOn(r.feeOn);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, pending]);

  function ask(input: AskInput, shown: string) {
    if (pending) return;
    const userId = nextId.current++;
    const botId = nextId.current++;
    setMessages((m) => [...m, { id: userId, from: "user", text: shown }]);
    startTransition(async () => {
      let reply: AssistantReply;
      try {
        reply = await askAssistantAction(input);
      } catch {
        reply = {
          kind: "error",
          text: "Sorry, something went wrong. Check your connection and try again.",
        };
      }
      setMessages((m) => [...m, { id: botId, from: "bot", reply }]);
    });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value || pending) return;
    setText("");
    ask({ text: value.slice(0, ASSISTANT.MAX_MESSAGE_LENGTH) }, value);
  }

  const left = ASSISTANT.MAX_MESSAGE_LENGTH - text.length;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop (outside the panel) closes the chat.
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        // Keep Tab inside the chat: wrap from the last control to the first and back (a modal
        // dialog alone lets focus escape to the browser's toolbar).
        if (e.key !== "Tab") return;
        const focusable = [
          ...e.currentTarget.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), [tabindex="0"]',
          ),
        ].filter((el) => el.offsetParent !== null);
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }}
      className={cn(
        "m-0 h-dvh max-h-none w-full max-w-none border-0 bg-white p-0 text-gray-900 backdrop:bg-gray-950/40",
        "sm:inset-auto sm:right-4 sm:bottom-24 sm:h-[min(40rem,calc(100dvh-7.5rem))] sm:w-[24rem] sm:overflow-hidden sm:rounded-2xl sm:shadow-raised sm:ring-1 sm:ring-border sm:backdrop:bg-gray-950/15",
      )}
    >
      <div className="flex h-full flex-col">
        <header className="flex items-center gap-3 bg-brand-700 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
          <span className="rounded-xl bg-white p-1">
            <LogoMark className="size-8" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base leading-tight font-semibold">
              {ASSISTANT.name}
            </h2>
            <p className="text-xs text-brand-100">Automated help · usually instant</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-11 items-center justify-center rounded-full text-white hover:bg-white/15 focus-visible:outline-white"
          >
            <X aria-hidden="true" className="size-6" />
            <span className="sr-only">Close chat</span>
          </button>
        </header>

        <div
          role="log"
          aria-label="Chat messages"
          // Scrollable region: keyboard users can focus it to scroll.
          tabIndex={0}
          className="flex-1 space-y-3 overflow-y-auto overscroll-contain bg-surface px-3 py-4 focus-visible:outline-offset-[-2px]"
        >
          {messages.map((m, i) =>
            m.from === "user" ? (
              <UserBubble key={m.id} text={m.text} />
            ) : (
              <BotBubble key={m.id}>
                <ReplyView reply={m.reply} onAsk={ask} onNavigate={onClose} disabled={pending} />
                {i === 0 && (
                  <QuickQuestions
                    showStatus={showStatus}
                    feeOn={feeOn}
                    onAsk={ask}
                    disabled={pending}
                  />
                )}
              </BotBubble>
            ),
          )}
          {pending && (
            <BotBubble typing>
              <span className="flex items-center gap-1 py-1" aria-hidden="true">
                <span className="size-2 animate-bounce rounded-full bg-gray-500 [animation-delay:-0.2s]" />
                <span className="size-2 animate-bounce rounded-full bg-gray-500 [animation-delay:-0.1s]" />
                <span className="size-2 animate-bounce rounded-full bg-gray-500" />
              </span>
              <span className="sr-only">{ASSISTANT.name} is typing…</span>
            </BotBubble>
          )}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={onSubmit}
          className="border-t border-border bg-white px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          <div className="flex items-center gap-2">
            <label htmlFor={inputId} className="sr-only">
              Type your question
            </label>
            <input
              ref={inputRef}
              id={inputId}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={ASSISTANT.MAX_MESSAGE_LENGTH}
              autoComplete="off"
              enterKeyHint="send"
              placeholder="Ask a question…"
              aria-describedby={noteId}
              className="h-12 min-w-0 flex-1 rounded-full border border-border bg-white px-4 text-base text-gray-900 placeholder:text-gray-500 focus-visible:border-brand-600"
            />
            <button
              type="submit"
              disabled={pending || !text.trim()}
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
            >
              <ArrowUp aria-hidden="true" className="size-5" />
              <span className="sr-only">Send</span>
            </button>
          </div>
          {left <= 50 && (
            <p className="mt-1 pr-14 text-right text-xs text-gray-600" aria-live="polite">
              {left} characters left
            </p>
          )}
          <p id={noteId} className="mt-2 text-center text-xs text-gray-600">
            Automated answers, not a person. Please don&apos;t share personal details.{" "}
            <Link
              href="/contact"
              onClick={onClose}
              className="font-medium text-brand-800 underline underline-offset-2"
            >
              Contact our team
            </Link>
          </p>
        </form>
      </div>
    </dialog>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div data-from="user" className="flex justify-end">
      <p className="max-w-[85%] rounded-2xl rounded-tr-sm bg-brand-700 px-3.5 py-2.5 text-sm break-words whitespace-pre-wrap text-white">
        <span className="sr-only">You: </span>
        {text}
      </p>
    </div>
  );
}

function BotBubble({ children, typing }: { children: React.ReactNode; typing?: boolean }) {
  return (
    <div data-from={typing ? "typing" : "bot"} className="flex items-start gap-2">
      <LogoMark className="mt-0.5 size-7" />
      <div
        className={cn(
          "max-w-[88%] min-w-0 rounded-2xl rounded-tl-sm bg-white px-3.5 py-2.5 text-sm leading-6 text-gray-900 shadow-xs ring-1 ring-border",
          bubbleProse,
        )}
      >
        <span className="sr-only">{ASSISTANT.name}: </span>
        {children}
      </div>
    </div>
  );
}

function QuickQuestions({
  showStatus,
  feeOn,
  onAsk,
  disabled,
}: {
  showStatus: boolean;
  feeOn: boolean;
  onAsk: (input: AskInput, shown: string) => void;
  disabled: boolean;
}) {
  return (
    <div role="group" aria-label="Quick questions" className="mt-3 flex flex-wrap gap-2">
      {showStatus && (
        <Chip disabled={disabled} onClick={() => onAsk({ action: "status" }, "My listing status")}>
          My listing status
        </Chip>
      )}
      {QUICK_QUESTIONS.filter((q) => feeOn || !q.feeOnly).map((q) => (
        <Chip
          key={q.label}
          disabled={disabled}
          onClick={() => onAsk(q.slug ? { slug: q.slug } : { action: "find" }, q.label)}
        >
          {q.label}
        </Chip>
      ))}
    </div>
  );
}

function Chip({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-10 rounded-full bg-brand-50 px-3 py-1.5 text-left text-sm font-medium text-brand-800 ring-1 ring-brand-200 hover:bg-brand-100 disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function LinkButtons({ links, onNavigate }: { links?: ChatLink[]; onNavigate: () => void }) {
  if (!links?.length) return null;
  return (
    <div className="!mt-3 flex flex-wrap gap-2">
      {links.map((l) => (
        <Link
          key={l.href + l.label}
          href={l.href}
          onClick={onNavigate}
          className="inline-flex min-h-10 items-center gap-1 rounded-full bg-white px-3 py-1.5 text-sm font-semibold !text-brand-800 !no-underline ring-1 ring-brand-300 hover:bg-brand-50"
        >
          {l.label}
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      ))}
    </div>
  );
}

function ReplyView({
  reply,
  onAsk,
  onNavigate,
  disabled,
}: {
  reply: AssistantReply;
  onAsk: (input: AskInput, shown: string) => void;
  onNavigate: () => void;
  disabled: boolean;
}) {
  switch (reply.kind) {
    case "text":
    case "fallback":
      return (
        <>
          <Markdown source={reply.text} onLinkClick={onNavigate} />
          <LinkButtons links={reply.links} onNavigate={onNavigate} />
        </>
      );
    case "error":
      return <p className="text-red-800">{reply.text}</p>;
    case "answer":
      return (
        <>
          {reply.note && (
            <div className="mb-2 rounded-lg bg-brand-50 px-3 py-2 text-brand-900">
              <Markdown source={reply.note} onLinkClick={onNavigate} />
            </div>
          )}
          <p className="font-semibold">{reply.question}</p>
          <div className="mt-1">
            <Markdown source={reply.markdown} onLinkClick={onNavigate} />
          </div>
          <LinkButtons links={reply.links} onNavigate={onNavigate} />
          <Feedback faqId={reply.faqId} onNavigate={onNavigate} />
          {reply.related.length > 0 && (
            <div className="mt-3 border-t border-border pt-2">
              <p className="text-xs font-semibold text-gray-700">Related questions</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {reply.related.map((r) => (
                  <Chip
                    key={r.slug}
                    disabled={disabled}
                    onClick={() => onAsk({ slug: r.slug }, r.question)}
                  >
                    {r.question}
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </>
      );
    case "businesses":
      return (
        <>
          <Markdown source={reply.text} onLinkClick={onNavigate} />
          {reply.items.length > 0 && (
            <ul className="!mt-2 !list-none !space-y-2 !pl-0">
              {reply.items.map((b) => (
                <li key={b.slug}>
                  <BusinessCard business={b} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          )}
          {reply.seeAll && <LinkButtons links={[reply.seeAll]} onNavigate={onNavigate} />}
          <LinkButtons links={reply.links} onNavigate={onNavigate} />
        </>
      );
    case "status":
      return (
        <>
          <p>{reply.text}</p>
          <ul className="!mt-2 !list-none !space-y-2 !pl-0">
            {reply.items.map((item, i) => (
              <li key={i}>
                <StatusCard item={item} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
          <LinkButtons links={reply.links} onNavigate={onNavigate} />
        </>
      );
  }
}

function BusinessCard({
  business: b,
  onNavigate,
}: {
  business: ChatBusinessCard;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={`/business/${b.slug}`}
      onClick={onNavigate}
      className="flex items-center gap-3 rounded-xl bg-white p-2.5 !text-gray-900 !no-underline ring-1 ring-border hover:bg-muted"
    >
      <span className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-brand-50">
        {b.logoPublicId ? (
          <CloudinaryImage
            publicId={b.logoPublicId}
            alt=""
            fill
            sizes="48px"
            loading="eager"
            className="object-cover"
          />
        ) : (
          <Store aria-hidden="true" className="absolute inset-0 m-auto size-6 text-brand-700/50" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{b.name}</span>
        <span className="block truncate text-xs text-gray-600">
          {[b.categoryName, b.place].filter(Boolean).join(" · ")}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-700">
          {b.reviewCount > 0 ? (
            <span className="inline-flex items-center gap-0.5">
              <Star aria-hidden="true" className="size-3.5 fill-accent-400 text-accent-500" />
              {b.ratingAverage.toFixed(1)}
              <span className="text-gray-600">
                ({b.reviewCount} review{b.reviewCount === 1 ? "" : "s"})
              </span>
            </span>
          ) : (
            <span>No reviews yet</span>
          )}
          {b.idChecked && (
            <span className="inline-flex items-center gap-0.5 text-brand-800">
              <BadgeCheck aria-hidden="true" className="size-3.5" />
              ID submitted
            </span>
          )}
        </span>
      </span>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-gray-500" />
    </Link>
  );
}

const TONES: Record<ListingStatusItem["tone"], string> = {
  neutral: "bg-gray-100 text-gray-800",
  accent: "bg-accent-50 text-accent-900 ring-1 ring-accent-200",
  info: "bg-blue-50 text-blue-900 ring-1 ring-blue-200",
  success: "bg-brand-50 text-brand-900 ring-1 ring-brand-200",
  danger: "bg-red-50 text-red-900 ring-1 ring-red-200",
  dark: "bg-gray-800 text-white",
};

function StatusCard({ item, onNavigate }: { item: ListingStatusItem; onNavigate: () => void }) {
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-border">
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{item.name}</span>
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", TONES[item.tone])}>
          {item.statusLabel}
        </span>
      </p>
      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        {item.payment && (
          <>
            <dt className="text-gray-600">Payment</dt>
            <dd>{item.payment}</dd>
          </>
        )}
        <dt className="text-gray-600">ID check</dt>
        <dd>{item.idCheck}</dd>
        <dt className="text-gray-600">Next step</dt>
        <dd>{item.nextStep}</dd>
      </dl>
      {item.note && (
        <p className="mt-1.5 rounded-md bg-red-50 px-2 py-1 text-xs text-red-900">
          <strong>Our note:</strong> {item.note}
        </p>
      )}
      {item.action && <LinkButtons links={[item.action]} onNavigate={onNavigate} />}
    </div>
  );
}

function Feedback({ faqId, onNavigate }: { faqId: string; onNavigate: () => void }) {
  const [vote, setVote] = useState<"yes" | "no" | null>(null);
  const labelId = useId();
  const send = (helpful: boolean) => {
    setVote(helpful ? "yes" : "no");
    assistantFeedbackAction({ faqId, helpful }).catch(() => {});
  };
  if (vote) {
    return (
      <p role="status" className="mt-2 text-xs text-gray-700">
        {vote === "yes" ? (
          "Thanks for letting us know!"
        ) : (
          <>
            Sorry about that. Try asking another way, or{" "}
            <Link href="/contact" onClick={onNavigate}>
              contact our team
            </Link>
            .
          </>
        )}
      </p>
    );
  }
  return (
    <div role="group" aria-labelledby={labelId} className="mt-2 flex items-center gap-2 text-xs">
      <span id={labelId} className="text-gray-700">
        Did this help?
      </span>
      <button
        type="button"
        onClick={() => send(true)}
        className="inline-flex h-8 items-center gap-1 rounded-full px-3 font-medium text-gray-800 ring-1 ring-border hover:bg-muted"
      >
        <ThumbsUp aria-hidden="true" className="size-3.5" />
        Yes
      </button>
      <button
        type="button"
        onClick={() => send(false)}
        className="inline-flex h-8 items-center gap-1 rounded-full px-3 font-medium text-gray-800 ring-1 ring-border hover:bg-muted"
      >
        <ThumbsDown aria-hidden="true" className="size-3.5" />
        No
      </button>
    </div>
  );
}
