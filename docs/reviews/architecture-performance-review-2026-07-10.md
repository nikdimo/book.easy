# book.easy.mk Architecture and Performance Review

Date: 2026-07-10

Scope: review of the current local codebase after recent changes. No application code was modified for this review.

## Executive Summary

The app has a solid MVP foundation: Next.js App Router, Prisma, Auth.js, server actions, domain-oriented service files, a clear booking/availability model, and product documentation that correctly aims for a modular monolith.

The current implementation is not yet enterprise-grade. The main issue is not one single bad file; it is inconsistent boundaries. Some flows use services, some pages query Prisma directly, some server actions contain business/data logic directly, and validation/serialization/query-shaping are spread across pages, services, and components.

The biggest performance risk right now is the search/date experience. The marketplace date picker renders many months and many custom day buttons, carries both guest and availability behavior, and performs a lot of client-side state work. The search page also runs multiple database queries per navigation and the filter preview endpoint runs several extra queries while the user changes filters.

Highest priority recommendations:

1. Split the large date picker into small focused components and reduce initial rendered months.
2. Move all Prisma access behind module-owned query/service functions.
3. Add a proper data access layer marked `server-only`.
4. Fix lint/build hygiene so CI only checks the application, not backups/artifacts.
5. Add database-level protection for overlapping bookings/availability.
6. Stop forcing the whole app dynamic from the root layout.
7. Reduce search query payloads, especially listing images, amenities, filter facets, and map data.

## Validation Snapshot

Commands run:

- `npx tsc --noEmit --pretty false`: passed.
- `npm run lint`: failed because ESLint scans `.codex-backups` and `Listing-Explorer`, which are not part of the app. Visible app warnings included unused variables in `src/app/error.tsx`, `src/components/public/amenity-list.tsx`, `src/lib/services/listing.service.ts`, and `src/lib/storage/local.adapter.ts`.
- `npm run build`: timed out after about 184 seconds. Treat this as not validated, not as passed.

Important tooling finding:

- `eslint.config.mjs` only ignores `.next`, `out`, `build`, and `next-env.d.ts` (`eslint.config.mjs:9-15`). It does not ignore `.codex-backups`, `Listing-Explorer`, `.tmp.driveupload`, or generated Prisma output.
- `tsconfig.json` excludes `node_modules` and `Listing-Explorer`, but not `.codex-backups` or `src/generated/prisma`.

## Current Architecture State

The intended architecture in `docs/architecture/system-architecture.md` is a modular monolith:

- Pages/components should stay thin.
- Server actions should authenticate, validate, and dispatch.
- Services should hold business rules.
- Data access should be controlled and reusable.

The implementation is partially aligned:

- `src/lib/services/search.service.ts`, `booking.service.ts`, `property.service.ts`, and similar files are good steps.
- Server actions exist and are used for mutations.
- Prisma schema is coherent for an MVP marketplace.

But the boundaries are inconsistent:

- Admin/account/host pages query `db` directly.
- Listing create/update/delete actions contain multi-step database workflows directly.
- Search service builds Prisma filters, serializes cards, calculates facets, and handles query composition in the same file.
- Client components import types from services, creating tighter coupling than needed.

For an enterprise-level application, the app should move toward feature modules:

```text
src/modules/
  booking/
    booking.actions.ts
    booking.service.ts
    booking.repository.ts
    booking.schemas.ts
    booking.dto.ts
  listing/
  search/
  availability/
  user/
  admin/
```

Each module should own:

- Input schemas.
- Public service API.
- Repository/query functions.
- DTO/serializer functions.
- Tests for business rules.

Pages should call module query functions and render. They should not assemble complex Prisma includes.

## Highest-Risk Findings

### 1. Booking race protection is not strong enough for production

`createBooking` checks overlap and then creates a booking/hold inside a Prisma transaction (`src/lib/services/booking.service.ts:18-105`). That is better than no transaction, but it does not guarantee collision prevention under concurrent requests unless the database isolation/locking strategy is explicit.

Risk:

- Two booking requests for the same listing/date range can both pass the overlap check before either insert is visible, depending on transaction isolation.

Recommendation:

- Add a PostgreSQL exclusion constraint on `(listingId, daterange(startDate, endDate, '[)'))` for active availability blocks, or use a raw SQL migration with GiST indexes.
- Alternatively, use `SERIALIZABLE` isolation plus retry logic, or advisory locks keyed by listing ID.
- Add a concurrency test that sends two simultaneous booking requests for the same dates and expects one success and one conflict.

### 2. Listing deletion violates the documented data lifecycle

`deleteListing` hard-deletes historical bookings when no pending/confirmed booking exists (`src/lib/actions/listing.actions.ts:266-288`). The architecture document says bookings should never be deleted and listings with booking history should be archived.

Risk:

- Financial/operational history can disappear.
- Guest history and audit trails become unreliable.
- Future payments/reviews/support workflows become harder.

Recommendation:

- Replace hard delete with `status = ARCHIVED` when any booking has ever existed.
- Only hard delete draft listings with zero bookings, zero holds, and no operational history.
- Never delete bookings from a host-facing listing delete action.

### 3. Root layout forces the whole app dynamic

`src/app/layout.tsx` exports `dynamic = "force-dynamic"` at the root (`src/app/layout.tsx:20-21`).

Risk:

- Public pages lose static shell/PPR opportunities.
- Navigation and first render depend more on runtime work.
- This fights the Next 16 caching model described in the installed docs.

Recommendation:

- Remove root-level force dynamic after build/database issues are fixed.
- Put dynamic behavior only on pages/routes that actually need per-request data.
- Use `Suspense`, route-level loading states, and Cache Components where data can be cached.

### 4. Tooling is not a reliable quality gate

Lint currently scans backup/generated/artifact folders. Build timed out.

Risk:

- CI will fail for files that are not the app.
- Real app issues get hidden in noise.
- Developers cannot trust validation commands.

Recommendation:

- Extend ESLint global ignores to match `.gitignore`: `.codex-backups/**`, `.tmp.driveupload/**`, `Listing-Explorer/**`, `src/generated/prisma/**`.
- Add `src/generated/prisma` to `tsconfig.exclude` if the project keeps it locally.
- Make CI run `npm run lint`, `npx tsc --noEmit`, `npm run build`, and a Prisma schema check.

## Date Selector Performance

The date selector is the clearest UI performance problem.

Evidence:

- `MarketplaceStayDatePicker` starts with 6 months on mobile and 8 months on desktop (`src/components/marketplace/marketplace-stay-date-picker.tsx:81-84`).
- The component stores many interactive states for open/step/mobile/drag/range (`src/components/marketplace/marketplace-stay-date-picker.tsx:344-421`).
- The rendered calendar uses `numberOfMonths={visibleMonthCount}` with a custom day button for every day (`src/components/marketplace/marketplace-stay-date-picker.tsx:897-913`).
- It is reused for search and host availability, even though those are different workflows.

Likely cause of visible delay:

- Opening the picker causes React to render hundreds of day cells immediately.
- Each day cell has custom logic, context reads, date formatting, modifiers, pointer behavior, and styling.
- Availability mode adds per-day metadata and custom price labels.

Recommended refactor:

1. Split the component into:
   - `StayDateTrigger`
   - `StayDateDialog`
   - `StayCalendar`
   - `GuestStep`
   - `AvailabilityCalendar`
2. Render 2 months initially on desktop and 1-2 months on mobile.
3. Load more months only after explicit "Show more months" or scroll, not immediately.
4. Use range-based disabled/modifier matchers instead of expanding long ranges to individual dates.
5. Memoize day metadata by `yyyy-MM-dd` string and avoid repeated `date-fns/format` calls per cell.
6. Do not reuse the full marketplace picker for host availability. Host availability needs a different, denser operational calendar.
7. Lazy-load the dialog content so the search bar trigger does not ship all calendar/drag/guest logic upfront.
8. Profile with React DevTools Profiler around picker open and date selection.

Immediate low-risk changes to consider later:

- Lower `INITIAL_DESKTOP_MONTH_COUNT` from 8 to 2.
- Lower `INITIAL_MOBILE_MONTH_COUNT` from 6 to 2.
- Keep `MAX_MONTH_COUNT` behind an explicit load-more action.
- Keep booking-detail `DateRangePicker` separate and lightweight.

## Search and Filtering Performance

`PropertiesPage` runs listing search, amenities, and filter preview together (`src/app/(public)/properties/page.tsx:56-64`). Then `PropertiesExplorerClient` receives the preview for UI state (`src/app/(public)/properties/page.tsx:111-118`).

`getSearchFilterPreview` runs four database operations for every preview (`src/lib/services/search.service.ts:223-256`):

- total count
- property type rows
- amenity rows
- max bedrooms

The filter UI also calls `/api/properties/filter-preview` after a 150 ms debounce when filters change (`src/components/public/search-filters.tsx`).

Risks:

- Search page navigation becomes database-heavy.
- Filter changes can trigger repeated facet queries.
- Facet queries fetch rows and derive sets in Node instead of asking PostgreSQL for grouped/distinct values.

Recommendations:

- Replace row-fetching facet queries with SQL/grouped queries:
  - distinct property types
  - distinct amenity names
  - max bedrooms
- Increase debounce to 300-400 ms and avoid preview fetches when state equals initial preview.
- Cache stable filter metadata such as amenity list and city/property-type maps.
- Add query timing logs for `searchListings` and `getSearchFilterPreview`.
- Add database indexes for the actual search patterns:
  - `Listing(status, createdAt)`
  - `Listing(status, maxGuests)`
  - `Listing(status, bedrooms)`
  - `Property(city)`
  - `Property(propertyType)`
  - `PricingRule(baseNightlyRate)`
  - `ListingImage(listingId, displayOrder)`
  - `ListingDatePrice(listingId, date)` already exists and is good.
- Consider `pg_trgm` or normalized/canonical city fields for case-insensitive contains search.

Important search correctness issue:

- Amenity filtering uses `some amenity name in selected amenities` (`src/lib/services/search.service.ts:66-71`). That matches listings with any selected amenity. Many marketplace filters expect all selected amenities. Decide the product rule and implement it intentionally.

## Listing Card and Client Bundle

`PropertyCard` is a client component for the whole card. It handles hover, image carousel state, save state, rating badges, and date formatting.

Risk:

- Every search result card hydrates as client JS.
- Listing pages with many cards pay hydration cost even when most content is static.
- Demo rating/business host/guest favorite logic runs on every card render.

Recommendation:

- Split `PropertyCard` into a server-rendered shell and small client islands:
  - image carousel controls
  - save/heart button
- Move demo/generated labels out of runtime render or replace them with real fields.
- Fetch only the first image for grid cards unless carousel-on-card is a required product feature.
- For search results, `searchListings` currently includes up to 8 images per listing (`src/lib/services/search.service.ts:107-112`). Use 1 image by default and fetch more only when a user opens a gallery/carousel.

## Availability and Pricing Performance

`getBlockedDatesForListing` fetches blocks and expands every date into a `Date[]` (`src/lib/services/availability.service.ts:30-49`).

Risk:

- A host blocking a year creates 365 client dates.
- Several long blocks create large payloads and slow calendar matching.
- This will get worse with imported calendars and dense bookings.

Recommendation:

- Return date ranges to the UI instead of individual dates.
- Let `react-day-picker` use range matchers.
- Keep availability blocks and booking holds separate in UI metadata without expanding every day unless needed.
- Add a cutoff window, e.g. only send blocks for the next 12-18 months on public listing pages.

Pricing:

- `ListingDatePrice` is a good addition for seasonal/daily pricing.
- For long stays, `computeStayPricing` builds a per-night array. That is OK for normal booking stays, but keep max nights enforced and avoid using this for large timeline displays.

## Database and Prisma

Good:

- Core relations are clear.
- Important basic indexes exist.
- `AvailabilityBlock(listingId, startDate, endDate)` and `Booking(listingId, checkIn, checkOut)` are in the schema.
- Price snapshots are stored on bookings.

Needs improvement:

- Add database-level non-overlap protection for availability holds.
- Add indexes for search and moderation list ordering.
- Avoid hard deletes for operational records.
- Add migrations, not just `db push`, for production.
- Add Prisma query logging in development with slow-query thresholds.

Recommended DB additions:

- `Listing(status, createdAt)`
- `Listing(status, updatedAt)`
- `Listing(hostId, status)`
- `Booking(guestId, createdAt)`
- `Booking(listingId, status, checkIn)`
- `AuditLog(createdAt, entityType)`
- `ListingImage(listingId, displayOrder)`
- Consider normalized city/search fields or PostgreSQL trigram indexes.

## Next.js 16 Architecture Recommendations

The installed Next docs say:

- Pages/layouts are server components by default.
- Keep `"use client"` boundaries small.
- Use Suspense around uncached runtime data.
- Use Cache Components where data can be cached.
- Put providers as deep as possible.

Current issues:

- Root layout is dynamic.
- `SessionProvider` wraps the whole app from root, even public pages.
- Many components are client components.
- No Cache Components strategy is configured.

Recommendations:

- Remove root dynamic once build/data access are clean.
- Move session provider into authenticated route groups where possible.
- Keep public marketplace pages mostly server-rendered.
- Use `loading.tsx` and Suspense around slow dynamic sections.
- Add `server-only` imports to modules that use Prisma, auth secrets, email, storage, or filesystem.
- Consider Cache Components for:
  - homepage featured listings
  - amenity list
  - city/property-type metadata
  - public listing static details, with explicit invalidation on listing updates

## Security and Operational Readiness

Security concerns:

- `next.config.ts` allows images from any HTTPS hostname. This is convenient, but too broad for production.
- Upload validates MIME type and size, but should also validate image dimensions/content using an image parser.
- No rate limiting is visible for auth, booking, upload, or filter-preview endpoints.
- Server actions do authorization checks, but those checks are scattered.
- Admin pages rely partly on route protection and direct page queries; enterprise posture should also enforce authorization in module/service functions.

Recommendations:

- Restrict image remote patterns to known domains or storage CDN.
- Add upload scanning/normalization and filename sanitization.
- Add rate limits for login/magic link, upload, booking creation, and filter preview.
- Add structured audit logging for host/admin actions, not only some admin actions.
- Add service-level authorization helpers:
  - `requireUser`
  - `requireHost`
  - `requireAdmin`
  - `assertListingOwner`

## Code Organization Refactor Plan

Phase 1: tooling and safety

- Fix ESLint ignores.
- Make build pass reliably.
- Add `server-only` to DB/service modules.
- Remove ignored/generated folders from validation scope.
- Add minimal tests for booking overlap and listing delete/archive behavior.

Phase 2: date/search performance

- Split date picker and reduce initial months.
- Return availability ranges instead of expanded dates.
- Reduce listing card payload to primary image first.
- Replace facet row-fetching with grouped/distinct queries.
- Add query timing logs.

Phase 3: module boundaries

- Create `src/modules`.
- Move booking, listing, availability, search, and admin logic into modules.
- Make pages thin.
- Move direct Prisma calls out of pages.
- Standardize DTOs for public card, listing detail, host listing form, admin rows.

Phase 4: production readiness

- Add migration discipline.
- Add DB overlap constraint/advisory lock strategy.
- Add rate limiting and upload hardening.
- Add observability: structured logs, slow-query logs, error reporting, web vitals.
- Add CI checks and smoke tests.

## Priority Backlog

P0 - must fix before serious production traffic:

- Booking overlap protection at database/transaction level.
- Listing delete must archive instead of deleting historical bookings.
- Lint/build validation must only include app files.
- Build must pass within a predictable time.

P1 - high performance value:

- Refactor heavy date picker.
- Send availability ranges instead of expanded dates.
- Reduce search/listing payloads.
- Optimize filter preview queries.
- Remove root `force-dynamic` and adopt route-level dynamic/caching.

P2 - enterprise architecture:

- Move Prisma access behind module repositories.
- Add service-level authorization helpers.
- Add DTO boundaries.
- Add `server-only` protection.
- Add integration tests for core flows.

P3 - scale and polish:

- Add query timing/metrics.
- Add bundle analyzer.
- Add Core Web Vitals reporting.
- Add search cache/facet cache.
- Add object storage/CDN migration path.

## Bottom Line

The app is in a strong MVP shape, but it is not yet structured like a system that can grow safely without slowing down development. The main technical debt is boundary debt: too much business/data behavior is spread across pages, actions, services, and client components.

For performance, focus first on the date picker and search pipeline. The visible date-selector delay is very likely caused by rendering too many interactive calendar cells and carrying too much behavior in one client component. The fastest path to improvement is to split the picker, reduce initial months, and use range-based data instead of per-day expansion.

For enterprise readiness, focus first on validation gates, booking concurrency, data lifecycle correctness, and module boundaries. These are the foundations that will let future payments, reviews, messaging, calendar sync, and dynamic pricing be added without rewriting the app.
