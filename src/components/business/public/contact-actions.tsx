"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, Mail, MessageCircle, Phone, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { track } from "./tracking";

export type ContactInfo = {
  businessId: string;
  name: string;
  phone: string;
  whatsappNumber: string;
  email: string | null;
  url: string;
  /** False for owner/admin previews of unapproved listings: actions are shown but not tracked. */
  trackable: boolean;
};

export function whatsappHref(c: Pick<ContactInfo, "whatsappNumber" | "name">) {
  const text = `Hello ${c.name}, I found you on CustomerHowFar and I'd like to ask about your services.`;
  return `https://wa.me/${c.whatsappNumber.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

/** +2348031234567 -> 0803 123 4567 */
export function displayPhone(phone: string) {
  const d = phone.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `0${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : phone;
}

function useShare(c: ContactInfo) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const data = { title: c.name, text: `${c.name} on CustomerHowFar`, url: c.url };
    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
        await navigator.share(data);
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(c.url);
    } catch {
      window.prompt("Copy this link:", c.url);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }
  return { share, copied };
}

/** Sticky bottom bar on phones (replaces the bottom navigation on business pages). */
export function ContactBar({ contact, saveSlot }: { contact: ContactInfo; saveSlot: ReactNode }) {
  const { share, copied } = useShare(contact);
  // Hide the bottom nav only while this bar is actually shown. Cleanup also runs when Next
  // keeps this page hidden for back/forward navigation, so the nav comes back elsewhere.
  useEffect(() => {
    document.body.classList.add("has-contact-bar");
    return () => document.body.classList.remove("has-contact-bar");
  }, []);
  return (
    <div
      data-contact-bar
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-white px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-nav lg:hidden"
    >
      <div className="flex items-center gap-2">
        <a
          href={whatsappHref(contact)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => contact.trackable && track(contact.businessId, "WHATSAPP")}
          className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 font-semibold text-white hover:bg-brand-700"
        >
          <MessageCircle aria-hidden="true" className="size-5" />
          WhatsApp
        </a>
        <a
          href={`tel:${contact.phone}`}
          onClick={() => contact.trackable && track(contact.businessId, "CALL")}
          className="inline-flex size-12 items-center justify-center rounded-lg text-gray-900 ring-1 ring-border hover:bg-muted"
        >
          <Phone aria-hidden="true" className="size-5" />
          <span className="sr-only">Call {contact.name}</span>
        </a>
        <button
          type="button"
          onClick={share}
          className="inline-flex size-12 items-center justify-center rounded-lg text-gray-900 ring-1 ring-border hover:bg-muted"
        >
          {copied ? (
            <Check aria-hidden="true" className="size-5 text-brand-700" />
          ) : (
            <Share2 aria-hidden="true" className="size-5" />
          )}
          <span className="sr-only">{copied ? "Link copied" : `Share ${contact.name}`}</span>
        </button>
        {saveSlot}
      </div>
      <span role="status" className="sr-only">
        {copied ? "Link copied" : ""}
      </span>
    </div>
  );
}

/** Contact card for the desktop sidebar. */
export function ContactCard({ contact, saveSlot }: { contact: ContactInfo; saveSlot: ReactNode }) {
  const { share, copied } = useShare(contact);
  const button =
    "inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg px-4 font-semibold transition-colors";
  return (
    <section
      aria-labelledby="contact-title"
      className="rounded-xl border border-border bg-white p-5 shadow-card"
    >
      <h2 id="contact-title" className="text-base font-semibold text-gray-900">
        Contact {contact.name}
      </h2>
      <div className="mt-4 space-y-2">
        <a
          href={whatsappHref(contact)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => contact.trackable && track(contact.businessId, "WHATSAPP")}
          className={cn(button, "bg-brand-600 text-white hover:bg-brand-700")}
        >
          <MessageCircle aria-hidden="true" className="size-5" />
          Chat on WhatsApp
        </a>
        <a
          href={`tel:${contact.phone}`}
          onClick={() => contact.trackable && track(contact.businessId, "CALL")}
          className={cn(button, "text-gray-900 ring-1 ring-border hover:bg-muted")}
        >
          <Phone aria-hidden="true" className="size-5" />
          Call {displayPhone(contact.phone)}
        </a>
        {contact.email && (
          <a
            href={`mailto:${contact.email}`}
            onClick={() => contact.trackable && track(contact.businessId, "EMAIL")}
            className={cn(button, "text-gray-900 ring-1 ring-border hover:bg-muted")}
          >
            <Mail aria-hidden="true" className="size-5" />
            Email
          </a>
        )}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={share}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold text-gray-900 ring-1 ring-border hover:bg-muted"
          >
            {copied ? (
              <Check aria-hidden="true" className="size-5 text-brand-700" />
            ) : (
              <Share2 aria-hidden="true" className="size-5" />
            )}
            {copied ? "Link copied" : "Share"}
          </button>
          {saveSlot}
        </div>
      </div>
      <p className="mt-4 text-xs text-gray-600">
        Tip: agree on price and timing before work starts. Never pay in full upfront.
      </p>
    </section>
  );
}
