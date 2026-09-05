import "server-only";

import { COMMUNICATION_BRAND } from "@/lib/communication-brand";

const BRAND_EMAIL_DOMAIN = COMMUNICATION_BRAND.publicEmail
  .split("@")[1]
  .toLowerCase();

/**
 * The env overrides exist so an operator can point at a different mailbox on the
 * brand's own domain (e.g. a Resend subdomain like `mail.lingerhomes.com`). They
 * must never be able to put an unrelated domain in front of guests: the infra
 * mailbox this app was first deployed with (`hello@book.easy.mk`) is not a brand
 * anyone receiving a booking email would recognise, and it showed up as the
 * sender of live booking mail. Anything off-domain falls back to the brand
 * address instead of being sent as-is.
 */
function brandAddressOrFallback(
  configured: string | undefined,
  fallback: string
) {
  const address =
    configured?.match(/<([^<>@\s]+@[^<>@\s]+)>/)?.[1] ||
    configured?.match(/\b[^<>\s]+@[^<>\s]+\b/)?.[0];
  if (!address) return fallback;
  const domain = address.split("@")[1]?.toLowerCase();
  const onBrandDomain =
    domain === BRAND_EMAIL_DOMAIN || domain?.endsWith(`.${BRAND_EMAIL_DOMAIN}`);
  return onBrandDomain ? address : fallback;
}

let warnedAboutAppUrl = false;

/**
 * Unlike the sender address, this can't be forced onto the brand domain: it has to
 * be wherever the app is actually served, which is localhost in dev and a preview
 * host on staging. But a stale value here means every link inside a booking email
 * points at a domain the guest doesn't recognise, and nothing else surfaces that.
 * So warn once per process instead of silently sending it.
 */
function warnIfAppUrlIsOffBrand(base: string) {
  if (warnedAboutAppUrl || process.env.NODE_ENV !== "production") return;
  const host = URL.canParse(base) ? new URL(base).hostname.toLowerCase() : "";
  if (!host || host === "localhost" || host.endsWith(".localhost")) return;
  const brandHost = new URL(COMMUNICATION_BRAND.canonicalUrl).hostname.toLowerCase();
  if (host === brandHost || host.endsWith(`.${brandHost}`)) return;
  warnedAboutAppUrl = true;
  console.warn(
    `[communication] NEXT_PUBLIC_APP_URL is "${base}", which is not on ${brandHost}. ` +
      `Links in customer email point there — update the deployment env if this domain is stale.`
  );
}

export function communicationAppUrl(path: string) {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    COMMUNICATION_BRAND.canonicalUrl;
  warnIfAppUrlIsOffBrand(base);
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function communicationSupportEmail() {
  return brandAddressOrFallback(
    process.env.SUPPORT_EMAIL,
    COMMUNICATION_BRAND.supportEmail
  );
}

export function communicationReplyToAddress() {
  return brandAddressOrFallback(
    process.env.EMAIL_REPLY_TO,
    COMMUNICATION_BRAND.publicEmail
  );
}

export function communicationFromAddress() {
  const address = brandAddressOrFallback(
    process.env.EMAIL_FROM,
    COMMUNICATION_BRAND.publicEmail
  );
  return `"${COMMUNICATION_BRAND.name}" <${address}>`;
}
