"use client";

import type { ListingAddressInput } from "@/lib/host/v2/listing-location";

/**
 * The editor's side of the location lookups.
 *
 * These are the same three endpoints the classic wizard uses — `/api/location/*`,
 * which already enforce host auth, a per-user rate limit and the Google Places session
 * batching. Nothing new is called here; this module exists so the workspace component
 * holds UI state rather than fetch plumbing, and so the request shapes can be read in
 * one place.
 */

export interface PlacePrediction {
  placeId: string;
  label: string;
}

/** A resolved location: address parts plus the coordinates they belong to. */
export interface ResolvedPlace extends ListingAddressInput {
  latitude: number;
  longitude: number;
  placeId: string;
}

export class LocationLookupError extends Error {}

/** Google bills every keystroke of one search plus the details call that follows a
 *  selection as a single cheap "session" when they share a token. A fresh token starts
 *  the next search. */
export function newSessionToken(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** The two-letter language the host is reading in, which is what the provider should
 *  return place names in. */
export function preferredLanguage(): string {
  if (typeof document === "undefined") return "en";
  const language = document.documentElement.lang || navigator.language || "en";
  return language.slice(0, 2).toLowerCase();
}

async function post<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok) {
    throw new LocationLookupError(payload.error || "Address lookup failed");
  }
  return payload;
}

export async function searchPlaces(input: {
  query: string;
  sessionToken: string;
  bias?: { latitude: number; longitude: number };
  signal?: AbortSignal;
}): Promise<PlacePrediction[]> {
  const payload = await post<{ results?: PlacePrediction[] }>(
    "/api/location/autocomplete",
    {
      query: input.query,
      sessionToken: input.sessionToken,
      language: preferredLanguage(),
      bias: input.bias,
    },
    input.signal,
  );
  return payload.results ?? [];
}

/** Turns an autocomplete row into coordinates and address parts. Autocomplete
 *  deliberately carries neither. */
export async function resolvePlace(input: {
  placeId: string;
  sessionToken: string;
}): Promise<ResolvedPlace | null> {
  const payload = await post<{ result?: ResolvedPlace | null }>(
    "/api/location/place-details",
    {
      placeId: input.placeId,
      sessionToken: input.sessionToken,
      language: preferredLanguage(),
    },
  );
  return payload.result ?? null;
}

/** The address nearest a point the host aimed at. Its own coordinates are ignored by
 *  the caller: the pin stays exactly where it was put, only the text is taken. */
export async function reverseGeocodePoint(input: {
  latitude: number;
  longitude: number;
  signal?: AbortSignal;
}): Promise<ResolvedPlace | null> {
  const payload = await post<{ result?: ResolvedPlace | null }>(
    "/api/location/reverse",
    {
      latitude: input.latitude,
      longitude: input.longitude,
      language: preferredLanguage(),
    },
    input.signal,
  );
  return payload.result ?? null;
}
