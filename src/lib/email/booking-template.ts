import "server-only";

import { COMMUNICATION_BRAND } from "@/lib/communication-brand";
import { communicationAppUrl } from "@/lib/communication-brand.server";

type EmailButton = {
  label: string;
  href: string;
  secondary?: boolean;
};

export interface BookingEmailTemplateInput {
  preheader: string;
  eyebrow: string;
  headline: string;
  intro: string;
  reference: string;
  listingTitle: string;
  listingHref: string;
  imageUrl?: string | null;
  location: string;
  details: Array<{ label: string; value: string }>;
  callout?: string;
  buttons: EmailButton[];
  /**
   * Present when something a person wrote — the listing title, a guest's note, a
   * decline reason — reached this email through machine translation. Says so, and
   * carries the untranslated original so the recipient can read what was actually
   * typed. Never a place to summarise: `originals` are the words themselves.
   */
  translationNote?: {
    notice: string;
    originalLabel: string;
    originals: string[];
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function absoluteUrl(value?: string | null): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return communicationAppUrl(value);
}

export function renderBookingEmail(input: BookingEmailTemplateInput): string {
  const logoUrl = communicationAppUrl("/branding/linger-homes-primary.svg");
  const imageUrl = absoluteUrl(input.imageUrl);
  const detailCells = input.details
    .map(
      ({ label, value }) => `
        <td style="padding:10px 12px;border:1px solid #e7e5e4;vertical-align:top;width:50%;">
          <div style="font-size:11px;line-height:16px;text-transform:uppercase;letter-spacing:.06em;color:#78716c;">${escapeHtml(label)}</div>
          <div style="margin-top:2px;font-size:15px;line-height:21px;font-weight:600;color:#1c1917;">${escapeHtml(value)}</div>
        </td>`
    )
    .reduce<string[]>((rows, cell, index) => {
      if (index % 2 === 0) rows.push(`<tr>${cell}`);
      else rows[rows.length - 1] += `${cell}</tr>`;
      return rows;
    }, [])
    .map((row) => (row.endsWith("</tr>") ? row : `${row}<td></td></tr>`))
    .join("");
  const buttons = input.buttons
    .map(
      (button) => `
        <a href="${escapeHtml(button.href)}" style="display:inline-block;margin:0 8px 8px 0;padding:13px 20px;border-radius:8px;border:1px solid #292524;background:${button.secondary ? "#ffffff" : "#292524"};color:${button.secondary ? "#292524" : "#ffffff"};font-size:14px;font-weight:700;text-decoration:none;">${escapeHtml(button.label)}</a>`
    )
    .join("");

  const translationNote = input.translationNote
    ? `<tr><td style="padding:0 28px 22px;">
            <div style="padding:12px 14px;border-radius:10px;background:#fafaf9;border:1px dashed #d6d3d1;font-size:13px;line-height:20px;color:#78716c;">
              <div>${escapeHtml(input.translationNote.notice)}</div>
              <div style="margin-top:8px;font-weight:700;color:#57534e;">${escapeHtml(input.translationNote.originalLabel)}</div>
              ${input.translationNote.originals
                .map(
                  (original) =>
                    `<div style="margin-top:3px;color:#57534e;">${escapeHtml(original)}</div>`
                )
                .join("")}
            </div>
          </td></tr>`
    : "";

  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title>${escapeHtml(input.headline)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;color:#1c1917;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f4;">
      <tr><td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e7e5e4;">
          <tr><td style="padding:24px 28px;border-bottom:1px solid #e7e5e4;">
            <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(COMMUNICATION_BRAND.name)}" height="34" style="display:block;height:34px;width:auto;">
          </td></tr>
          <tr><td style="padding:28px 28px 18px;">
            <div style="font-size:12px;line-height:18px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;color:#78716c;">${escapeHtml(input.eyebrow)}</div>
            <h1 style="margin:6px 0 10px;font-size:27px;line-height:34px;color:#1c1917;">${escapeHtml(input.headline)}</h1>
            <p style="margin:0;font-size:16px;line-height:24px;color:#57534e;">${escapeHtml(input.intro)}</p>
          </td></tr>
          <tr><td style="padding:0 28px 22px;">
            <a href="${escapeHtml(input.listingHref)}" style="display:block;color:inherit;text-decoration:none;border:1px solid #e7e5e4;border-radius:12px;overflow:hidden;">
              ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(input.listingTitle)}" width="564" style="display:block;width:100%;height:250px;object-fit:cover;background:#e7e5e4;">` : ""}
              <div style="padding:16px 18px;">
                <div style="font-size:18px;line-height:24px;font-weight:700;">${escapeHtml(input.listingTitle)}</div>
                <div style="margin-top:3px;font-size:14px;line-height:20px;color:#78716c;">${escapeHtml(input.location)}</div>
              </div>
            </a>
          </td></tr>
          <tr><td style="padding:0 28px 22px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">${detailCells}</table>
            <div style="margin-top:10px;font-size:12px;line-height:18px;color:#78716c;">Booking reference: <strong style="color:#44403c;">${escapeHtml(input.reference)}</strong></div>
          </td></tr>
          ${input.callout ? `<tr><td style="padding:0 28px 22px;"><div style="padding:14px 16px;border-radius:10px;background:#fafaf9;border-left:4px solid #292524;font-size:14px;line-height:21px;color:#44403c;">${escapeHtml(input.callout)}</div></td></tr>` : ""}
          ${translationNote}
          <tr><td style="padding:0 28px 28px;">${buttons}</td></tr>
          <tr><td style="padding:20px 28px;background:#fafaf9;border-top:1px solid #e7e5e4;font-size:12px;line-height:18px;color:#78716c;">
            For your security, keep booking communication on ${escapeHtml(COMMUNICATION_BRAND.name)}.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}
