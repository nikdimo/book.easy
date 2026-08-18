import { Linking, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as WebBrowser from "expo-web-browser";
import * as ExpoLinking from "expo-linking";
import { formatLocalizedDate } from "@/lib/date-locale";

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
const defaultApiUrl = Platform.OS === "web" ? "http://localhost:3000" : "https://lingerhomes.com";
export const API_BASE_URL = (configuredApiUrl || defaultApiUrl).replace(/\/$/, "");
const MOBILE_SESSION_TOKEN_KEY = "lingerhomes.mobile.session-token";

const INTL_LOCALES: Readonly<Record<string, string>> = {
  en: "en-US",
  mk: "mk-MK",
  sq: "sq-AL",
  sr: "sr-Cyrl-RS",
  tr: "tr-TR",
  bg: "bg-BG",
  ro: "ro-RO",
  de: "de-DE",
  el: "el-GR",
  it: "it-IT",
  fr: "fr-FR",
  es: "es-ES",
  nl: "nl-NL",
  pl: "pl-PL",
  uk: "uk-UA",
  ru: "ru-RU",
};

export function resolveIntlLocale(locale?: string): string {
  if (!locale) return INTL_LOCALES.en;
  return INTL_LOCALES[locale.toLowerCase()] ?? locale;
}

export interface SessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  role: string;
  isHost: boolean;
  /** False for a signed-in guest: the session is real, but this app has nothing for
   *  them. Distinguishing it from "no session" is what stops the sign-in loop. */
  canManageProperties: boolean;
}

export interface DashboardResponse {
  stats: {
    listings: number;
    pendingBookings: number;
    confirmedBookings: number;
    totalBookings: number;
  };
}

export interface ListingSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: string;
  needsReview: boolean;
  city: string;
  country: string;
  imageUrl: string | null;
  nightlyRate: number | null;
  currency: string;
  promotion: {
    id: string;
    type: "PERCENT_DISCOUNT" | "FREE_CLEANING";
    discountPercent: number | null;
    minimumNights: number | null;
  } | null;
  bookingCount: number;
  updatedAt: string;
}

export interface ListingsResponse {
  listings: ListingSummary[];
  drafts: {
    id: string;
    title: string;
    /** Resolved server-side from the canonical step list, so this screen carries
     *  no step titles or totals of its own. */
    step: { id: string; title: string; position: number; total: number };
    updatedAt: string;
  }[];
}

export interface ListingDraftData {
  /** Where the host left off. The id is authoritative; the index is a legacy
   *  fallback whose meaning shifts whenever the wizard is reordered. */
  currentStepId?: string;
  currentStep?: number;
  title?: string;
  description?: string;
  propertyType?: string;
  spaceType?: "ENTIRE_PLACE" | "PRIVATE_ROOM" | "SHARED_ROOM" | "HOTEL_ROOM";
  address?: string;
  city?: string;
  area?: string;
  postalCode?: string;
  country?: string;
  latitude?: string;
  longitude?: string;
  locationSource?: string;
  locationConfirmed?: string;
  geocodingProvider?: string;
  geocodingPlaceId?: string;
  geocodingConfidence?: string;
  streetViewHeading?: string;
  streetViewPitch?: string;
  streetViewPanoId?: string;
  mediaItems?: ListingMediaItem[];
  imageUrls?: string[];
  promotionType?: string;
  promotionPercent?: string;
  promotionMinimumNights?: string;
  maxGuests?: string;
  bedrooms?: string;
  beds?: string;
  bathrooms?: string;
  baseNightlyRate?: string;
  cleaningFee?: string;
  minNights?: string;
  amenityIds?: string[];
  /** Date-specific launch setup shared with the web wizard. Missing or malformed
   * legacy data is returned by the server as an unanswered availability choice. */
  prePublishPlan?: ListingPrePublishPlan;
}

export type ListingAvailabilityStart =
  | { mode: "now" }
  | { mode: "from"; startDate: string }
  | { mode: "selected" };

export interface ListingPrePublishRange {
  startDate: string;
  endDate: string;
}

export interface ListingPrePublishPlan {
  blocks: ListingPrePublishRange[];
  openDates: ListingPrePublishRange[];
  datePrices: (ListingPrePublishRange & { nightlyRate: number })[];
  offers: (ListingPrePublishRange & {
    discountPercent: number;
    freeCleaning: boolean;
  })[];
  availabilityStart: ListingAvailabilityStart | null;
}

export interface ListingStep {
  id: string;
  title: string;
  description: string;
}

export interface ListingEditorResponse {
  /** The canonical wizard order, owned by the server. Never hardcode a copy of
   *  this — the app renders whatever it is sent, including steps this build has
   *  no dedicated screen for yet. */
  steps: ListingStep[];
  propertyTypes: {
    value: string;
    label: string;
    icon: string;
    description: string;
  }[];
  amenities: {
    id: string;
    name: string;
    category: string;
    icon: string | null;
  }[];
}

export interface ListingDraftResponse {
  draftId: string;
  data: ListingDraftData;
  updatedAt: string;
}

export interface BookingSummary {
  id: string;
  reference: string;
  listingId: string;
  listingTitle: string;
  imageUrl: string | null;
  city: string;
  guestName: string;
  guestCount: number;
  guestNote: string | null;
  checkIn: string;
  checkOut: string;
  totalPrice: number;
  status: string;
  responseDueAt: string;
  cancellationReason: string | null;
  createdAt: string;
}

export interface BookingsResponse {
  bookings: BookingSummary[];
}

export interface PromotionSummary {
  id: string;
  discountPercent: number;
  minimumNights: number;
  freeCleaning: boolean;
  roundToWholeUnit: boolean;
  /** yyyy-MM-dd, or null for an always-active offer. */
  startDate: string | null;
  endDate: string | null;
}

export interface AvailabilityResponse {
  listing: {
    id: string;
    slug: string;
    title: string;
    status: string;
    availabilityMode: "OPEN" | "CLOSED";
    baseNightlyRate: number | null;
    cleaningFee: number;
    minNights: number;
    maxNights: number;
    currency: string;
  };
  promotions: PromotionSummary[];
  availabilityWindows: {
    id: string;
    startDate: string;
    endDate: string;
  }[];
  blocks: {
    id: string;
    startDate: string;
    endDate: string;
    blockType: string;
    feedId?: string | null;
    reason: string | null;
    booking: {
      id: string;
      status: string;
      guest: { name: string };
    } | null;
  }[];
  prices: { id: string; date: string; nightlyRate: number }[];
}

export interface NotificationSummary {
  id: string;
  type:
    | "BOOKING_REQUEST"
    | "BOOKING_CONFIRMED"
    | "BOOKING_REJECTED"
    | "BOOKING_CANCELLED"
    | "CHAT_MESSAGE"
    | "SUPPORT_MESSAGE"
    | "CASE_SUBMITTED"
    | "CASE_UPDATED"
    | "SYSTEM";
  title: string;
  body: string;
  route: string | null;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsResponse {
  unreadCount: number;
  notifications: NotificationSummary[];
}

export interface ConversationSummary {
  id: string;
  kind: "INQUIRY" | "BOOKING";
  status: "OPEN" | "FROZEN" | "CLOSED";
  hasSupport: boolean;
  booking: {
    id: string;
    status: string;
    checkIn: string;
    checkOut: string;
  } | null;
  listing: { id: string; title: string; imageUrl: string | null };
  otherUser: { id: string; name: string; image: string | null };
  unreadCount: number;
  lastMessage: {
    body: string;
    createdAt: string;
    senderId: string | null;
  } | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
}

export interface ConversationsResponse {
  conversations: ConversationSummary[];
}

export interface ChatMessage {
  id: string;
  clientId: string | null;
  body: string;
  sender: { id: string; name: string; image: string | null };
  senderId: string | null;
  senderRole: "MEMBER" | "SUPPORT";
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

export interface ChatResponse {
  conversation: {
    id: string;
    kind: "INQUIRY" | "BOOKING";
    status: "OPEN" | "FROZEN" | "CLOSED";
    booking: {
      id: string;
      reference: string;
      status: string;
      checkIn: string;
      checkOut: string;
      numberOfNights: number;
      guestCount: number;
      currency: string;
      totalPrice: number;
      detailsUrl: string;
    } | null;
    listing: { id: string; title: string; imageUrl: string | null };
    participants: {
      userId: string;
      role: "MEMBER" | "SUPPORT";
      user: { id: string; name: string; image: string | null };
    }[];
  };
  nextCursor: string | null;
  messages: ChatMessage[];
  bookingEvents: {
    id: string;
    type: string;
    actorId: string | null;
    data: unknown;
    createdAt: string;
  }[];
  damageReports: {
    id: string;
    description: string;
    status: string;
    reporterId: string | null;
    createdAt: string;
    reporter: { id: string; name: string; image: string | null } | null;
    evidence: {
      id: string;
      url: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
    }[];
  }[];
}

export interface LanguageOption {
  code: string;
  name: string;
  isDefault: boolean;
  useAiTranslation: boolean;
}

export interface LanguagesResponse {
  locale: string;
  languages: LanguageOption[];
  messages: Record<string, string>;
}

/** A failed request, carrying the parts a screen needs to react rather than just a
 *  message to print. The server already distinguishes "not signed in" from "signed in
 *  but not allowed" via `code` (see requireMobileUser / requireMobileAdmin); throwing a
 *  bare Error threw that away and left every screen rendering the raw string
 *  "Authentication required" instead of sending the host to sign in. */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }

  /** No usable session — the caller should route to /login. */
  get isUnauthenticated(): boolean {
    return this.status === 401 || this.code === "UNAUTHENTICATED";
  }

  /** Signed in, but this account may not do it. Re-authenticating will not help. */
  get isForbidden(): boolean {
    return this.status === 403;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = Platform.OS === "web" ? null : await AsyncStorage.getItem(MOBILE_SESSION_TOKEN_KEY);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      body?.error ?? `Request failed (${response.status})`,
      response.status,
      body?.code
    );
  }
  return body as T;
}

export function absoluteMediaUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_BASE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

export async function openControlPanel(path: string): Promise<void> {
  const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  await Linking.openURL(url);
}

export interface ListingMediaItem {
  id?: string;
  url: string;
  mediaType: "IMAGE" | "VIDEO";
  alt?: string | null;
}

export interface PlaceSuggestion {
  placeId: string;
  description: string;
  primaryText?: string;
  secondaryText?: string;
}

export interface ResolvedPlace {
  latitude: number;
  longitude: number;
  address?: string;
  city?: string;
  area?: string;
  postalCode?: string;
  country?: string;
  provider?: string;
  placeId?: string;
  confidence?: string;
}

/** Multipart upload. Deliberately does not go through apiFetch: that sets a JSON
 *  Content-Type, and a multipart body must be left alone so the runtime can add its
 *  own boundary. */
export async function uploadFile(file: Blob | FormDataValue, name: string): Promise<{
  url: string;
  mediaType: "IMAGE" | "VIDEO";
}> {
  const form = new FormData();
  form.append("file", file as Blob, name);

  const response = await fetch(`${API_BASE_URL}/api/mobile/v1/upload`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      body?.error ?? `Upload failed (${response.status})`,
      response.status,
      body?.code
    );
  }
  return body;
}

/** React Native's FormData accepts a {uri,name,type} descriptor where the web
 *  expects a Blob. Typed loosely because the two platforms genuinely differ. */
export type FormDataValue = { uri: string; name: string; type: string };

export async function searchPlaces(
  query: string,
  sessionToken: string,
  bias?: { latitude: number; longitude: number }
): Promise<PlaceSuggestion[]> {
  const body = await apiFetch<{ results: PlaceSuggestion[] }>(
    "/api/mobile/v1/location/autocomplete",
    { method: "POST", body: JSON.stringify({ query, sessionToken, bias }) }
  );
  return body.results ?? [];
}

export async function resolvePlace(
  placeId: string,
  sessionToken: string
): Promise<ResolvedPlace> {
  const body = await apiFetch<{ result: ResolvedPlace }>(
    "/api/mobile/v1/location/place-details",
    { method: "POST", body: JSON.stringify({ placeId, sessionToken }) }
  );
  return body.result;
}

export async function reverseGeocodePoint(
  latitude: number,
  longitude: number
): Promise<ResolvedPlace> {
  const body = await apiFetch<{ result: ResolvedPlace }>(
    "/api/mobile/v1/location/reverse",
    { method: "POST", body: JSON.stringify({ latitude, longitude }) }
  );
  return body.result;
}

export async function hasStreetView(
  latitude: number,
  longitude: number
): Promise<boolean> {
  const body = await apiFetch<{ available: boolean }>(
    "/api/mobile/v1/location/streetview",
    { method: "POST", body: JSON.stringify({ latitude, longitude }) }
  );
  return Boolean(body.available);
}

export async function startAuth(
  provider: "google" | "email" | "signout",
  email?: string
): Promise<void> {
  const native = Platform.OS !== "web";
  const suffix = native ? "?native=1" : "";
  const path =
    provider === "google"
      ? `/mobile-auth/google${suffix}`
      : provider === "signout"
        ? `/mobile-auth/signout${suffix}`
        : `/mobile-auth/email?email=${encodeURIComponent(email ?? "")}${native ? "&native=1" : ""}`;
  const url = `${API_BASE_URL}${path}`;

  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.open(url, "host-mobile-auth", "popup,width=520,height=720");
    return;
  }
  const result = await WebBrowser.openAuthSessionAsync(url, ExpoLinking.createURL("auth"));
  if (result.type !== "success" || !result.url) return;
  const parsed = new URL(result.url);
  const handoff = parsed.searchParams.get("handoff");
  if (!handoff) return;
  const exchanged = await fetch(`${API_BASE_URL}/api/mobile/v1/auth/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ handoff }),
  });
  const body = await exchanged.json().catch(() => null);
  if (!exchanged.ok || typeof body?.token !== "string") {
    throw new Error(body?.error ?? "Could not complete mobile sign-in");
  }
  await AsyncStorage.setItem(MOBILE_SESSION_TOKEN_KEY, body.token);
}

export async function clearMobileSessionToken(): Promise<void> {
  await AsyncStorage.removeItem(MOBILE_SESSION_TOKEN_KEY);
}

export function formatDate(value: string, locale?: string): string {
  const parsed = new Date(value);
  const dateOnly = new Date(
    parsed.getUTCFullYear(),
    parsed.getUTCMonth(),
    parsed.getUTCDate(),
    12
  );
  return formatLocalizedDate(dateOnly, "d MMM yyyy", locale);
}

type MobileTranslator = (
  source: string,
  values?: Record<string, string | number>
) => string;

export function formatRelativeTime(
  value: string,
  locale?: string,
  translate?: MobileTranslator
): string {
  const date = new Date(value);
  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  if (translate && diffSeconds <= 5) {
    const secondsAgo = Math.abs(diffSeconds);
    if (secondsAgo < 60) return translate("Just now");
    const minutesAgo = Math.round(secondsAgo / 60);
    if (minutesAgo < 60) {
      return translate(
        minutesAgo === 1 ? "{count} minute ago" : "{count} minutes ago",
        { count: minutesAgo }
      );
    }
    const hoursAgo = Math.round(minutesAgo / 60);
    if (hoursAgo < 24) {
      return translate(hoursAgo === 1 ? "{count} hour ago" : "{count} hours ago", {
        count: hoursAgo,
      });
    }
    const daysAgo = Math.round(hoursAgo / 24);
    if (daysAgo < 7) {
      return translate(daysAgo === 1 ? "{count} day ago" : "{count} days ago", {
        count: daysAgo,
      });
    }
    return formatDate(value, locale);
  }
  const formatter = new Intl.RelativeTimeFormat(resolveIntlLocale(locale), {
    numeric: "auto",
  });
  if (Math.abs(diffSeconds) < 60) return formatter.format(diffSeconds, "second");
  const diffMinutes = Math.round(diffSeconds / 60);
  if (Math.abs(diffMinutes) < 60) return formatter.format(diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return formatter.format(diffHours, "hour");
  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 7) return formatter.format(diffDays, "day");
  return formatDate(value, locale);
}

// ---------------------------------------------------------------------------
// ADMIN API CONTRACTS & HELPERS
// ---------------------------------------------------------------------------

export interface AdminStats {
  totalUsers: number;
  totalHosts: number;
  totalListings: number;
  pendingListings: number;
  approvedListings: number;
  totalBookings: number;
  pendingBookings: number;
  confirmedBookings: number;
  pendingSuggestions: number;
}

export interface AdminListingSummary {
  id: string;
  slug: string;
  title: string;
  status: string;
  needsReview: boolean;
  city: string;
  hostName: string;
  hostEmail: string;
  bookingCount: number;
  nightlyRate: number | null;
  currency: string;
  updatedAt: string;
}

export interface AdminListingDetail {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: string;
  needsReview: boolean;
  moderationNote: string | null;
  propertyType: string;
  city: string;
  country: string;
  address: string;
  maxGuests: number;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  nightlyRate: number | null;
  currency: string;
  host: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
  images: { id: string; url: string; caption: string | null }[];
  amenities: string[];
  updatedAt: string;
  createdAt: string;
}

export interface AdminUserItem {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  isHost: boolean;
  isActive: boolean;
  image: string | null;
  listingsCount: number;
  bookingsCount: number;
  createdAt: string;
}

export async function fetchAdminStats(): Promise<{ stats: AdminStats }> {
  return apiFetch<{ stats: AdminStats }>("/api/mobile/v1/admin/stats");
}

export async function fetchAdminListings(): Promise<{ listings: AdminListingSummary[] }> {
  return apiFetch<{ listings: AdminListingSummary[] }>("/api/mobile/v1/admin/listings");
}

export async function fetchAdminListingDetail(
  id: string
): Promise<{ listing: AdminListingDetail }> {
  return apiFetch<{ listing: AdminListingDetail }>(`/api/mobile/v1/admin/listings/${id}`);
}

export async function reviewAdminListing(
  id: string,
  action: "approve" | "suspend",
  reason?: string
): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/mobile/v1/admin/listings/${id}`, {
    method: "POST",
    body: JSON.stringify({ action, reason }),
  });
}

export async function fetchAdminUsers(): Promise<{ users: AdminUserItem[] }> {
  return apiFetch<{ users: AdminUserItem[] }>("/api/mobile/v1/admin/users");
}

export async function toggleUserStatus(
  userId: string,
  isActive: boolean
): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>("/api/mobile/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ userId, isActive }),
  });
}
