# Mobile and web host-control parity

The web control panel is the product and design reference. React Native components may
adapt layout for touch and narrow screens, but they should not introduce a different
workflow, terminology, status model, or visual hierarchy.

## Component audit

| Web source | React Native implementation | Parity behavior |
| --- | --- | --- |
| `host/page.tsx` | `(tabs)/dashboard.tsx` | Same `Host Dashboard` title, create-listing action, four linked statistic cards, labels, and values. The previous mobile-only quick-action section was removed. |
| `host/listings/page.tsx` | `(tabs)/listings.tsx` | Same in-progress drafts section, step position, last-edited date, compact listing rows, status badges, price/booking metadata, and empty state. |
| `host-listing-card.tsx` | listing row in `(tabs)/listings.tsx` | Same edit, availability, preview, hide, and delete actions. The previous image-heavy card design was removed because it was not the control-panel component. |
| `host/bookings/page.tsx` | `(tabs)/bookings.tsx` | Same listing/city header, status badge, guest/date/guest-count/total grid, guest note, confirm/reject actions, and chronological list. The mobile-only filter was removed. |
| `host-cancel-booking-button.tsx` | confirmed-booking cancellation form | Same guarded two-step cancellation, emergency warning, required reason, confirm action, and "Keep booking" escape. |
| `property-availability-calendar.tsx` | `availability-calendar.tsx` | Same range selection, manual/booking/custom-price legend, nightly price labels, selected-range statistics, optional block reason, edit/reset price, make available, block, bulk future actions, filters, and upcoming-exceptions timeline. |
| `marketplace-stay-date-picker.tsx` | month grid inside `availability-calendar.tsx` | Reuses the same date-only and exclusive-end range semantics. It is rendered as a touch-first single-month grid instead of a desktop dialog/two-column month layout. |
| `google-translate-widget.tsx` | `language-selector.tsx` | Same enabled-language data, searchable list, reviewed-language grouping, current-language checkmark, selection analytics, and all 16 enabled languages. Native preference is stored with AsyncStorage. |
| `I18nProvider` / `UiTranslation` | `LanguageProvider` and `/api/mobile/v1/languages` | Uses the same reviewed translation rows. The API only returns current translations whose source snapshot is still valid. Dates, relative time, prices, and month/week labels use the selected locale. |
| `host-sidebar.tsx` | bottom tabs and account screen | Same Dashboard, My Listings, Bookings, Stays, Account, and Log out concepts, adapted to platform navigation. Inbox is new because chat is a new requested capability. |
| login and mobile auth bridge | `login.tsx` | Same Google and email-link choices and the same server session. The language selector is also available before sign-in. |
| seven-step listing form | `new-listing.tsx` bridge | Uses the exact seven step names/descriptions and opens the existing responsive builder, preserving its component behavior and saved drafts. Native duplication is intentionally deferred until each complex field can share the same validation and backend contract. |
| New capability | notification center and booking chat | Booking/chat notifications, unread bell, booking-linked inbox, and thread screen are new requested components. Their future web implementation is specified in `chat-notifications-web-spec.md`. |

## Shared rules

- Use the server database/session as the source of truth.
- Keep date-only values as `YYYY-MM-DD` at API boundaries and use an exclusive end date.
- Use database status values and the web app's status labels.
- Use the listing pricing currency; do not assume EUR in a reusable component.
- Destructive and bulk actions require confirmation and retain booking holds.
- Opening a conversation clears both its thread count and its chat-notification rows.
- Mobile UI copy is registered in `mobile-ui-catalog.ts` so React Native does not depend
  on browser DOM translation.

## Translation synchronization status

The 176 mobile-only fixed strings are registered in the normal UI catalog and have
validated translations for all 15 reviewed non-English languages. The normal Anthropic
sync provider had insufficient credit during this implementation, so the repository's
OpenAI fallback generator completed the missing translations through the same key,
source-snapshot, and placeholder validation pipeline.

Translation content is database-backed. After a future translation sync, the language
API serves updated rows automatically without requiring a mobile rebuild.
