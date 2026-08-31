"use client";

import { useRef, useState } from "react";
import {
  ADDRESS_MAX,
  AREA_MAX,
  CITY_MAX,
  POSTAL_CODE_MAX,
  listingLocationIssues,
  type LocationIssue,
} from "@/lib/host/v2/listing-location";
import { Tx, useI18n } from "@/lib/i18n/client";
import type { ListingSpaceTypeValue } from "@/lib/types/listing-space-type";
import type { PropertyTypeOption } from "@/lib/types/property-type";
import { reviewHref, stepNextTarget } from "@/lib/host/v2/listing-flow-return";
import { ListingFlowFooter } from "./listing-flow-footer";
import { useHostStartDraft } from "./host-start-draft-provider";

/** The fields this screen owns, in the order they are drawn — which is also the order
 *  the first invalid one is looked for in, so focus lands where a host reading down the
 *  card would look next. */
const FIELD_ORDER = ["country", "address", "area", "postalCode", "city"] as const;

type AddressField = (typeof FIELD_ORDER)[number];

/** The countries the flow offers, in the order the dropdown lists them. */
const OFFERED_COUNTRIES = ["MK", "DK", "GR", "ES"];

export function AddressStep({
  propertyType,
  spaceType,
  initialAddress = "",
  initialTouched = false,
  returnToReview = false,
}: {
  propertyType: PropertyTypeOption;
  spaceType: ListingSpaceTypeValue;
  initialAddress?: string;
  /** Reached from the Review screen's "Edit". */
  returnToReview?: boolean;
  /** Test seam: renders the error state a host only reaches by trying to move on. */
  initialTouched?: boolean;
}) {
  const i18n = useI18n();
  const { data, save } = useHostStartDraft();
  const [street, setStreet] = useState(initialAddress || data.address || "");
  const [unit, setUnit] = useState(data.area || "");
  const [postcode, setPostcode] = useState(data.postalCode || "");
  const [city, setCity] = useState(data.city || "");
  const [country, setCountry] = useState(data.country || "MK");
  /** The errors appear once the host has tried to move on, not while they are still
   *  typing the second character of a street name. */
  const [touched, setTouched] = useState(initialTouched);
  const fieldRefs = useRef<Partial<Record<AddressField, HTMLElement | null>>>({});
  const query = `propertyType=${encodeURIComponent(propertyType.value)}&spaceType=${encodeURIComponent(spaceType)}`;
  /** Where the CTA goes, and what it says: on to the next question, or back to the
   *  summary the host came from. */
  const { href: nextHref, label: nextLabel, route: nextRoute } = stepNextTarget(
    returnToReview,
    query,
    `/host/start/basics?${query}`,
  );

  /**
   * The same rule module the listing editor and its server action use, so an address
   * this screen accepts is an address publishing accepts.
   *
   * The pin is deliberately not part of this decision. It belongs to the Location step,
   * it is trusted once placed, and a host correcting a house number here is not being
   * asked to re-confirm the map — `pin: null` with the draft's stored coordinates says
   * exactly that. A draft with no coordinates at all is still caught, on Review, by the
   * step that owns them.
   */
  const latitude = Number(data.latitude);
  const longitude = Number(data.longitude);
  const issues = listingLocationIssues(
    { address: street, city, area: unit, postalCode: postcode, country, pin: null, streetView: null },
    {
      latitude: (data.latitude ?? "").trim() === "" ? null : latitude,
      longitude: (data.longitude ?? "").trim() === "" ? null : longitude,
    },
  );
  const fieldIssues: Partial<Record<AddressField, LocationIssue>> = {
    country: issues.country,
    address: issues.address,
    area: issues.area,
    postalCode: issues.postalCode,
    city: issues.city,
  };
  const firstInvalid = FIELD_ORDER.find((field) => fieldIssues[field]);

  return (
    <>
      <main className="flex min-h-0 flex-1 px-5 pb-28 pt-6 md:items-center md:px-8 md:pb-24 md:pt-2">
        <div className="mx-auto w-full max-w-[39rem]">
          <h1 className="text-center font-heading text-[2rem] font-semibold tracking-[-0.025em] text-slate-950 sm:text-[2.35rem]">
            <Tx k="host.v2.address.heading" source="Confirm your address" />
          </h1>
          <p className="mx-auto mt-2 max-w-[39rem] text-center text-sm leading-6 text-slate-500">
            <Tx
              k="host.v2.address.hint"
              source="Guests only see the street address after they book, but we need it to place your listing."
            />
          </p>

          <div className="mt-[clamp(1rem,3vh,2.25rem)] overflow-hidden rounded-2xl bg-white shadow-[0_5px_24px_rgba(15,23,42,0.1)]">
            <label className="block border-b border-slate-200 px-4 py-2.5">
              <span className="block text-xs text-slate-500">
                <Tx k="host.v2.address.country" source="Country / region" />
              </span>
              <select
                ref={(node) => { fieldRefs.current.country = node; }}
                aria-invalid={Boolean(touched && fieldIssues.country)}
                aria-describedby="listing-flow-address-country-error"
                className="mt-0.5 w-full bg-transparent text-base outline-none"
                value={country}
                onChange={(event) => setCountry(event.target.value)}
              >
                <option value="MK"><Tx k="country.mk" source="North Macedonia" /></option>
                <option value="DK"><Tx k="country.dk" source="Denmark" /></option>
                <option value="GR"><Tx k="country.gr" source="Greece" /></option>
                <option value="ES"><Tx k="country.es" source="Spain" /></option>
                {/* A draft can arrive carrying a country this list does not offer — an
                    import from a provider listing anywhere else. Without an option of its
                    own the select falls back to showing the first one, so the host reads
                    "North Macedonia" over a stored value that is nothing of the sort and
                    has no way to see what is really there. The address modal has always
                    kept the stored value visible this way. */}
                {OFFERED_COUNTRIES.includes(country) ? null : (
                  <option value={country}>{country}</option>
                )}
              </select>
              <FieldError
                id="listing-flow-address-country-error"
                issue={touched ? fieldIssues.country : undefined}
                field="country"
              />
            </label>
            <AddressInput
              id="listing-flow-address-street"
              inputRef={(node) => { fieldRefs.current.address = node; }}
              label={i18n.resolve("host.v2.address.street", "Street address").text}
              value={street}
              onChange={setStreet}
              autoComplete="street-address"
              maxLength={ADDRESS_MAX}
              issue={touched ? fieldIssues.address : undefined}
              field="address"
            />
            <AddressInput
              id="listing-flow-address-unit"
              inputRef={(node) => { fieldRefs.current.area = node; }}
              label={i18n.resolve("host.v2.address.unit", "Apt, suite or unit (optional)").text}
              value={unit}
              onChange={setUnit}
              autoComplete="address-line2"
              maxLength={AREA_MAX}
              issue={touched ? fieldIssues.area : undefined}
              field="area"
            />
            <AddressInput
              id="listing-flow-address-postcode"
              inputRef={(node) => { fieldRefs.current.postalCode = node; }}
              label={i18n.resolve("host.v2.address.postcode", "Postcode").text}
              value={postcode}
              onChange={setPostcode}
              autoComplete="postal-code"
              maxLength={POSTAL_CODE_MAX}
              issue={touched ? fieldIssues.postalCode : undefined}
              field="postalCode"
            />
            <AddressInput
              id="listing-flow-address-city"
              inputRef={(node) => { fieldRefs.current.city = node; }}
              label={i18n.resolve("host.v2.address.city", "City / town").text}
              value={city}
              onChange={setCity}
              autoComplete="address-level2"
              maxLength={CITY_MAX}
              issue={touched ? fieldIssues.city : undefined}
              field="city"
              last
            />
          </div>
        </div>
      </main>
      <ListingFlowFooter
        // A real link only while the address holds, so Next works before hydration on
        // the happy path; otherwise a button that reveals what is missing and keeps the
        // host on this screen.
        {...(firstInvalid ? {} : { nextHref })}
        backHref={returnToReview ? reviewHref(query) : `/host/start/location?${query}`}
        nextLabel={nextLabel}
        onNext={async () => {
          setTouched(true);
          if (firstInvalid) {
            // Nothing is written: an address the server would reject is not worth
            // storing over the one the draft already holds.
            fieldRefs.current[firstInvalid]?.focus();
            return;
          }
          const saved = await save({
            address: street.trim(),
            area: unit.trim(),
            postalCode: postcode.trim(),
            city: city.trim(),
            country: country.trim(),
            currentStepId: "details",
            currentRoute: nextRoute,
          });
          // A failed save keeps the host here with the toast the provider raised, rather
          // than navigating on to a step built on an address that was never stored.
          if (saved) window.location.assign(nextHref);
        }}
        phaseOneProgress={72}
      />
    </>
  );
}

function AddressInput({
  id,
  inputRef,
  label,
  value,
  onChange,
  autoComplete,
  maxLength,
  issue,
  field,
  last = false,
}: {
  id: string;
  inputRef: (node: HTMLInputElement | null) => void;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  maxLength: number;
  issue: LocationIssue | undefined;
  field: AddressField;
  last?: boolean;
}) {
  const errorId = `${id}-error`;
  return (
    <label className={`block px-4 py-2.5 ${last ? "" : "border-b border-slate-200"}`}>
      <span className="block text-xs text-slate-500">{label}</span>
      <input
        id={id}
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        maxLength={maxLength}
        aria-invalid={Boolean(issue)}
        aria-describedby={errorId}
        className="mt-0.5 w-full rounded-md bg-transparent text-base text-slate-950 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
      />
      <FieldError id={errorId} issue={issue} field={field} />
    </label>
  );
}

/**
 * One field's error.
 *
 * Always in the tree, so the live region exists to announce into rather than being
 * created at the moment it has something to say — the same shape the title and
 * description fields use.
 */
function FieldError({
  id,
  issue,
  field,
}: {
  id: string;
  issue: LocationIssue | undefined;
  field: AddressField;
}) {
  const { resolve } = useI18n();
  return (
    <p id={id} role="alert" className="mt-1 text-sm text-rose-600 empty:hidden">
      {issue ? issueText(resolve, field, issue) : null}
    </p>
  );
}

function issueText(
  resolve: (key: string, source: string) => { text: string; translated: boolean },
  field: AddressField,
  issue: LocationIssue,
): string {
  if (issue === "TOO_LONG") {
    return resolve("host.v2.address.error_too_long", "That is longer than we can store.").text;
  }
  switch (field) {
    case "address":
      return resolve(
        "host.v2.address.error_street",
        "Add the street address so we can place your listing.",
      ).text;
    case "city":
      return resolve("host.v2.address.error_city", "Add the city or town.").text;
    case "country":
      return resolve("host.v2.address.error_country", "Choose the country or region.").text;
    default:
      return resolve("host.v2.address.error_too_long", "That is longer than we can store.").text;
  }
}
