import type { ListingImportProvider } from "@/lib/listing-import/types";

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

function hostMatches(hostname: string, allowed: string): boolean {
  return hostname === allowed || hostname.endsWith(`.${allowed}`);
}

/** Detects the provider solely from an allow-listed HTTPS hostname. This module has
 * no server dependencies so the paste field can show the same decision the API uses. */
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

export const PROVIDER_LABELS: Record<ListingImportProvider, string> = {
  AIRBNB: "Airbnb",
  BOOKING: "Booking.com",
  VRBO: "Vrbo",
};

