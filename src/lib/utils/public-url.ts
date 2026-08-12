import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * The one gate every server-side fetch of a user-supplied URL goes through.
 *
 * Both the listing importer and the calendar feed sync take a URL a host typed and
 * fetch it from inside the VPS, where "localhost" and the private ranges reach the
 * database, the metadata service and every other unauthenticated internal port. So the
 * check is not just on the literal hostname — a public name can resolve to 127.0.0.1 —
 * but on the addresses it actually resolves to, and it has to be re-run on every
 * redirect hop rather than once at the start.
 */
export function isPrivateIp(address: string): boolean {
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

export async function assertPublicHttpsUrl(
  value: string,
  messages: {
    protocol: string;
    privateHost: string;
    unresolvable: string;
  },
): Promise<URL> {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error(messages.protocol);
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || (isIP(hostname) && isPrivateIp(hostname))) {
    throw new Error(messages.privateHost);
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateIp(address))) {
    throw new Error(messages.unresolvable);
  }
  return url;
}
