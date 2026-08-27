"use client";

import { ArrowLeft, Loader2, Navigation, Search, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Tx, useI18n } from "@/lib/i18n/client";
import {
  LocationLookupError,
  newSessionToken,
  resolvePlace,
  reverseGeocodePoint,
  searchPlaces,
  type PlacePrediction,
} from "@/components/host/v2/editor/location/location-lookup";
import {
  listingLocationIssues,
  type ListingAddressInput,
  type ListingLocationPin,
} from "@/lib/host/v2/listing-location";

const SEARCH_DEBOUNCE_MS = 300;

export function AddressModal({
  open,
  onClose,
  initialAddress = "",
  onContinue,
  returnFocusTo,
}: {
  open: boolean;
  onClose: () => void;
  initialAddress?: string;
  onContinue: (value: ListingAddressInput & { pin: ListingLocationPin }) => void | Promise<void>;
  returnFocusTo?: React.RefObject<HTMLElement | null>;
}) {
  const i18n = useI18n();
  const [stage, setStage] = useState<"search" | "confirm">("search");
  const [query, setQuery] = useState(initialAddress);
  const [street, setStreet] = useState(initialAddress);
  const [unit, setUnit] = useState("");
  const [postcode, setPostcode] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("MK");
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [searching, setSearching] = useState(false);
  const [activePrediction, setActivePrediction] = useState(-1);
  const [pin, setPin] = useState<ListingLocationPin | null>(null);
  /** The confirm stage's errors, shown once the host has tried to move on. A geocoder
   *  can hand back an address with no street line or no city, and those are the two the
   *  publish schema will not take. */
  const [confirmTouched, setConfirmTouched] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestRef = useRef(0);
  const sessionTokenRef = useRef(newSessionToken());
  const selectedQueryRef = useRef("");
  const inputId = useId();
  const resultsId = useId();

  /*
   * What `role="dialog" aria-modal="true"` promises and the markup alone does not
   * deliver: Escape closes, Tab stays inside, the page behind stops scrolling, and
   * focus goes back to whatever opened this once it is dismissed.
   */
  useEffect(() => {
    if (!open) return;
    // Captured at open time: the trigger is rendered for the whole life of the modal,
    // and reading the ref in the cleanup instead would be a stale-node hazard.
    const trigger = returnFocusTo?.current ?? null;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        const target = event.target;
        if (
          target instanceof HTMLInputElement &&
          target.getAttribute("role") === "combobox" &&
          target.getAttribute("aria-expanded") === "true"
        ) {
          return;
        }
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      body.style.overflow = previousOverflow;
      // The caller names the control to come back to. Reading `document.activeElement`
      // here instead would find the panel's own autofocused field, not the trigger.
      trigger?.focus();
    };
  }, [open, onClose, returnFocusTo]);

  useEffect(() => {
    if (!open || stage !== "search") {
      abortRef.current?.abort();
      return;
    }

    const normalized = query.trim();
    if (normalized.length < 2 || normalized === selectedQueryRef.current) {
      abortRef.current?.abort();
      setPredictions([]);
      setSearching(false);
      return;
    }

    const timeout = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const request = ++requestRef.current;
      setSearching(true);
      setLocationError("");

      searchPlaces({
        query: normalized,
        sessionToken: sessionTokenRef.current,
        signal: controller.signal,
      })
        .then((results) => {
          if (request !== requestRef.current) return;
          setPredictions(results);
          setActivePrediction(-1);
        })
        .catch((cause) => {
          if (cause instanceof Error && cause.name === "AbortError") return;
          if (request !== requestRef.current) return;
          setPredictions([]);
          setLocationError(
            cause instanceof LocationLookupError && cause.message
              ? cause.message
              : i18n.resolve(
                  "host.v2.address_modal.lookup_failed",
                  "We couldn't look up that address. Check it and try again.",
                ).text,
          );
        })
        .finally(() => {
          if (request === requestRef.current) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [i18n, open, query, stage]);

  // Only a press that starts and ends on the scrim itself — a drag out of the panel
  // must not be read as "dismiss".
  const onBackdropPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) onClose();
    },
    [onClose],
  );

  if (!open) return null;

  async function confirmQuery() {
    const value = query.trim();
    if (!value) return;
    abortRef.current?.abort();
    requestRef.current += 1;
    setPredictions([]);
    setActivePrediction(-1);
    setSearching(false);
    setLocationError("");
    setLocating(true);
    const sessionToken = sessionTokenRef.current;
    try {
      const predictions = await searchPlaces({ query: value, sessionToken });
      const resolved = predictions[0]
        ? await resolvePlace({ placeId: predictions[0].placeId, sessionToken })
        : null;
      if (!resolved) {
        setLocationError(i18n.resolve("host.v2.address_modal.not_found", "Choose a recognised address so we can place it accurately on the map.").text);
        return;
      }
      setStreet(resolved.address);
      setCity(resolved.city);
      setUnit(resolved.area);
      setPostcode(resolved.postalCode);
      setCountry(resolved.country || "MK");
      setPin({
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        source: "AUTOCOMPLETE",
        provider: "GOOGLE_PLACES",
        placeId: resolved.placeId,
      });
      setStage("confirm");
    } catch {
      setLocationError(i18n.resolve("host.v2.address_modal.lookup_failed", "We couldn't look up that address. Check it and try again.").text);
    } finally {
      setLocating(false);
      sessionTokenRef.current = newSessionToken();
    }
  }

  async function choosePrediction(prediction: PlacePrediction) {
    abortRef.current?.abort();
    requestRef.current += 1;
    selectedQueryRef.current = prediction.label;
    setQuery(prediction.label);
    setPredictions([]);
    setActivePrediction(-1);
    setLocationError("");
    setSearching(false);
    setLocating(true);

    const sessionToken = sessionTokenRef.current;
    try {
      const resolved = await resolvePlace({
        placeId: prediction.placeId,
        sessionToken,
      });
      if (!resolved) {
        setLocationError(
          i18n.resolve(
            "host.v2.address_modal.not_found",
            "Choose a recognised address so we can place it accurately on the map.",
          ).text,
        );
        return;
      }
      setStreet(resolved.address);
      setCity(resolved.city);
      setUnit(resolved.area);
      setPostcode(resolved.postalCode);
      setCountry(resolved.country || "MK");
      setPin({
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        source: "AUTOCOMPLETE",
        provider: "GOOGLE_PLACES",
        placeId: resolved.placeId,
      });
      setStage("confirm");
    } catch (cause) {
      setLocationError(
        cause instanceof LocationLookupError && cause.message
          ? cause.message
          : i18n.resolve(
              "host.v2.address_modal.lookup_failed",
              "We couldn't look up that address. Check it and try again.",
            ).text,
      );
    } finally {
      setLocating(false);
      // Fetching details ends a billed Places session. Any further typing belongs to
      // a fresh session, including a retry after a details request failed.
      sessionTokenRef.current = newSessionToken();
    }
  }

  function useCurrentLocation() {
    abortRef.current?.abort();
    requestRef.current += 1;
    setPredictions([]);
    setActivePrediction(-1);
    setSearching(false);
    setLocationError("");
    if (!window.isSecureContext || !navigator.geolocation) {
      setLocationError(i18n.resolve("host.v2.address_modal.location_unavailable", "Current location is unavailable. You can continue without it.").text);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const latitude = position.coords.latitude;
          const longitude = position.coords.longitude;
          const resolved = await reverseGeocodePoint({ latitude, longitude });
          if (resolved) {
            setStreet(resolved.address);
            setCity(resolved.city);
            setUnit(resolved.area);
            setPostcode(resolved.postalCode);
            setCountry(resolved.country || "MK");
          }
          setPin({
            latitude,
            longitude,
            source: "BROWSER_LOCATION",
            provider: resolved ? "GOOGLE_PLACES" : "",
            placeId: resolved?.placeId ?? "",
          });
          setStage("confirm");
        } catch {
          setLocationError(i18n.resolve("host.v2.address_modal.location_failed", "We found your position but couldn't read its address. Search for the address instead.").text);
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        setLocationError(i18n.resolve("host.v2.address_modal.location_denied", "We couldn’t access your location. You can enter it manually or continue for now.").text);
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  /** The same rule module the Address step and the listing editor use, so an address
   *  this modal accepts is one publishing accepts. The pin is supplied, so its own
   *  "NO_PIN" issue only fires when the lookup genuinely produced no coordinates. */
  const confirmIssues = listingLocationIssues({
    address: street,
    city,
    area: unit,
    postalCode: postcode,
    country,
    pin,
    streetView: null,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 pt-4 sm:grid sm:place-items-center sm:p-4" onPointerDown={onBackdropPointerDown}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="address-modal-title" className="relative flex h-[calc(100dvh-1rem)] w-full max-w-[45rem] flex-col overflow-y-auto rounded-t-[2rem] bg-white p-6 shadow-2xl sm:h-auto sm:min-h-[34rem] sm:max-h-[calc(100dvh-2rem)] sm:rounded-[2rem] sm:p-8">
        <button type="button" onClick={onClose} aria-label={i18n.resolve("host.v2.address_modal.close", "Close").text} className="absolute right-6 top-6 grid size-11 place-items-center rounded-full transition-colors hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 md:size-9"><X className="size-5" aria-hidden /></button>
        {stage === "confirm" ? <button type="button" onClick={() => setStage("search")} aria-label={i18n.resolve("host.v2.address_modal.back", "Back to search").text} className="absolute left-6 top-6 grid size-11 place-items-center rounded-full transition-colors hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 md:size-9"><ArrowLeft className="size-5" aria-hidden /></button> : null}

        <h2 id="address-modal-title" className="text-center font-heading text-2xl font-semibold tracking-[-0.02em]">
          {stage === "search" ? <Tx k="host.v2.address_modal.enter_heading" source="Enter your address" /> : <Tx k="host.v2.address_modal.confirm_heading" source="Confirm your address" />}
        </h2>

        {stage === "search" ? (
          <div className="mt-7">
            <form onSubmit={(event) => { event.preventDefault(); void confirmQuery(); }}>
              <label htmlFor={inputId} className="sr-only"><Tx k="host.v2.address_modal.address_label" source="Address" /></label>
              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2" aria-hidden />
                  <input
                    id={inputId}
                    autoFocus
                    role="combobox"
                    autoComplete="off"
                    value={query}
                    aria-expanded={predictions.length > 0 && !locating}
                    aria-controls={predictions.length > 0 && !locating ? resultsId : undefined}
                    aria-autocomplete="list"
                    aria-describedby={locationError ? `${inputId}-error` : undefined}
                    aria-activedescendant={activePrediction >= 0 ? `${resultsId}-${activePrediction}` : undefined}
                    onChange={(event) => {
                      selectedQueryRef.current = "";
                      setQuery(event.target.value);
                    }}
                    onKeyDown={(event) => {
                      if (predictions.length === 0 || locating) return;
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        setActivePrediction((index) => (index + 1) % predictions.length);
                      } else if (event.key === "ArrowUp") {
                        event.preventDefault();
                        setActivePrediction((index) =>
                          index <= 0 ? predictions.length - 1 : index - 1,
                        );
                      } else if (event.key === "Enter" && activePrediction >= 0) {
                        event.preventDefault();
                        void choosePrediction(predictions[activePrediction]);
                      } else if (event.key === "Escape") {
                        setPredictions([]);
                        setActivePrediction(-1);
                      }
                    }}
                    placeholder={i18n.resolve("host.v2.location.address_placeholder", "Enter your address").text}
                    className="min-h-14 w-full rounded-full border border-slate-300 pl-12 pr-12 text-base outline-none focus-visible:border-slate-950 focus-visible:ring-2 focus-visible:ring-slate-400"
                  />
                  {searching || locating ? <Loader2 className="absolute right-4 top-1/2 size-5 -translate-y-1/2 animate-spin text-slate-400" aria-hidden /> : null}
                </div>
                {predictions.length > 0 && !locating ? (
                  <ul id={resultsId} role="listbox" aria-label={i18n.resolve("host.editor.location.search_results", "Address results").text} className="absolute z-20 mt-2 max-h-64 w-full overflow-y-auto rounded-2xl bg-white py-1.5 shadow-[0_14px_38px_rgba(15,23,42,0.18)]">
                    {predictions.map((prediction, index) => (
                      <li key={prediction.placeId} id={`${resultsId}-${index}`} role="option" aria-selected={index === activePrediction}>
                        <button
                          type="button"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            void choosePrediction(prediction);
                          }}
                          onMouseEnter={() => setActivePrediction(index)}
                          className={`w-full px-4 py-3 text-left text-sm ${index === activePrediction ? "bg-slate-100 text-slate-950" : "text-slate-700"}`}
                        >
                          <span className="notranslate" translate="no">{prediction.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </form>
            <button type="button" onClick={useCurrentLocation} className="mt-7 flex items-center gap-4 text-left text-sm font-medium">
              <span className="grid size-12 place-items-center rounded-xl bg-slate-100">{locating ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Navigation className="size-5" aria-hidden />}</span>
              <Tx k="host.v2.address_modal.current_location" source="Use my current location" />
            </button>
            <p id={`${inputId}-error`} role="status" className="mt-4 text-sm text-slate-500 empty:hidden">{locationError}</p>
            <button type="button" disabled={!query.trim() || locating} onClick={() => void confirmQuery()} className="mt-8 text-sm font-semibold underline underline-offset-4 text-slate-600 hover:text-slate-950 disabled:text-slate-300">
              <Tx k="host.v2.address_modal.continue_for_now" source="Find this address" />
            </button>
          </div>
        ) : (
          <div className="mt-7 flex flex-1 flex-col">
            <div className="overflow-hidden rounded-2xl border border-slate-400">
              <label className="block border-b border-slate-300 px-4 py-2"><span className="block text-xs text-slate-500"><Tx k="host.v2.address.country" source="Country / region" /></span><select value={country} onChange={(event) => setCountry(event.target.value)} className="w-full rounded-md bg-transparent text-base outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"><option value="MK"><Tx k="country.mk" source="North Macedonia" /></option><option value="DK"><Tx k="country.dk" source="Denmark" /></option>{country !== "MK" && country !== "DK" ? <option value={country}>{country}</option> : null}</select></label>
              <ModalInput field="street" label={i18n.resolve("host.v2.address.street", "Street address").text} value={street} onChange={setStreet} invalid={confirmTouched && Boolean(confirmIssues.address)} />
              <ModalInput label={i18n.resolve("host.v2.address.unit", "Apt, suite or unit (optional)").text} value={unit} onChange={setUnit} />
              <ModalInput label={i18n.resolve("host.v2.address.postcode", "Postcode").text} value={postcode} onChange={setPostcode} />
              <ModalInput field="city" label={i18n.resolve("host.v2.address.city", "City / town").text} value={city} onChange={setCity} invalid={confirmTouched && Boolean(confirmIssues.city)} last />
            </div>
            {/* Always in the tree, so the live region exists to announce into rather
                than being created at the moment it has something to say. */}
            <p id="address-modal-error" role="alert" className="mt-3 text-sm text-rose-600 empty:hidden">
              {confirmTouched ? confirmMessage(i18n, confirmIssues) : null}
            </p>
            <button
              type="button"
              aria-describedby="address-modal-error"
              onClick={() => {
                setConfirmTouched(true);
                // Nothing is saved and the modal stays open: a half-filled address is
                // not written over whatever the draft already holds.
                if (!pin || confirmIssues.address || confirmIssues.city || confirmIssues.country) {
                  const target = confirmIssues.city && !confirmIssues.address ? "city" : "street";
                  panelRef.current
                    ?.querySelector<HTMLInputElement>(`input[data-address-field="${target}"]`)
                    ?.focus();
                  return;
                }
                void onContinue({ address: street, city, area: unit, postalCode: postcode, country, pin });
              }}
              className="mt-auto inline-flex min-h-11 w-full items-center justify-center rounded-full bg-slate-950 px-6 font-heading text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
            >
              <Tx k="host.v2.flow.next" source="Next" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ModalInput({ label, value, onChange, field, invalid = false, last = false }: { label: string; value: string; onChange: (value: string) => void; field?: string; invalid?: boolean; last?: boolean }) {
  return <label className={`block px-4 py-2 ${last ? "" : "border-b border-slate-300"}`}><span className="block text-xs text-slate-500">{label}</span><input data-address-field={field} aria-invalid={invalid || undefined} aria-describedby={invalid ? "address-modal-error" : undefined} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-md bg-transparent text-base outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400" /></label>;
}

/** One sentence for the first thing wrong, in the order the fields are drawn. */
function confirmMessage(
  i18n: ReturnType<typeof useI18n>,
  issues: ReturnType<typeof listingLocationIssues>,
): string | null {
  if (issues.address) {
    return i18n.resolve("host.v2.address.error_street", "Add the street address so we can place your listing.").text;
  }
  if (issues.city) {
    return i18n.resolve("host.v2.address.error_city", "Add the city or town.").text;
  }
  if (issues.country) {
    return i18n.resolve("host.v2.address.error_country", "Choose the country or region.").text;
  }
  if (issues.postalCode || issues.area) {
    return i18n.resolve("host.v2.address.error_too_long", "That is longer than we can store.").text;
  }
  if (issues.pin) {
    return i18n.resolve("host.v2.address_modal.not_found", "Choose a recognised address so we can place it accurately on the map.").text;
  }
  return null;
}
