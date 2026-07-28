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

export function communicationFromAddress(
  kind: "customer" | "support" = "customer"
) {
  const configured = process.env.EMAIL_FROM?.trim();
  const configuredAddress =
    configured?.match(/<([^<>@\s]+@[^<>@\s]+)>/)?.[1] ||
    configured?.match(/\b[^<>\s]+@[^<>\s]+\b/)?.[0];
  const address =
    configuredAddress ||
    (kind === "support"
      ? COMMUNICATION_BRAND.supportEmail
      : COMMUNICATION_BRAND.publicEmail);
  const name =
    kind === "support"
      ? COMMUNICATION_BRAND.supportName
      : COMMUNICATION_BRAND.name;
  return `"${name}" <${address}>`;
}
