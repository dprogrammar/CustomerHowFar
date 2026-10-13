"use client";

import { useActionState } from "react";
import { Send } from "lucide-react";
import { contactAction, type ContactState } from "@/lib/contact/actions";
import { FormAlert, SubmitButton, TextField } from "@/components/auth/form-fields";
import { Label, Textarea } from "@/components/ui/input";

const initial: ContactState = { status: "idle" };

export function ContactForm() {
  const [state, formAction, pending] = useActionState(contactAction, initial);
  const e = state.fieldErrors ?? {};

  if (state.status === "success") {
    return <FormAlert status="success">{state.message}</FormAlert>;
  }

  return (
    <form action={formAction} noValidate className="space-y-4" aria-label="Contact form">
      {state.status === "error" && state.message && (
        <FormAlert status="error">{state.message}</FormAlert>
      )}
      <TextField
        label="Your name"
        name="name"
        autoComplete="name"
        maxLength={80}
        required
        defaultValue={state.values?.name}
        errors={e.name}
      />
      <TextField
        label="Your email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        errors={e.email}
        hint="We'll reply to this address."
      />
      <TextField
        label="Subject"
        name="subject"
        maxLength={120}
        required
        defaultValue={state.values?.subject}
        errors={e.subject}
      />
      <div>
        <Label htmlFor="contact-message">Message</Label>
        <Textarea
          id="contact-message"
          name="message"
          rows={6}
          maxLength={3000}
          required
          defaultValue={state.values?.message}
          aria-invalid={e.message ? true : undefined}
          aria-describedby="contact-message-hint"
        />
        <p
          id="contact-message-hint"
          className={e.message ? "mt-1.5 text-sm text-red-700" : "mt-1.5 text-sm text-gray-600"}
        >
          {e.message?.[0] ?? "At least 20 characters. Please don't include passwords or bank PINs."}
        </p>
      </div>
      {/* Honeypot: hidden from people and screen readers; bots tend to fill it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="contact-website">Website</label>
        <input id="contact-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <SubmitButton pending={pending} pendingText="Sending..." className="w-full sm:w-auto">
        <Send aria-hidden="true" />
        Send message
      </SubmitButton>
    </form>
  );
}
