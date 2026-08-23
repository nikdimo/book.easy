"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/client";
import {
  LocationLookupError,
  newSessionToken,
  searchPlaces,
  type PlacePrediction,
} from "@/components/host/v2/editor/location/location-lookup";

/** Long enough that typing an address is a handful of requests rather than one per
 *  letter, short enough that the list feels like it is keeping up. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Address and place search.
 *
 * A real combobox rather than an input with a div under it: the results are reachable
 * with the arrow keys, the input announces which one is active, and Escape closes the
 * list without losing what was typed. A host who cannot use a mouse still has to be
 * able to place their own property.
 *
 * Picking a result does not save anything. It hands the resolved place up to the
 * workspace, which moves the pin and fills the address in for the host to check.
 */
export function LocationSearch({
  bias,
  onSelect,
  busy,
}: {
  /** Where the map is looking, so nearby results come first. */
  bias?: { latitude: number; longitude: number };
  onSelect: (prediction: PlacePrediction, sessionToken: string) => void;
  /** The workspace is resolving a pick — the list stays closed until it settles. */
  busy: boolean;
}) {
  const { resolve } = useI18n();
  const listId = useId();
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState(-1);
  const abortRef = useRef<AbortController | null>(null);
  const requestRef = useRef(0);
  const sessionToken = useRef(newSessionToken());
  /** The text of the row the host just picked. Without this the selection immediately
   *  re-searches itself and reopens the list under their cursor. */
  const selected = useRef("");

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2 || normalized === selected.current) {
      abortRef.current?.abort();
      setPredictions([]);
      setSearching(false);
      setError("");
      return;
    }

    const timeout = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const request = ++requestRef.current;
      setSearching(true);
      setError("");

      searchPlaces({
        query: normalized,
        sessionToken: sessionToken.current,
        bias,
        signal: controller.signal,
      })
        .then((results) => {
          if (request !== requestRef.current) return;
          setPredictions(results);
          setActive(-1);
        })
        .catch((cause) => {
          if (cause instanceof Error && cause.name === "AbortError") return;
          if (request !== requestRef.current) return;
          setPredictions([]);
          setError(
            cause instanceof LocationLookupError && cause.message
              ? cause.message
              : resolve(
                  "host.editor.location.search_failed",
                  "Search is unavailable. You can still move the pin on the map.",
                ).text,
          );
        })
        .finally(() => {
          if (request === requestRef.current) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
    // `bias` is read at request time only; re-running on every map nudge would fire a
    // fresh billed search for text the host has not touched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, resolve]);

  function choose(prediction: PlacePrediction) {
    abortRef.current?.abort();
    requestRef.current += 1;
    selected.current = prediction.label;
    setQuery(prediction.label);
    setPredictions([]);
    setActive(-1);
    setError("");
    setSearching(false);
    onSelect(prediction, sessionToken.current);
    // A Places session ends the moment details are fetched. The next search starts a
    // new one rather than billing further keystrokes against this one.
    sessionToken.current = newSessionToken();
  }

  const open = predictions.length > 0 && !busy;

  return (
    <div>
      {/* The placeholder carries the instruction, so a visible label would repeat it.
          The real label stays for anyone not looking at the box. */}
      <label htmlFor={inputId} className="sr-only">
        {
          resolve("host.editor.location.search_label", "Search for your address")
            .text
        }
      </label>

      <div className="relative">
        <Input
          id={inputId}
          type="text"
          role="combobox"
          autoComplete="off"
          // The `md:` paddings are not redundant: the base Input sets `md:px-2.5`,
          // which would otherwise win over a plain `pl-4`/`pr-11` from that breakpoint
          // up and slide the text back under the icon on every desktop.
          className="h-11 rounded-full border-0 bg-slate-100 pl-4 pr-11 shadow-none transition-colors placeholder:text-slate-400 hover:bg-slate-200/70 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-slate-300 md:h-10 md:pl-4 md:pr-11"
          value={query}
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          aria-describedby={error ? `${inputId}-error` : undefined}
          aria-activedescendant={
            open && active >= 0 ? `${listId}-${active}` : undefined
          }
          placeholder={
            resolve(
              "host.editor.location.search_placeholder",
              "Search an address or place",
            ).text
          }
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (!open) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((index) => (index + 1) % predictions.length);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) =>
                index <= 0 ? predictions.length - 1 : index - 1,
              );
            } else if (event.key === "Enter" && active >= 0) {
              event.preventDefault();
              choose(predictions[active]);
            } else if (event.key === "Escape") {
              setPredictions([]);
              setActive(-1);
            }
          }}
        />
        {/* One affordance on the right, swapping between the two states. The icon used
            to sit on the left, where it clipped the placeholder, and the spinner sat
            here — so a search in flight showed both at once. */}
        <span
          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400"
          aria-hidden
        >
          {searching || busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Search className="size-4" />
          )}
        </span>

        {open && (
          <ul
            id={listId}
            role="listbox"
            aria-label={
              resolve("host.editor.location.search_results", "Address results").text
            }
            className="absolute z-20 mt-1.5 max-h-72 w-full overflow-y-auto rounded-2xl bg-white py-1.5 shadow-[0_14px_38px_rgba(15,23,42,0.16)]"
          >
            {predictions.map((prediction, index) => (
              <li
                key={prediction.placeId}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
              >
                <button
                  type="button"
                  // `onMouseDown` rather than `onClick`: the input's blur would
                  // otherwise close the list before the click ever lands.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(prediction);
                  }}
                  onMouseEnter={() => setActive(index)}
                  className={`flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm ${
                    index === active
                      ? "bg-slate-100 text-slate-900"
                      : "text-slate-700"
                  }`}
                >
                  {/* A place name, not app copy — never machine-translated. */}
                  <span className="notranslate" translate="no">
                    {prediction.label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Always mounted, so a screen reader has a live region to announce into rather
          than one that appears at the moment it has something to say. */}
      <p
        id={`${inputId}-error`}
        role="status"
        className="mt-1.5 text-sm text-amber-700 empty:hidden"
      >
        {error}
      </p>
    </div>
  );
}
