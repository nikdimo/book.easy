import "server-only";

import { COMMUNICATION_BRAND } from "@/lib/communication-brand";

export function communicationAppUrl(path: string) {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    COMMUNICATION_BRAND.canonicalUrl;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function communicationSupportEmail() {
  return process.env.SUPPORT_EMAIL?.trim() || COMMUNICATION_BRAND.supportEmail;
}

export function communicationReplyToAddress() {
  return process.env.EMAIL_REPLY_TO?.trim() || COMMUNICATION_BRAND.publicEmail;
}

export function communicationFromAddress() {
  const configured = process.env.EMAIL_FROM?.trim();
  const configuredAddress =
    configured?.match(/<([^<>@\s]+@[^<>@\s]+)>/)?.[1] ||
    configured?.match(/\b[^<>\s]+@[^<>\s]+\b/)?.[0];
  const address = configuredAddress || COMMUNICATION_BRAND.publicEmail;
  return `"${COMMUNICATION_BRAND.name}" <${address}>`;
}
