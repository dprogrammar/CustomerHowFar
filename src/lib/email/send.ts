import "server-only";
import { appendFile } from "node:fs/promises";

export type EmailMessage = {
  to: { email: string; name?: string };
  subject: string;
  html: string;
  text: string;
  /** Short category used for logs and Brevo analytics, e.g. "listing-approved". */
  tag: string;
  /** Where replies go (e.g. the sender of a contact form message). */
  replyTo?: { email: string; name?: string };
};

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

/**
 * Sends a transactional email via Brevo. Never throws: returns false and logs (without
 * secrets or recipient addresses) on failure, so callers can't be broken by email problems.
 *
 * Test mode: when EMAIL_TEST_OUTBOX is set (a file path), messages are appended to that file
 * as JSON lines and nothing is sent. Never set it in production.
 */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  const outbox = process.env.EMAIL_TEST_OUTBOX;
  if (outbox) {
    try {
      await appendFile(
        outbox,
        `${JSON.stringify({ ...message, sentAt: new Date().toISOString() })}\n`,
      );
      return true;
    } catch {
      console.error("[email] could not write test outbox", { tag: message.tag });
      return false;
    }
  }

  const apiKey = process.env.BREVO_API_KEY;
  const fromAddress = process.env.EMAIL_FROM_ADDRESS;
  const fromName = process.env.EMAIL_FROM_NAME || "CustomerHowFar";
  if (!apiKey || !fromAddress) {
    console.warn("[email] not configured, skipped", { tag: message.tag });
    return false;
  }

  try {
    const response = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: fromAddress, name: fromName },
        to: [message.to],
        subject: message.subject,
        htmlContent: message.html,
        textContent: message.text,
        tags: [message.tag],
        ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.error("[email] Brevo rejected the message", {
        tag: message.tag,
        status: response.status,
      });
      return false;
    }
    return true;
  } catch (error) {
    console.error("[email] send failed", {
      tag: message.tag,
      error: error instanceof Error ? error.name : "unknown",
    });
    return false;
  }
}
