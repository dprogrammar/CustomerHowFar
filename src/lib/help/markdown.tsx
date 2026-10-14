import Link from "next/link";
import type { ReactNode } from "react";

// A tiny markdown renderer for help answers (used by /help, the chat assistant and the admin
// preview). Supported: paragraphs (blank line between), "- " bullet lists, **bold** and
// [links](/path). Everything is rendered as React elements, never as HTML, so text is always
// escaped. Links must be site paths, #anchors, https:// or mailto: (anything else shows as text).

const SAFE_HREF = /^(\/(?!\/)|#|https:\/\/|mailto:)/;
const INLINE = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

function renderInline(text: string, key: string, onLinkClick?: () => void): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[1] !== undefined) {
      out.push(<strong key={k}>{m[1]}</strong>);
    } else {
      const [label, href] = [m[2], m[3]];
      if (!SAFE_HREF.test(href)) out.push(label);
      else if (href.startsWith("/") || href.startsWith("#"))
        out.push(
          <Link key={k} href={href} onClick={onLinkClick}>
            {label}
          </Link>,
        );
      else
        out.push(
          <a
            key={k}
            href={href}
            {...(href.startsWith("https://") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {label}
          </a>,
        );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source, onLinkClick }: { source: string; onLinkClick?: () => void }) {
  const blocks = source.replace(/\r\n?/g, "\n").trim().split(/\n\s*\n/);
  return (
    <>
      {blocks.map((block, b) => {
        const lines = block
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        if (lines.length > 0 && lines.every((l) => /^[-*] /.test(l))) {
          return (
            <ul key={b}>
              {lines.map((l, i) => (
                <li key={i}>{renderInline(l.slice(2), `${b}-${i}`, onLinkClick)}</li>
              ))}
            </ul>
          );
        }
        return <p key={b}>{renderInline(lines.join(" "), String(b), onLinkClick)}</p>;
      })}
    </>
  );
}

/** The answer as plain text (no markdown), e.g. for search snippets. */
export function markdownToText(source: string) {
  return source
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^[-*] /gm, "")
    .replace(/\s+/g, " ")
    .trim();
}
