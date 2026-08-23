/**
 * The rules behind the Location section.
 *
 * Location is the one part of a listing where the stored data is split down the middle
 * by who may see it: `area`/`city`/`country` are printed on the public listing page,
 * while the street line, the postcode, the exact coordinates and the Street View angle
 * are held back until a booking is confirmed. Every rule here exists to keep an edit to
 * the public half from silently rewriting the private half — and the other way round.
 *
 * The thresholds match what the classic listing form has always enforced
 * (`listingFormSchema`), restated rather than imported because this module runs in three
 * places: the client, to show an inline error before anything is sent; the action, to
 * reject what the client let through; and the page, to decide whether the section is
 * done. Free of i18n and JSX so the rules can be tested directly.
 */

export const ADDRESS_MIN = 3;
export const ADDRESS_MAX = 200;
export const CITY_MIN = 2;
export const CITY_MAX = 120;
export const COUNTRY_MIN = 2;
export const COUNTRY_MAX = 120;
export const AREA_MAX = 120;
export const POSTAL_CODE_MAX = 20;

/**
 * How far the pin may drift before a Street View angle the host confirmed stops
 * describing the property. Ten metres is well inside one building, and comfortably
 * above the jitter a centre-pin map produces when the host merely zooms.
 */
export const STREET_VIEW_TOLERANCE_M = 10;

/** How the coordinates on a property were arrived at. Values from older rows (the
 *  classic wizard also wrote "MANUAL" and the importer writes "import") are preserved
 *  on read and only replaced when the host actually re-pins. */
export const LOCATION_SOURCES = [
  "AUTOCOMPLETE",
  "MANUAL_PIN",
  "BROWSER_LOCATION",
  "MAPS_LINK",
] as const;

export type LocationSource = (typeof LOCATION_SOURCES)[number];

export type LocationIssue = "EMPTY" | "TOO_SHORT" | "TOO_LONG" | "NO_PIN";

export interface ListingLocationIssues {
  address?: LocationIssue;
  city?: LocationIssue;
  country?: LocationIssue;
  area?: LocationIssue;
  postalCode?: LocationIssue;
  /** The property has no usable coordinates and this save does not supply any. */
  pin?: LocationIssue;
}

/** The address text a host can type. Nothing here moves the pin. */
export interface ListingAddressInput {
  address: string;
  city: string;
  area: string;
  postalCode: string;
  country: string;
}

/**
 * A pin the host actually placed in this editing session — by picking a search result,
 * moving the map, or using their device location.
 *
 * Absent (`null`) is the normal case and means "leave the stored coordinates exactly
 * where they are". Correcting a house number or a postcode must never re-geocode, and
 * an editor that posted its current coordinates on every save would eventually write
 * back a rounded copy of them.
 */
export interface ListingLocationPin {
  latitude: number;
  longitude: number;
  source: LocationSource;
  /** "GOOGLE_PLACES" for an autocomplete pick, "GEOAPIFY" for a reverse geocode, "" if
   *  the host dropped the pin and nothing resolved. */
  provider: string;
  placeId: string;
}

export interface ListingStreetView {
  heading: number;
  pitch: number;
  panoId: string;
}

export interface ListingLocationInput extends ListingAddressInput {
  pin: ListingLocationPin | null;
  /** The angle the host confirmed. `null` clears a saved one; the stored angle is also
   *  dropped automatically when the pin moves out from under it. */
  streetView: ListingStreetView | null;
}

/** What the property currently holds — the baseline every decision is made against. */
export interface StoredListingLocation extends ListingAddressInput {
  latitude: number | null;
  longitude: number | null;
  locationSource: string;
  geocodingProvider: string;
  geocodingPlaceId: string;
  streetViewHeading: number | null;
  streetViewPitch: number | null;
  streetViewPanoId: string | null;
}

/**
 * What actually gets stored.
 *
 * Surrounding whitespace is never part of an address, and counting it would let three
 * spaces pass a three-character minimum. Interior spacing is left alone — "Ul.
 * Partizanski odredi 15/3" is one string the host wrote.
 */
export function normalizeListingAddress(
  input: ListingAddressInput,
): ListingAddressInput {
  return {
    address: input.address.trim(),
    city: input.city.trim(),
    area: input.area.trim(),
    postalCode: input.postalCode.trim(),
    country: input.country.trim(),
  };
}

function requiredIssue(
  value: string,
  min: number,
  max: number,
): LocationIssue | undefined {
  if (value.length === 0) return "EMPTY";
  if (value.length < min) return "TOO_SHORT";
  if (value.length > max) return "TOO_LONG";
  return undefined;
}

function optionalIssue(value: string, max: number): LocationIssue | undefined {
  return value.length > max ? "TOO_LONG" : undefined;
}

/**
 * Folds a geocoder's answer into the address the host is looking at.
 *
 * Only fields the geocoder actually filled in are taken. Reverse geocoding routinely
 * comes back with no house number and, outside cities, no postcode or district at
 * all — and blanking a line the host typed because the provider had nothing to say
 * about it is how a correct address turns into a worse one. What the provider does
 * return wins, because it is the answer for the pin that was just placed.
 */
export function mergeGeocodedAddress(
  current: ListingAddressInput,
  resolved: Partial<ListingAddressInput>,
): ListingAddressInput {
  const take = (next: string | undefined, fallback: string) => {
    const value = next?.trim() ?? "";
    return value === "" ? fallback : value;
  };
  return {
    address: take(resolved.address, current.address),
    city: take(resolved.city, current.city),
    area: take(resolved.area, current.area),
    postalCode: take(resolved.postalCode, current.postalCode),
    country: take(resolved.country, current.country),
  };
}

/** Whether a coordinate pair is a place on Earth a host could have meant. */
export function validCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): boolean {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    // (0, 0) is open ocean, and it is what an unset coordinate coerced through
    // `Number("")` looks like. No listing on this platform is in the Gulf of Guinea.
    !(latitude === 0 && longitude === 0)
  );
}

/**
 * Everything wrong with a save, in one pass.
 *
 * `area` and `postalCode` are optional because plenty of real addresses have neither —
 * a village with no postcode still has to be publishable. `pin` is reported only when
 * the property has no coordinates at all and none are being supplied: a listing without
 * a pin has no map and no Street View, which is a missing section rather than a typo.
 */
export function listingLocationIssues(
  input: ListingLocationInput,
  stored?: Pick<StoredListingLocation, "latitude" | "longitude">,
): ListingLocationIssues {
  const value = normalizeListingAddress(input);
  const issues: ListingLocationIssues = {};

  const address = requiredIssue(value.address, ADDRESS_MIN, ADDRESS_MAX);
  if (address) issues.address = address;
  const city = requiredIssue(value.city, CITY_MIN, CITY_MAX);
  if (city) issues.city = city;
  const country = requiredIssue(value.country, COUNTRY_MIN, COUNTRY_MAX);
  if (country) issues.country = country;
  const area = optionalIssue(value.area, AREA_MAX);
  if (area) issues.area = area;
  const postalCode = optionalIssue(value.postalCode, POSTAL_CODE_MAX);
  if (postalCode) issues.postalCode = postalCode;

  const pinned = input.pin
    ? validCoordinates(input.pin.latitude, input.pin.longitude)
    : validCoordinates(stored?.latitude, stored?.longitude);
  if (!pinned) issues.pin = "NO_PIN";

  return issues;
}

/**
 * Whether the section is done: a complete address *and* a pin.
 *
 * Both halves, or neither. An address with no coordinates leaves the public listing
 * page with no map, and a pin with no city leaves it with no location line — a tick
 * against either would be a lie.
 */
export function listingLocationComplete(
  stored: Pick<
    StoredListingLocation,
    "address" | "city" | "country" | "latitude" | "longitude"
  >,
): boolean {
  return (
    stored.address.trim().length >= ADDRESS_MIN &&
    stored.city.trim().length >= CITY_MIN &&
    stored.country.trim().length >= COUNTRY_MIN &&
    validCoordinates(stored.latitude, stored.longitude)
  );
}

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance in metres. Used only to decide whether a pin moved far enough
 *  to invalidate a saved Street View angle, so the sphere approximation is ample. */
export function metresBetween(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface ResolvedCoordinates {
  latitude: number | null;
  longitude: number | null;
  locationSource: string;
  geocodingProvider: string;
  geocodingPlaceId: string;
  /** The pin ended up somewhere other than where it was. False for a save that only
   *  touched the address text, and for a re-pin that landed on the same spot. */
  moved: boolean;
}

/**
 * Where the pin ends up after this save.
 *
 * The default is emphatically "exactly where it was". Coordinates are the one part of a
 * listing a host cannot eyeball for correctness afterwards — a pin quietly nudged by a
 * rounding trip through the editor shows up months later as a guest standing in the
 * wrong street. Only a pin the host actually placed replaces them, and only if it is a
 * real coordinate.
 */
export function resolveLocationCoordinates(
  pin: ListingLocationPin | null,
  stored: Pick<
    StoredListingLocation,
    | "latitude"
    | "longitude"
    | "locationSource"
    | "geocodingProvider"
    | "geocodingPlaceId"
  >,
): ResolvedCoordinates {
  const keep: ResolvedCoordinates = {
    latitude: stored.latitude,
    longitude: stored.longitude,
    locationSource: stored.locationSource,
    geocodingProvider: stored.geocodingProvider,
    geocodingPlaceId: stored.geocodingPlaceId,
    moved: false,
  };

  if (!pin || !validCoordinates(pin.latitude, pin.longitude)) return keep;

  const previouslyPinned = validCoordinates(stored.latitude, stored.longitude);
  const moved =
    !previouslyPinned ||
    pin.latitude !== stored.latitude ||
    pin.longitude !== stored.longitude;

  return {
    latitude: pin.latitude,
    longitude: pin.longitude,
    locationSource: (LOCATION_SOURCES as readonly string[]).includes(pin.source)
      ? pin.source
      : "MANUAL_PIN",
    geocodingProvider: pin.provider.trim().slice(0, 30),
    geocodingPlaceId: pin.placeId.trim().slice(0, 500),
    moved,
  };
}

export interface ResolvedStreetView {
  streetViewHeading: number | null;
  streetViewPitch: number | null;
  streetViewPanoId: string | null;
}

function sameStreetView(
  incoming: ListingStreetView,
  stored: Pick<
    StoredListingLocation,
    "streetViewHeading" | "streetViewPitch" | "streetViewPanoId"
  >,
): boolean {
  return (
    incoming.panoId === stored.streetViewPanoId &&
    incoming.heading === stored.streetViewHeading &&
    incoming.pitch === stored.streetViewPitch
  );
}

/**
 * Which Street View angle survives this save.
 *
 * A panorama is a photograph of one specific building from one specific spot. Move the
 * pin two streets over and the saved angle still points at the old front door — and the
 * guest it is eventually shown to, three days before check-in, would be looking at a
 * stranger's house. So a pin that genuinely moved drops any angle the host did not
 * re-confirm in the same save. Re-confirming one is always honoured; `null` clears it.
 */
export function resolveStreetView(
  incoming: ListingStreetView | null,
  stored: Pick<
    StoredListingLocation,
    "streetViewHeading" | "streetViewPitch" | "streetViewPanoId"
  >,
  coordinates: Pick<ResolvedCoordinates, "moved" | "latitude" | "longitude">,
  previous: Pick<StoredListingLocation, "latitude" | "longitude">,
): ResolvedStreetView {
  const cleared: ResolvedStreetView = {
    streetViewHeading: null,
    streetViewPitch: null,
    streetViewPanoId: null,
  };

  if (!incoming || !incoming.panoId.trim()) return cleared;
  if (
    !Number.isFinite(incoming.heading) ||
    !Number.isFinite(incoming.pitch)
  ) {
    return cleared;
  }

  if (coordinates.moved && sameStreetView(incoming, stored)) {
    // The host re-pinned without re-aiming, and this is the old angle coming back
    // unchanged. Small corrections are forgiven; a real move is not.
    const drifted =
      !validCoordinates(previous.latitude, previous.longitude) ||
      !validCoordinates(coordinates.latitude, coordinates.longitude) ||
      metresBetween(
        {
          latitude: previous.latitude as number,
          longitude: previous.longitude as number,
        },
        {
          latitude: coordinates.latitude as number,
          longitude: coordinates.longitude as number,
        },
      ) > STREET_VIEW_TOLERANCE_M;
    if (drifted) return cleared;
  }

  return {
    streetViewHeading: incoming.heading,
    streetViewPitch: incoming.pitch,
    streetViewPanoId: incoming.panoId.trim().slice(0, 500),
  };
}

/** Everything one save writes to the property row. */
export interface ListingLocationWrite
  extends ListingAddressInput,
    ResolvedStreetView {
  latitude: number | null;
  longitude: number | null;
  locationSource: string;
  geocodingProvider: string;
  geocodingPlaceId: string;
}

export type ListingLocationPlan =
  | { action: "invalid"; issues: ListingLocationIssues }
  | { action: "unchanged"; write: ListingLocationWrite }
  | { action: "save"; write: ListingLocationWrite };

/**
 * The whole decision, in one pure step: what this save would store, and whether it
 * differs from what is there. The action does the ownership check and the write; every
 * judgement about *what* to write is made here, where it can be tested.
 */
export function planListingLocationSave(
  input: ListingLocationInput,
  stored: StoredListingLocation,
): ListingLocationPlan {
  const issues = listingLocationIssues(input, stored);
  if (Object.keys(issues).length > 0) return { action: "invalid", issues };

  const address = normalizeListingAddress(input);
  const coordinates = resolveLocationCoordinates(input.pin, stored);
  const streetView = resolveStreetView(
    input.streetView,
    stored,
    coordinates,
    stored,
  );

  const write: ListingLocationWrite = {
    ...address,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    locationSource: coordinates.locationSource,
    geocodingProvider: coordinates.geocodingProvider,
    geocodingPlaceId: coordinates.geocodingPlaceId,
    ...streetView,
  };

  const unchanged = (Object.keys(write) as (keyof ListingLocationWrite)[]).every(
    (key) => write[key] === stored[key],
  );

  return { action: unchanged ? "unchanged" : "save", write };
}

/**
 * Whether this save changes anything a guest can see.
 *
 * Only `area`, `city` and `country` are printed publicly; the street line, postcode,
 * exact pin and Street View angle are not. A host fixing a house number should not put
 * their live listing back into the moderation queue or rebuild its public page — but a
 * host moving it to a different city absolutely should, and so should a moved pin,
 * since the public map draws its offset marker from those coordinates.
 */
export function publicLocationChanged(
  write: Pick<
    ListingLocationWrite,
    "area" | "city" | "country" | "latitude" | "longitude"
  >,
  stored: Pick<
    StoredListingLocation,
    "area" | "city" | "country" | "latitude" | "longitude"
  >,
): boolean {
  return (
    write.area !== stored.area ||
    write.city !== stored.city ||
    write.country !== stored.country ||
    write.latitude !== stored.latitude ||
    write.longitude !== stored.longitude
  );
}

/**
 * What a save reports back.
 *
 * Declared here rather than beside the action because a `"use server"` module may only
 * export async functions, and the client needs this shape to settle its own state.
 */
export interface ListingLocationSaveResult {
  /** A failure the host cannot fix in a field — not signed in, not their listing. */
  error?: string;
  /** Per-field rule violations. Present only when nothing was written. */
  issues?: ListingLocationIssues;
  /** What the property holds after the write, so the client settles on the server's
   *  answer rather than assuming its optimistic state was accepted. */
  stored?: StoredListingLocation;
  complete?: boolean;
}
