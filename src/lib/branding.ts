import { COMMUNICATION_BRAND } from "@/lib/communication-brand";

/** Public identity shared by the website, mobile app, and transactional communication. */
export const SITE_DOMAIN = "lingerhomes.com";
export const SITE_URL = COMMUNICATION_BRAND.canonicalUrl;
export const PRODUCT_FAMILY = "Linger Homes";
export const PRODUCT_NAME = COMMUNICATION_BRAND.name;
export const SUPPORT_NAME = COMMUNICATION_BRAND.supportName;
export const PUBLIC_EMAIL = COMMUNICATION_BRAND.publicEmail;
export const SUPPORT_EMAIL = COMMUNICATION_BRAND.supportEmail;
export const PRIVACY_EMAIL = COMMUNICATION_BRAND.privacyEmail;
/** Descriptive launch copy until a final campaign tagline is approved. */
export const BRAND_TAGLINE = "Holiday homes and stays";
export const BRAND_PRIMARY = "#B84A24";
export const BRAND_SECONDARY = "#34788B";
export const BRAND_BACKGROUND = "#FBF8F5";
/** Default browser title when no page title is set. */
export const SITE_TITLE_DEFAULT = `${PRODUCT_NAME} | Holiday homes and stays`;
/** Title template segment for child pages (see root layout metadata.template). */
export const SITE_TITLE_SUFFIX = PRODUCT_NAME;
