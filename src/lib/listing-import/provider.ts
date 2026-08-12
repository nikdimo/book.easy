import type { ListingImportProvider } from "@/lib/listing-import/types";

const PROVIDER_HOSTS: Record<Exclude<ListingImportProvider, "GENERIC">, string[]> = {
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

/** Recognized hosts get their specialized parser; every other syntactically public
 * HTTPS host uses conservative generic metadata extraction. DNS/private-network
 * validation still happens server-side immediately before fetching. */
export function providerForUrl(value: string): ListingImportProvider | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  for (const [provider, hosts] of Object.entries(PROVIDER_HOSTS) as [
    Exclude<ListingImportProvider, "GENERIC">,
    string[],
  ][]) {
    if (hosts.some((host) => hostMatches(hostname, host))) return provider;
  }
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) return null;
  return "GENERIC";
}

export const PROVIDER_LABELS: Record<ListingImportProvider, string> = {
  AIRBNB: "Airbnb",
  BOOKING: "Booking.com",
  VRBO: "Vrbo",
  GENERIC: "Public website",
};
