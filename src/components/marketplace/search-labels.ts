"use client";

import { useMemo } from "react";
import { pluralForms, useI18n } from "@/lib/i18n/client";
import type { PluralForms, Resolved } from "@/lib/i18n/t";

/**
 * The fixed copy shared by the search bar / place / date / guest picker tree.
 *
 * This is a convenience bag over the single `useI18n()` translator, not a second
 * translation system: there is one provider (the root `I18nProvider`) and one
 * resolution path. Grouping these particular strings keeps the tightly-coupled
 * picker components from repeating ~60 `resolve` calls across four files.
 *
 * Outside the provider (for example the host availability calendar, which reuses the
 * date picker) `useI18n()` returns its English fallback translator, so every label
 * degrades to English source copy instead of throwing.
 */
export interface SearchLabels {
  locale: string;
  where: Resolved;
  whereToPlaceholder: Resolved;
  searchDestinations: Resolved;
  destinationDescription: Resolved;
  closeDestinationPicker: Resolved;
  searchListingCities: Resolved;
  matchingCities: Resolved;
  citiesWithListings: Resolved;
  noMatchingCities: Resolved;
  propertyType: Resolved;
  selectCityFirst: Resolved;
  noPropertyTypesInCity: Resolved;
  reset: Resolved;
  next: Resolved;
  back: Resolved;

  when: Resolved;
  anyDates: Resolved;
  addDates: Resolved;
  chooseDates: Resolved;
  chooseDatesDescription: Resolved;
  checkIn: Resolved;
  checkOut: Resolved;
  closePicker: Resolved;
  exactDates: Resolved;
  flexible1: Resolved;
  flexible2: Resolved;
  flexible3: Resolved;
  flexible7: Resolved;
  flexible14: Resolved;

  who: Resolved;
  addGuests: Resolved;
  adults: Resolved;
  adultsHint: Resolved;
  children: Resolved;
  childrenHint: Resolved;
  infants: Resolved;
  infantsHint: Resolved;
  pets: Resolved;
  petsHint: Resolved;
  chooseGuestsDescription: Resolved;
  done: Resolved;
  edit: Resolved;

  guest: PluralForms;
  infant: PluralForms;
  pet: PluralForms;
  night: PluralForms;

  search: Resolved;
  openSearch: Resolved;
  closeSearch: Resolved;
  searchNow: Resolved;
  searchSteps: Resolved;
  whosComing: Resolved;
}

/**
 * Keys are stable identifiers and must not be renamed — an existing translation is
 * matched by key, so a rename silently orphans reviewed copy and forces a paid
 * re-translation. Every key and English source below is byte-identical to what the
 * catalog already contains.
 */
export function useSearchLabels(): SearchLabels {
  const i18n = useI18n();

  return useMemo<SearchLabels>(
    () => ({
      locale: i18n.locale,
      where: i18n.resolve("search.where", "Where"),
      whereToPlaceholder: i18n.resolve("search.where_to", "Where to?"),
      searchDestinations: i18n.resolve("search.search_destinations", "Search destinations"),
      destinationDescription: i18n.resolve(
        "search.destination_description",
        "Choose a destination city and optional property type filters."
      ),
      closeDestinationPicker: i18n.resolve(
        "search.close_destination_picker",
        "Close destination picker"
      ),
      searchListingCities: i18n.resolve("search.search_listing_cities", "Search listing cities"),
      matchingCities: i18n.resolve("search.matching_cities", "Matching cities"),
      citiesWithListings: i18n.resolve("search.cities_with_listings", "Cities with listings"),
      noMatchingCities: i18n.resolve(
        "search.no_matching_cities",
        "No listing cities match that search"
      ),
      propertyType: i18n.resolve("search.property_type", "Property type"),
      selectCityFirst: i18n.resolve(
        "search.select_city_first",
        "Select a city first to see available property types."
      ),
      noPropertyTypesInCity: i18n.resolve(
        "search.no_property_types_in_city",
        "No property types are available in {city}."
      ),
      reset: i18n.resolve("search.reset", "Reset"),
      next: i18n.resolve("search.next", "Next"),
      back: i18n.resolve("search.back", "Back"),

      when: i18n.resolve("search.when", "When"),
      anyDates: i18n.resolve("search.any_dates", "Any dates"),
      addDates: i18n.resolve("search.add_dates", "Add dates"),
      chooseDates: i18n.resolve("search.choose_dates", "Choose dates"),
      chooseDatesDescription: i18n.resolve(
        "search.choose_dates_description",
        "Choose your check-in and check-out dates."
      ),
      checkIn: i18n.resolve("search.check_in", "Check in"),
      checkOut: i18n.resolve("search.check_out", "Check out"),
      closePicker: i18n.resolve("search.close_picker", "Close picker"),
      exactDates: i18n.resolve("search.exact_dates", "Exact dates"),
      flexible1: i18n.resolve("search.flexible_1", "+- 1 day"),
      flexible2: i18n.resolve("search.flexible_2", "+- 2 days"),
      flexible3: i18n.resolve("search.flexible_3", "+- 3 days"),
      flexible7: i18n.resolve("search.flexible_7", "+- 7 days"),
      flexible14: i18n.resolve("search.flexible_14", "+- 14 days"),

      who: i18n.resolve("search.who", "Who"),
      addGuests: i18n.resolve("search.add_guests", "Add guests"),
      adults: i18n.resolve("search.adults", "Adults"),
      adultsHint: i18n.resolve("search.adults_hint", "Ages 13 or above"),
      children: i18n.resolve("search.children", "Children"),
      childrenHint: i18n.resolve("search.children_hint", "Ages 2 - 12"),
      infants: i18n.resolve("search.infants", "Infants"),
      infantsHint: i18n.resolve("search.infants_hint", "Under 2"),
      pets: i18n.resolve("search.pets", "Pets"),
      petsHint: i18n.resolve("search.pets_hint", "Bringing a service animal?"),
      chooseGuestsDescription: i18n.resolve(
        "search.choose_guests_description",
        "Choose how many guests are coming."
      ),
      done: i18n.resolve("search.done", "Done"),
      edit: i18n.resolve("search.edit", "Edit"),

      guest: pluralForms(i18n, "search.guest", "{n} guest", "{n} guests"),
      infant: pluralForms(i18n, "search.infant", "{n} infant", "{n} infants"),
      pet: pluralForms(i18n, "search.pet", "{n} pet", "{n} pets"),
      night: pluralForms(i18n, "search.night", "{n} night", "{n} nights"),

      search: i18n.resolve("search.search", "Search"),
      openSearch: i18n.resolve("search.open_search", "Open search"),
      closeSearch: i18n.resolve("search.close_search", "Close search"),
      searchNow: i18n.resolve("search.search_now", "Search now"),
      searchSteps: i18n.resolve(
        "search.search_steps",
        "Complete your stay search in three steps."
      ),
      whosComing: i18n.resolve("search.whos_coming", "Who's coming"),
    }),
    [i18n]
  );
}
