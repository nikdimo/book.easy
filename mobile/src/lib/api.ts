import { Linking, Platform } from "react-native";
import { formatLocalizedDate } from "@/lib/date-locale";

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

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
  drafts: { id: string; title: string; currentStep: number; updatedAt: string }[];
}

export interface ListingDraftData {
  currentStep?: number;
  title?: string;
  description?: string;
  propertyType?: string;
  maxGuests?: string;
  bedrooms?: string;
  beds?: string;
  bathrooms?: string;
  baseNightlyRate?: string;
  cleaningFee?: string;
  minNights?: string;
  amenityIds?: string[];
}

export interface ListingEditorResponse {
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

export interface AvailabilityResponse {
  listing: {
    id: string;
    title: string;
    baseNightlyRate: number | null;
    currency: string;
  };
  blocks: {
    id: string;
    startDate: string;
    endDate: string;
    blockType: string;
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

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error ?? `Request failed (${response.status})`);
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

export async function startAuth(
  provider: "google" | "email" | "signout",
  email?: string
): Promise<void> {
  const path =
    provider === "google"
      ? "/mobile-auth/google"
      : provider === "signout"
        ? "/mobile-auth/signout"
        : `/mobile-auth/email?email=${encodeURIComponent(email ?? "")}`;
  const url = `${API_BASE_URL}${path}`;

  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.open(url, "host-mobile-auth", "popup,width=520,height=720");
    return;
  }
  await Linking.openURL(url);
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
