import "server-only";
import { cache } from "react";
import { headers } from "next/headers";

/**
 * The visitor's country as Cloudflare resolved it, or null when there is no usable
 * signal. Same header the proxy resolves language and currency from, read here so
 * the regional-settings modal can show a "Suggested" section that agrees with the
 * defaults the visitor was actually given.
 *
 * Detection is a *suggestion* everywhere it is used. It is never treated as proof
 * of nationality or residence, and it never overrides a stored choice.
 */
export const getDetectedCountry = cache(async (): Promise<string | null> => {
  try {
    const value = (await headers()).get("cf-ipcountry")?.trim().toUpperCase();
    // Cloudflare sends XX when it cannot place the address and T1 for Tor exits.
    if (!value || value === "XX" || value === "T1" || !/^[A-Z]{2}$/.test(value)) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
});
