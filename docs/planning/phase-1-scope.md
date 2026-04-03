# book.easy.mk — Phase 1 Scope

## Objective

Deliver a launchable two-sided property marketplace MVP where guests can discover and book stays, hosts can create and manage listings, and platform admins can moderate content and manage operations.

---

## What Is Included

### Authentication & User Management
- [x] User registration (email + password)
- [x] User login / logout
- [x] JWT-based sessions via Auth.js v5
- [x] Profile management (name, phone, bio, avatar)
- [x] Password change
- [x] Role model: USER (default) and ADMIN (seeded/promoted)
- [x] Host capability activation (isHost flag with onboarding)
- [x] Route-level middleware protection (admin, account, host routes)

### Host Experience
- [x] "Become a Host" onboarding flow
- [x] Host dashboard with listing overview and booking requests
- [x] Create listing (title, description, type, location, capacity, amenities, photos, pricing)
- [x] Edit listing (all fields)
- [x] Submit listing for admin review
- [x] Unpublish listing
- [x] View listing moderation status
- [x] Manage listing photos (upload, reorder, delete, set primary)
- [x] Manage blocked dates (calendar-based blocking/unblocking)
- [x] View booking requests for own listings
- [x] Confirm or reject pending bookings
- [x] Cancel confirmed bookings (with required reason)

### Admin Area
- [x] Admin-only layout with sidebar navigation
- [x] Dashboard with platform metrics (users, hosts, listings by status, bookings by status)
- [x] Listing moderation queue (pending review listings)
- [x] Approve listing (with audit log)
- [x] Reject listing with reason (with audit log)
- [x] Suspend approved listing (with audit log)
- [x] User management (list users, view details, deactivate)
- [x] Booking management (list all bookings, admin cancel with reason)
- [x] Audit log viewer

### Public Website
- [x] Homepage with hero section, search bar, featured listings
- [x] Search results page with listing cards
- [x] Search filters: location, date range, guest count, price range, amenities, property type
- [x] Listing detail page with photos, description, amenities, host info, pricing
- [x] Availability calendar on listing detail page
- [x] Responsive design (mobile-first)
- [x] SEO basics (page titles, meta descriptions, Open Graph)

### Booking Flow
- [x] Date selection with calendar component
- [x] Guest count selection with max validation
- [x] Server-side availability checking (no overlapping blocks or bookings)
- [x] Price calculation and breakdown display
- [x] Transactional booking creation (Booking + AvailabilityBlock in one transaction)
- [x] Double-booking prevention via database transaction
- [x] Booking confirmation page
- [x] Request-to-book model (bookings start as PENDING)

### Guest Account Area
- [x] My Bookings page (list of all bookings with status)
- [x] Booking detail view
- [x] Cancel booking (pending or confirmed)
- [x] Profile management page

### Data Model
- [x] User, Profile
- [x] Property, Listing (separated)
- [x] ListingImage
- [x] Amenity, ListingAmenity
- [x] PricingRule (1:1 with Listing)
- [x] AvailabilityBlock (manual blocks + booking holds)
- [x] Booking (full lifecycle status)
- [x] AuditLog

### Infrastructure
- [x] Prisma schema and migrations
- [x] Seed data (sample users, properties, listings, amenities, bookings)
- [x] Environment variable configuration (.env.example)
- [x] Local file storage for image uploads (with abstraction interface)
- [x] Email abstraction (interface defined, console/log adapter for MVP)
- [x] README with setup and run instructions

---

## What Is Excluded from Phase 1

### Explicitly Deferred

| Feature | Deferred To | Reason |
|---------|-------------|--------|
| Payment processing | Phase 2 | Requires Stripe integration, legal setup |
| Host payouts | Phase 2 | Depends on payment processing |
| Platform commission fees | Phase 2 | Depends on payment processing |
| Reviews and ratings | Phase 2 | Needs completed bookings flow maturity |
| Guest-host messaging | Phase 2 | Significant scope; booking requests work without it |
| Email notifications | Phase 2 | Abstraction exists; actual sending deferred |
| In-app notifications | Phase 2 | Not critical for MVP launch |
| Cancellation policy engine | Phase 2 | MVP uses simple cancellation; policies need payment |
| Wishlists / saved listings | Phase 2 | Nice-to-have; no impact on core flow |
| OAuth / social login | Phase 2 | Credentials auth is sufficient for launch |
| Email verification | Phase 2 | Auth.js supports it; deferred for simplicity |
| Password reset | Phase 2 | Important but not launch-blocking with small user base |
| Map-based search | Phase 3 | Requires geo infrastructure |
| Calendar sync (iCal) | Phase 3 | Advanced host feature |
| Dynamic / seasonal pricing | Phase 3 | Complex; base pricing sufficient for launch |
| Identity verification | Phase 3 | Trust feature; manual vetting sufficient for MVP |
| Multi-language | Phase 4 | Single language for launch market |
| Multi-currency | Phase 4 | Single currency (EUR) for launch |
| Mobile app | Phase 4 | Responsive web is sufficient |

### Structural Decisions That Enable Future Features

Even though these features are excluded, the Phase 1 architecture supports them:

- **Payments**: Booking stores `serviceFee`, `totalPrice`, `nightlyRate` snapshots. Adding payment is additive.
- **Reviews**: Booking has COMPLETED status. Adding a Review entity with a foreign key to Booking is clean.
- **Messaging**: User model supports conversations. Adding Message/Conversation entities is additive.
- **Notifications**: Email abstraction interface exists. Implementing real sending is a provider swap.
- **Cancellation policies**: PricingRule model can be extended. Policy snapshots can be added to Booking.
- **Calendar sync**: AvailabilityBlock supports different block types. Adding EXTERNAL_SYNC type is a schema addition.
- **Multi-unit**: Property/Listing separation already exists. Changing from 1:1 to 1:many requires only removing a unique constraint.

---

## Launch Checklist

### Pre-Launch (Must Complete)

- [ ] All Phase 1 features implemented and functional
- [ ] Seed data removed or replaced with real content
- [ ] Admin account created with strong credentials
- [ ] Environment variables set for production (database URL, auth secret, app URL)
- [ ] Database migrated to production PostgreSQL instance
- [ ] File upload directory configured and writable
- [ ] HTTPS configured (via reverse proxy or hosting platform)
- [ ] Error pages (404, 500) display correctly
- [ ] Forms validate properly and show errors
- [ ] Booking collision prevention tested under concurrent requests
- [ ] All admin actions create audit log entries
- [ ] No hardcoded secrets in codebase
- [ ] README is accurate and up-to-date
- [ ] .env.example documents all required variables

### Pre-Launch (Recommended)

- [ ] Load test booking flow for concurrency safety
- [ ] Security review of auth flow and protected routes
- [ ] Mobile usability test on real devices
- [ ] Content review of all static text and empty states
- [ ] Accessibility check (contrast, keyboard navigation, screen reader basics)
- [ ] Analytics setup (simple page views at minimum)
- [ ] Backup strategy for database
- [ ] Domain and DNS configured for book.easy.mk

### Post-Launch (Week 1)

- [ ] Monitor for booking errors and auth issues
- [ ] Collect feedback from first hosts on listing flow
- [ ] Collect feedback from first guests on booking flow
- [ ] Identify and fix any UX friction points
- [ ] Begin Phase 2 planning based on real usage data

---

## Technical Acceptance Criteria

### Authentication
- Users can register, log in, log out, and change password
- Sessions persist across navigation and expire after configured timeout
- Protected routes redirect to login for unauthenticated users
- Admin routes are inaccessible to non-admin users
- Host routes are inaccessible to non-host users

### Listing Management
- Hosts can create listings with all required fields
- Listings start in DRAFT status
- Hosts can only see and edit their own listings
- Listing submission changes status to PENDING_REVIEW
- Only listings passing completeness checks can be submitted
- Admin can approve, reject (with reason), and suspend listings
- Only APPROVED listings appear in search results and public pages
- Moderation actions are recorded in audit log

### Booking
- Guests can request bookings with valid dates and guest count
- System rejects booking if dates overlap with existing blocks or bookings
- Booking creation is atomic (Booking + AvailabilityBlock in one transaction)
- Concurrent booking attempts for the same dates result in only one success
- Hosts can confirm or reject bookings for their own listings only
- Cancellation releases the availability hold
- Price is calculated correctly: (nights x nightly rate) + cleaning fee
- Price is snapshotted on the booking at creation time

### Search
- Search returns only APPROVED listings
- Location filter matches city, area, or country (case-insensitive)
- Date filter excludes listings with overlapping blocks
- Guest count filter excludes listings with insufficient capacity
- Price filter works on base nightly rate
- Amenity filter requires all selected amenities
- Results paginate correctly
- Empty state displays when no results match

### Authorization
- No user can access another user's private data (bookings, profile edits)
- Hosts cannot see other hosts' listings in management views
- Hosts cannot confirm/reject bookings for listings they don't own
- Admin actions are restricted to admin users
- All authorization is enforced server-side (not just UI hiding)

### Data Integrity
- No orphaned records (all foreign keys enforced)
- Deleted images are removed from storage
- Audit log captures all moderation and admin actions
- Listings with booking history cannot be hard-deleted
- Booking price does not change when listing price is updated

### UX
- All forms show validation errors clearly
- All list views handle empty state
- All async operations show loading state
- Error pages (404, 500) are user-friendly
- Layout is responsive and usable on mobile
- Navigation is clear and consistent
