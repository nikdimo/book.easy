/** Canonical customer-facing identity shared across web, mobile, and email. */
export const COMMUNICATION_BRAND = Object.freeze({
  name: "Linger Homes",
  supportName: "Linger Homes Support",
  canonicalUrl: "https://lingerhomes.com",
  publicEmail: "hello@lingerhomes.com",
  supportEmail: "hello@lingerhomes.com",
  privacyEmail: "hello@lingerhomes.com",
});

/**
 * The legal identity named in the Terms and Privacy pages. Deliberately separate
 * from the trading brand above: the brand is what guests see everywhere, while
 * these three values are statements of fact about the operating company and are
 * the only place the site asserts a company name, jurisdiction, or postal address.
 * Keeping them here means a corporate change is one edit rather than a hunt
 * through long-form legal prose.
 */
export const LEGAL_IDENTITY = Object.freeze({
  /** Registered company name, as it should appear in legal copy. */
  entity: "Linger Homes",
  /** Whose laws govern the Terms and any dispute. */
  jurisdiction: "North Macedonia",
  /** Postal address for data requests, without the entity name. */
  mailingAddress: "North Macedonia",
});
