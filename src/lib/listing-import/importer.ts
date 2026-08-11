import "server-only";

import { lookup } from "node:dns/promises";
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { getStorageAdapter } from "@/lib/storage";
import type {
  ImportedListingData,
  ListingImportProvider,
} from "@/lib/listing-import/types";

const MAX_HTML_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGES = 15;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;

const PROVIDER_HOSTS: Record<ListingImportProvider, string[]> = {
  AIRBNB: [
    "airbnb.com",
    "airbnb.co.uk",
    "airbnb.ca",
    "airbnb.com.au",
    "airbnb.de",
    "airbnb.dk",
    "airbnb.es",
    "airbnb.fr",
    "airbnb.it",
    "airbnb.nl",
  ],
  BOOKING: ["booking.com"],
  VRBO: ["vrbo.com", "vrbo.co.uk", "vrbo.ca", "vrbo.com.au"],
};

const IMAGE_TYPES: Record<string, { extension: string; magic: (bytes: Buffer) => boolean }> = {
  "image/jpeg": {
    extension: "jpg",
    magic: (bytes) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  },
  "image/png": {
    extension: "png",
    magic: (bytes) =>
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47,
  },
  "image/webp": {
    extension: "webp",
    magic: (bytes) =>
      bytes.length >= 12 &&
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP",
  },
};

function hostMatches(hostname: string, allowed: string): boolean {
  return hostname === allowed || hostname.endsWith(`.${allowed}`);
}

export function providerForUrl(value: string): ListingImportProvider | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  for (const [provider, hosts] of Object.entries(PROVIDER_HOSTS) as [
    ListingImportProvider,
    string[],
  ][]) {
    if (hosts.some((host) => hostMatches(hostname, host))) return provider;
  }
  return null;
}

function isPrivateIp(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0];
  if (normalized === "::1" || normalized === "::" || normalized.startsWith("fe80:")) return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  const ipv4 = mapped ?? (isIP(normalized) === 4 ? normalized : null);
  if (!ipv4) return false;
  const [a, b] = ipv4.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

async function assertPublicHttpsUrl(value: string): Promise<URL> {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Only public HTTPS URLs can be imported.");
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (hostname === "localhost" || isIP(hostname) && isPrivateIp(hostname)) {
    throw new Error("Private network URLs cannot be imported.");
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateIp(address))) {
    throw new Error("That URL does not resolve to a public server.");
  }
  return url;
}

async function safeFetch(
  value: string,
  options: { providerOnly?: ListingImportProvider } = {},
): Promise<Response> {
  let url = await assertPublicHttpsUrl(value);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    if (options.providerOnly && providerForUrl(url.href) !== options.providerOnly) {
      throw new Error("The provider redirected to an unsupported website.");
    }
    const response = await fetch(url, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        Accept: options.providerOnly
          ? "text/html,application/xhtml+xml"
          : "image/avif,image/webp,image/png,image/jpeg",
        "User-Agent": "BookEasy-Listing-Importer/1.0",
      },
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) throw new Error("The provider returned an invalid redirect.");
    url = await assertPublicHttpsUrl(new URL(location, url).href);
  }
  throw new Error("The provider redirected too many times.");
}

async function readLimited(response: Response, maximum: number): Promise<Buffer> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximum) {
    throw new Error("The remote file is too large to import.");
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximum) {
      await reader.cancel();
      throw new Error("The remote file is too large to import.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

function cleanText(value: unknown, maximum = 10_000): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = decodeHtml(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned ? cleaned.slice(0, maximum) : undefined;
}

function metaTags(html: string): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = new Map<string, string>();
    for (const attribute of match[0].matchAll(/([:\w-]+)\s*=\s*(["'])([\s\S]*?)\2/gi)) {
      attributes.set(attribute[1].toLowerCase(), decodeHtml(attribute[3]));
    }
    const key = (attributes.get("property") ?? attributes.get("name"))?.toLowerCase();
    const content = attributes.get("content");
    if (key && content) result.set(key, [...(result.get(key) ?? []), content]);
  }
  return result;
}

function jsonLdObjects(html: string): Record<string, unknown>[] {
  const objects: Record<string, unknown>[] = [];
  for (const match of html.matchAll(
    /<script\b[^>]*type\s*=\s*(["'])application\/ld\+json\1[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const parsed: unknown = JSON.parse(decodeHtml(match[2]).trim());
      const visit = (value: unknown, depth = 0) => {
        if (depth > 8 || !value || typeof value !== "object") return;
        if (Array.isArray(value)) {
          for (const item of value) visit(item, depth + 1);
          return;
        }
        const object = value as Record<string, unknown>;
        objects.push(object);
        if (Array.isArray(object["@graph"])) visit(object["@graph"], depth + 1);
      };
      visit(parsed);
    } catch {
      // A malformed analytics block should not discard valid Open Graph data.
    }
  }
  return objects;
}

function schemaTypes(object: Record<string, unknown>): string[] {
  const raw = object["@type"];
  return (Array.isArray(raw) ? raw : [raw]).filter((value): value is string => typeof value === "string");
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const primitive = value && typeof value === "object"
      ? (value as Record<string, unknown>).value
      : value;
    const parsed = typeof primitive === "number"
      ? primitive
      : typeof primitive === "string"
        ? Number(primitive.replace(/[^\d.,-]/g, "").replace(",", "."))
        : NaN;
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return undefined;
}

function imageValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(imageValues);
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return imageValues(object.url ?? object.contentUrl);
  }
  return [];
}

function uniqueStrings(values: (string | undefined)[], maximum: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const cleaned = cleanText(value, 160);
    const key = cleaned?.toLocaleLowerCase("en");
    if (!cleaned || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
    if (result.length >= maximum) break;
  }
  return result;
}

function uniqueImageUrls(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    try {
      const url = new URL(decodeHtml(value));
      if (url.protocol !== "https:" || url.href.length > 4_000 || seen.has(url.href)) continue;
      seen.add(url.href);
      result.push(url.href);
      if (result.length >= MAX_IMAGES) break;
    } catch {
      // Ignore malformed image candidates while keeping the rest of the listing.
    }
  }
  return result;
}

export function parseListingHtml(
  html: string,
  sourceUrl: string,
  provider: ListingImportProvider,
): ImportedListingData {
  const meta = metaTags(html);
  const schemas = jsonLdObjects(html);
  const lodging = schemas.find((object) =>
    schemaTypes(object).some((type) =>
      /lodging|hotel|apartment|house|accommodation|vacationrental|product/i.test(type),
    ),
  ) ?? schemas[0] ?? {};

  const address = lodging.address && typeof lodging.address === "object"
    ? lodging.address as Record<string, unknown>
    : {};
  const geo = lodging.geo && typeof lodging.geo === "object"
    ? lodging.geo as Record<string, unknown>
    : {};
  const rawOffers = Array.isArray(lodging.offers) ? lodging.offers[0] : lodging.offers;
  const offers = rawOffers && typeof rawOffers === "object"
    ? rawOffers as Record<string, unknown>
    : {};
  const occupancy = lodging.occupancy && typeof lodging.occupancy === "object"
    ? lodging.occupancy as Record<string, unknown>
    : {};
  const features = Array.isArray(lodging.amenityFeature) ? lodging.amenityFeature : [];
  const additional = Array.isArray(lodging.additionalProperty) ? lodging.additionalProperty : [];
  const propertyNumbers = new Map<string, number>();
  for (const entry of additional) {
    if (!entry || typeof entry !== "object") continue;
    const property = entry as Record<string, unknown>;
    const name = cleanText(property.name, 80)?.toLowerCase();
    const number = firstNumber(property.value);
    if (name && number !== undefined) propertyNumbers.set(name, number);
  }
  const propertyNumber = (pattern: RegExp) => {
    for (const [name, value] of propertyNumbers) if (pattern.test(name)) return value;
    return undefined;
  };

  const amenities = uniqueStrings(
    features.flatMap((feature) => {
      if (typeof feature === "string") return [feature];
      if (!feature || typeof feature !== "object") return [];
      const object = feature as Record<string, unknown>;
      return object.value === false ? [] : [cleanText(object.name, 160)];
    }),
    100,
  );
  const imageUrls = uniqueImageUrls(
    [
      ...imageValues(lodging.image),
      ...(meta.get("og:image") ?? []),
      ...(meta.get("twitter:image") ?? []),
    ],
  );
  const pageTitle = cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1], 200);
  const rawType = schemaTypes(lodging).find((type) => !/product|lodgingbusiness/i.test(type));
  const currency = cleanText(
    offers.priceCurrency ?? meta.get("product:price:currency")?.[0],
    3,
  )?.toUpperCase();
  const priceSpecification = offers.priceSpecification && typeof offers.priceSpecification === "object"
    ? offers.priceSpecification as Record<string, unknown>
    : {};
  const unitText = cleanText(offers.unitText ?? priceSpecification.unitText, 40);
  const schemaNightlyRate = unitText && /night|day/i.test(unitText)
    ? firstNumber(offers.price, priceSpecification.price)
    : undefined;
  const metaNightlyRate = meta.has("product:price:currency")
    ? firstNumber(meta.get("product:price:amount")?.[0])
    : undefined;

  return {
    provider,
    sourceUrl,
    title: cleanText(lodging.name ?? lodging.headline ?? meta.get("og:title")?.[0] ?? pageTitle, 200),
    description: cleanText(lodging.description ?? meta.get("og:description")?.[0] ?? meta.get("description")?.[0]),
    propertyType: cleanText(lodging.additionalType ?? rawType, 100),
    address: cleanText(address.streetAddress, 250),
    city: cleanText(address.addressLocality, 120),
    area: cleanText(address.addressRegion, 120),
    postalCode: cleanText(address.postalCode, 30),
    country: cleanText(
      typeof address.addressCountry === "object"
        ? (address.addressCountry as Record<string, unknown>).name
        : address.addressCountry,
      120,
    ),
    latitude: firstNumber(geo.latitude),
    longitude: firstNumber(geo.longitude),
    maxGuests: firstNumber(occupancy.maxValue, lodging.numberOfGuests, propertyNumber(/guest|occupancy/)),
    bedrooms: firstNumber(lodging.numberOfBedrooms, propertyNumber(/bedroom/)),
    beds: firstNumber(lodging.numberOfBeds, propertyNumber(/^beds?|sleeping/)),
    bathrooms: firstNumber(lodging.numberOfBathroomsTotal, propertyNumber(/bathroom/)),
    currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : undefined,
    nightlyRate: schemaNightlyRate ?? metaNightlyRate,
    amenities,
    imageUrls,
  };
}

export async function importListingUrl(value: string): Promise<ImportedListingData> {
  const provider = providerForUrl(value);
  if (!provider) {
    throw new Error("Paste a valid Airbnb, Booking.com, or Vrbo HTTPS listing link.");
  }
  const response = await safeFetch(value, { providerOnly: provider });
  if (!response.ok) {
    throw new Error(
      response.status === 403 || response.status === 429
        ? "The provider blocked this import. Try again later or enter the details manually."
        : `The provider could not be read (HTTP ${response.status}).`,
    );
  }
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
    throw new Error("That link did not return a listing page.");
  }
  const html = (await readLimited(response, MAX_HTML_BYTES)).toString("utf8");
  const imported = parseListingHtml(html, response.url || value, provider);
  if (!imported.title && !imported.description && imported.imageUrls.length === 0) {
    throw new Error("No public listing details were found on that page.");
  }
  return imported;
}

export async function copyImportedImages(
  urls: string[],
): Promise<{ url: string; mediaType: "IMAGE" }[]> {
  const storage = getStorageAdapter();
  const candidates = urls.slice(0, MAX_IMAGES);
  const results: ({ url: string; mediaType: "IMAGE" } | undefined)[] = new Array(candidates.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < candidates.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        const response = await safeFetch(candidates[index]);
        if (!response.ok) continue;
        const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
        const type = IMAGE_TYPES[contentType];
        if (!type) continue;
        const bytes = await readLimited(response, MAX_IMAGE_BYTES);
        if (!type.magic(bytes)) continue;
        const url = await storage.upload(bytes, `${randomUUID()}.${type.extension}`, contentType);
        results[index] = { url, mediaType: "IMAGE" };
      } catch {
        // Individual photos can expire or be protected; keep the useful ones.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, candidates.length) }, worker));
  return results.filter((item): item is { url: string; mediaType: "IMAGE" } => Boolean(item));
}
