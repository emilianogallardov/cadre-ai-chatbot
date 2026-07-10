/**
 * Whitelist for links inside model-generated Markdown.
 *
 * Action-card URLs are already deterministic and verified (ADR-004), but the
 * assistant's prose is model text: without a gate, a prompt-injected reply
 * could render an arbitrary anchor and turn the transcript into a phishing
 * surface. Only Cadre's published origins and verified contact routes may
 * become clickable; anything else renders as plain text.
 */

const ALLOWED_HOSTS = new Set(["cadreai.com", "www.cadreai.com"]);
const ALLOWED_MAILTO = "hello@gocadre.ai";
/** Verified phone digits (US formats of (619) 324-3223). */
const ALLOWED_PHONE_DIGITS = "6193243223";

export function isVerifiedHref(href: string | undefined): boolean {
  if (!href) return false;

  if (href.startsWith("mailto:")) {
    return href.slice("mailto:".length).split("?")[0].toLowerCase() ===
      ALLOWED_MAILTO;
  }

  if (href.startsWith("tel:")) {
    const digits = href.slice("tel:".length).replace(/\D/g, "");
    return digits === ALLOWED_PHONE_DIGITS || digits === `1${ALLOWED_PHONE_DIGITS}`;
  }

  // Relative links stay inside this app (e.g. /privacy).
  if (href.startsWith("/") && !href.startsWith("//")) return true;

  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  return url.protocol === "https:" && ALLOWED_HOSTS.has(url.hostname);
}
