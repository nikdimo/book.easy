# book.easy.mk — User Stories & Product Requirements

## 1. User Roles

### 1.1 Guest

Any authenticated user browsing and booking stays. Every new signup starts with guest capabilities. Guests can search listings, view details, request bookings, manage their own bookings, and maintain their profile.

### 1.2 Host

A user who has activated host capabilities. Hosts retain all guest capabilities and additionally can create listings, manage availability and pricing, receive and respond to booking requests, and access a host dashboard scoped to their own listings. A user becomes a host by opting into the host flow (providing required host profile information). There is no separate host account -- the same user gains host capabilities.

### 1.3 Admin

A platform operator with elevated permissions. Admins can moderate listings, manage users, intervene in bookings, and perform platform-level operational actions. Admin is a privilege layer, not a separate account type. In the MVP, admin users are seeded or promoted manually (no self-service admin signup).

### 1.4 Unauthenticated Visitor

Can browse published listings and view listing detail pages. Cannot book or interact beyond browsing. This role exists to support SEO and conversion funnels.

---

## 2. Epics

| Epic ID | Epic Name | Phase | Description |
|---------|-----------|-------|-------------|
| E-01 | User Authentication & Profiles | 1 | Signup, login, logout, profile management |
| E-02 | Host Onboarding | 1 | Activate host capabilities, host profile |
| E-03 | Listing Management | 1 | Create, edit, manage listings as a host |
| E-04 | Listing Moderation | 1 | Admin review, approve, reject, suspend listings |
| E-05 | Search & Discovery | 1 | Browse, search, filter published listings |
| E-06 | Listing Detail | 1 | Public listing page with full details and availability |
| E-07 | Booking Flow | 1 | Request-to-book, availability checking, booking lifecycle |
| E-08 | Host Booking Management | 1 | Host views and responds to booking requests |
| E-09 | Guest Booking Management | 1 | Guest views their bookings, cancellation |
| E-10 | Availability Management | 1 | Host manages blocked dates and availability |
| E-11 | Admin Operations | 1 | Admin dashboard, user management, booking intervention |
| E-12 | Payments & Monetization | 2 | Guest payments, host payouts, platform commission |
| E-13 | Reviews & Ratings | 2 | Post-stay reviews from guests and hosts |
| E-14 | Messaging | 2 | In-platform messaging between guest and host |
| E-15 | Trust & Safety | 2 | Identity verification, reporting, dispute resolution |
| E-16 | Advanced Search | 2+ | Map view, ranking, recommendations, wishlists |
| E-17 | Calendar Sync | 3 | External calendar import/export (iCal) |
| E-18 | Dynamic Pricing | 3 | Seasonal pricing, demand-based pricing tools |
| E-19 | Notifications | 2 | Email and in-app notifications for key events |
| E-20 | Support Tooling | 3 | Internal support tools, ticket system |

---

## 3. User Stories

### Epic E-01: User Authentication & Profiles

**US-01.01: User Registration**
As a visitor, I want to create an account with my email and password so that I can access the platform.

Acceptance Criteria:
- Visitor provides name, email, and password
- Email must be unique across the platform
- Password must meet minimum strength requirements (8+ chars, at least one number)
- Account is created with guest capabilities by default
- User is logged in after successful registration
- Validation errors are displayed clearly on the form

**US-01.02: User Login**
As a registered user, I want to log in with my email and password so that I can access my account.

Acceptance Criteria:
- User provides email and password
- Successful login creates a session and redirects to homepage or intended destination
- Failed login shows a generic error (do not reveal whether email exists)
- Session persists across page navigations until logout or expiry

**US-01.03: User Logout**
As a logged-in user, I want to log out so that my session ends securely.

Acceptance Criteria:
- Session is destroyed server-side
- User is redirected to homepage
- Protected pages are no longer accessible

**US-01.04: Profile Management**
As a logged-in user, I want to view and edit my profile so that my information is current.

Acceptance Criteria:
- User can view their name, email, phone number, and bio
- User can update name, phone, bio, and profile photo
- Email changes are not supported in MVP (deferred to Phase 2 with verification)
- Changes are validated and saved
- Profile photo upload works and displays correctly

**US-01.05: Password Change**
As a logged-in user, I want to change my password so that I can maintain account security.

Acceptance Criteria:
- User must provide current password and new password
- New password must meet strength requirements
- Password is updated securely (hashed)
- Session remains active after password change

---

### Epic E-02: Host Onboarding

**US-02.01: Become a Host**
As a guest user, I want to activate host capabilities so that I can create listings on the platform.

Acceptance Criteria:
- User navigates to "Become a Host" or equivalent entry point
- User provides required host profile fields (phone number at minimum for MVP)
- User accepts host terms of service (checkbox acknowledgment)
- Upon completion, user gains host capabilities without losing guest capabilities
- Host dashboard becomes accessible in navigation

**US-02.02: Host Profile**
As a host, I want to manage my host-specific profile information so that guests can learn about me.

Acceptance Criteria:
- Host can add/edit a host bio and display name
- Host can add a profile photo if not already set
- Host profile information appears on their listing pages
- Host profile is separate from guest profile fields but linked to the same user

---

### Epic E-03: Listing Management

**US-03.01: Create Listing**
As a host, I want to create a new listing so that I can offer my property for booking.

Acceptance Criteria:
- Host fills in listing details: title, description, property type, location, guest capacity, bedrooms, bathrooms, beds
- Host sets a nightly base price and optional cleaning fee
- Host uploads at least one photo (up to 20 photos)
- Host selects applicable amenities from a predefined set
- Listing is saved in DRAFT status
- Host can save as draft and return later to continue editing
- Listing is owned by the creating host (ownership is immutable)

**US-03.02: Edit Listing**
As a host, I want to edit my listing details so that I can keep information accurate.

Acceptance Criteria:
- Host can edit all listing fields on their own listings only
- Changes to an approved listing trigger re-review (status moves to PENDING_REVIEW)
- Changes to a draft listing remain in DRAFT
- Edits are validated before saving
- Host cannot edit another host's listing

**US-03.03: Submit Listing for Review**
As a host, I want to submit my draft listing for platform review so that it can become publicly visible.

Acceptance Criteria:
- Only listings in DRAFT or REJECTED status can be submitted for review
- Listing must pass minimum completeness checks (title, description, at least 1 photo, price, location)
- Listing status changes to PENDING_REVIEW
- Host sees the current moderation status on their dashboard

**US-03.04: Manage Listing Photos**
As a host, I want to upload, reorder, and remove photos for my listing so that it looks attractive.

Acceptance Criteria:
- Host can upload multiple photos (JPEG, PNG, WebP; max 10MB each)
- Host can designate a primary/cover photo
- Host can reorder photos via drag or explicit ordering
- Host can delete photos
- At least one photo is required to submit for review
- Photos are stored with the listing and accessible publicly when listing is published

**US-03.05: Unpublish Listing**
As a host, I want to unpublish my listing so that it is no longer visible to guests.

Acceptance Criteria:
- Host can unpublish an APPROVED (published) listing
- Listing status changes to UNPUBLISHED
- Listing is no longer visible in search results or public pages
- Existing confirmed bookings remain unaffected
- Host can re-submit for review to publish again

**US-03.06: View My Listings**
As a host, I want to view all my listings and their statuses so that I can manage my inventory.

Acceptance Criteria:
- Host sees a list of all their listings with title, status, and key stats
- List can be filtered by status (draft, pending, approved, rejected, unpublished)
- Each listing links to edit and detail views
- Only the host's own listings are shown (ownership-scoped query)

---

### Epic E-04: Listing Moderation

**US-04.01: Review Pending Listings**
As an admin, I want to review listings submitted for review so that I can maintain platform quality.

Acceptance Criteria:
- Admin sees a queue of listings in PENDING_REVIEW status
- Admin can view full listing details including photos, description, amenities, and host info
- Admin can approve or reject the listing
- Rejection requires a reason (free text)
- Decision is recorded in the audit log

**US-04.02: Approve Listing**
As an admin, I want to approve a listing so that it becomes publicly visible.

Acceptance Criteria:
- Admin changes listing status from PENDING_REVIEW to APPROVED
- Listing becomes visible in search results and public pages
- Approval timestamp and admin ID are recorded
- Host can see that their listing is now approved

**US-04.03: Reject Listing**
As an admin, I want to reject a listing with a reason so that the host can improve it.

Acceptance Criteria:
- Admin changes listing status from PENDING_REVIEW to REJECTED
- Admin provides a rejection reason
- Rejection reason is visible to the host
- Host can edit and re-submit after addressing the issues
- Rejection is recorded in audit log

**US-04.04: Suspend Listing**
As an admin, I want to suspend an approved listing so that I can address policy violations.

Acceptance Criteria:
- Admin can suspend any APPROVED listing
- Suspended listings are not visible in search or public pages
- Existing confirmed bookings for suspended listings are flagged for admin review
- Suspension reason is recorded
- Host is notified of suspension (in MVP: visible in dashboard status)

---

### Epic E-05: Search & Discovery

**US-05.01: Search by Location**
As a visitor or guest, I want to search for listings by location so that I can find stays in my destination.

Acceptance Criteria:
- Search input accepts city, area, or country text
- Results are filtered to listings matching the location
- Only APPROVED listings appear in results
- No results state is handled gracefully

**US-05.02: Filter by Dates**
As a visitor, I want to filter listings by check-in and check-out dates so that I only see available listings.

Acceptance Criteria:
- Date range picker allows selecting check-in and check-out
- Results exclude listings that are fully blocked or booked for the selected range
- Date validation prevents past dates and check-out before check-in

**US-05.03: Filter by Guest Count**
As a visitor, I want to filter by number of guests so that I find listings that accommodate my group.

Acceptance Criteria:
- Guest count selector filters listings where maxGuests >= selected count

**US-05.04: Filter by Price Range**
As a visitor, I want to filter by price range so that I find listings within my budget.

Acceptance Criteria:
- Min and max price inputs filter based on base nightly rate
- Price display matches the listing's configured base nightly rate

**US-05.05: Filter by Amenities**
As a visitor, I want to filter by amenities so that I find listings with features I need.

Acceptance Criteria:
- Amenity filter shows available amenities as checkboxes
- Selecting amenities filters to listings that have ALL selected amenities
- Results update when filters change

**US-05.06: Filter by Property Type**
As a visitor, I want to filter by property type so that I find the kind of stay I prefer.

Acceptance Criteria:
- Property type filter allows selecting one or more types (apartment, house, villa, etc.)
- Results are filtered to matching types

**US-05.07: Search Results Page**
As a visitor, I want to see search results as a list of listing cards so that I can browse options.

Acceptance Criteria:
- Results show listing cards with cover photo, title, location, price, rating placeholder, and key stats
- Results are paginated or infinite-scrolled
- Results can be sorted (price low-to-high, price high-to-low)
- URL reflects search parameters (shareable/bookmarkable)
- Empty state shown when no results match

---

### Epic E-06: Listing Detail

**US-06.01: View Listing Detail Page**
As a visitor, I want to view a listing's full details so that I can decide whether to book.

Acceptance Criteria:
- Page shows title, description, all photos, amenities, location, property type, capacity, bedrooms/bathrooms/beds
- Page shows host name and profile photo
- Page shows nightly price and cleaning fee
- Page shows an availability calendar
- Page is accessible via a unique URL (slug-based)
- Only APPROVED listings are publicly accessible
- SEO metadata is set (title, description, Open Graph)

**US-06.02: Availability Calendar**
As a visitor, I want to see which dates are available so that I can plan my stay.

Acceptance Criteria:
- Calendar shows unavailable dates (blocked or booked) as disabled
- Calendar allows selecting check-in and check-out dates
- Selected date range feeds into the booking flow
- Calendar displays at least 2 months ahead

---

### Epic E-07: Booking Flow

**US-07.01: Request to Book**
As a guest, I want to request a booking for selected dates so that I can reserve a stay.

Acceptance Criteria:
- Guest must be authenticated to request a booking
- Guest selects check-in date, check-out date, and number of guests
- System checks availability: no overlapping confirmed bookings or blocks for the date range
- If available: booking is created with PENDING status
- If unavailable: error message with explanation
- Booking creates an availability hold to prevent double-booking of pending requests
- Booking summary shows dates, guest count, nightly rate, cleaning fee, total price
- Guest count must not exceed listing's max guests

**US-07.02: Booking Confirmation Page**
As a guest, I want to see a confirmation after submitting a booking request so that I know it was received.

Acceptance Criteria:
- After successful booking request, guest sees a confirmation page
- Confirmation shows booking reference, dates, property name, status (pending), and total
- Page links to "My Bookings" for tracking

**US-07.03: Prevent Double Booking**
As the system, bookings must not overlap for the same listing on the same dates.

Acceptance Criteria:
- Before creating a booking, the system checks for overlapping date ranges against: confirmed bookings, pending bookings (holds), and manual blocks
- Overlap check is performed in a database transaction to prevent race conditions
- If overlap detected, booking creation fails with a clear error
- This applies regardless of whether the overlap is from a booking or a manual block

**US-07.04: Price Calculation**
As a guest, I want to see a clear price breakdown before confirming my booking request.

Acceptance Criteria:
- Price breakdown shows: number of nights x nightly rate, cleaning fee, total
- Service fee placeholder shown as $0 or "waived" in MVP (ready for future implementation)
- Total is calculated server-side and stored on the booking record

---

### Epic E-08: Host Booking Management

**US-08.01: View Booking Requests**
As a host, I want to see booking requests for my listings so that I can manage reservations.

Acceptance Criteria:
- Host sees a list of bookings for their own listings only (ownership-scoped)
- List shows guest name, dates, listing name, status, and total
- List can be filtered by status (pending, confirmed, completed, cancelled)

**US-08.02: Confirm Booking**
As a host, I want to confirm a pending booking request so that the reservation is finalized.

Acceptance Criteria:
- Host can confirm bookings in PENDING status for their own listings only
- Booking status changes to CONFIRMED
- Availability hold is maintained (dates remain blocked)
- Action is recorded for audit

**US-08.03: Reject Booking**
As a host, I want to reject a pending booking request so that I can decline stays I cannot accommodate.

Acceptance Criteria:
- Host can reject bookings in PENDING status for their own listings only
- Booking status changes to REJECTED
- Availability hold is released (dates become available again)
- Host can optionally provide a reason
- Action is recorded for audit

**US-08.04: Cancel Confirmed Booking (Host)**
As a host, I want to cancel a confirmed booking when necessary so that I can handle emergencies.

Acceptance Criteria:
- Host can cancel bookings in CONFIRMED status for their own listings
- Booking status changes to CANCELLED_BY_HOST
- Availability hold is released
- Cancellation reason is required
- Action is recorded for audit
- This should be discouraged in UX (warning dialog)

---

### Epic E-09: Guest Booking Management

**US-09.01: View My Bookings**
As a guest, I want to see all my bookings so that I can track my reservations.

Acceptance Criteria:
- Guest sees a list of their own bookings
- List shows listing name, dates, status, and total
- Bookings are sorted by check-in date (upcoming first)
- Each booking links to a detail view

**US-09.02: Cancel Booking (Guest)**
As a guest, I want to cancel a booking so that I can change my plans.

Acceptance Criteria:
- Guest can cancel bookings in PENDING or CONFIRMED status
- Booking status changes to CANCELLED_BY_GUEST
- Availability hold is released
- Cancellation is recorded for audit
- Refund logic is deferred to Phase 2 (payment integration)

---

### Epic E-10: Availability Management

**US-10.01: Block Dates**
As a host, I want to block specific dates on my listing so that they are not available for booking.

Acceptance Criteria:
- Host selects a date range on a calendar for their own listing
- Selected dates are marked as manually blocked
- Blocked dates appear as unavailable to guests
- Host can optionally add a reason for the block
- Block prevents overlapping bookings from being created

**US-10.02: Unblock Dates**
As a host, I want to remove date blocks so that dates become available again.

Acceptance Criteria:
- Host can remove manual blocks they created
- Removing a block makes those dates available for booking again
- Blocks created by bookings (holds) cannot be manually removed -- they follow booking lifecycle

**US-10.03: View Availability Calendar**
As a host, I want to see a calendar view of my listing's availability so that I understand my schedule.

Acceptance Criteria:
- Calendar shows: available dates, manually blocked dates, booked dates (pending and confirmed)
- Different visual indicators for block types
- Calendar covers at least 3 months ahead
- Only the listing's own host can view the management calendar

---

### Epic E-11: Admin Operations

**US-11.01: Admin Dashboard**
As an admin, I want a dashboard overview so that I can monitor platform activity.

Acceptance Criteria:
- Dashboard shows key metrics: total users, total hosts, total listings by status, total bookings by status
- Dashboard shows recent activity (recent bookings, recent listing submissions)
- Dashboard is only accessible to admin users

**US-11.02: Manage Users**
As an admin, I want to view and manage user accounts so that I can maintain platform integrity.

Acceptance Criteria:
- Admin sees a list of all users with name, email, role/capabilities, registration date
- Admin can view user detail including their bookings (as guest) and listings (as host)
- Admin can deactivate a user account (soft disable, not delete)
- User management actions are recorded in audit log

**US-11.03: Manage Bookings (Admin)**
As an admin, I want to view and intervene in bookings so that I can resolve operational issues.

Acceptance Criteria:
- Admin sees all bookings across the platform
- Admin can filter by status, date range, listing, and guest
- Admin can cancel any booking (status changes to CANCELLED_BY_ADMIN)
- Admin cancellation requires a reason
- All admin booking actions are recorded in audit log

**US-11.04: Audit Log**
As an admin, I want to see an audit trail of important actions so that I can review platform activity.

Acceptance Criteria:
- Audit log records: listing moderation decisions, booking status changes by admin, user account changes by admin
- Each entry shows: timestamp, admin user, action type, affected entity, and details/reason
- Log is append-only and not editable
- Log is viewable in the admin area

---

## 4. MVP vs Later-Phase Separation

### Included in MVP (Phase 1)

- User registration, login, logout, profile management
- Host onboarding (become a host flow)
- Listing CRUD by hosts with photo upload
- Listing moderation by admin (approve, reject, suspend)
- Search and filter (location, dates, guests, price, amenities, property type)
- Listing detail page with availability calendar
- Request-to-book flow with availability checking and collision prevention
- Host booking management (confirm, reject, cancel)
- Guest booking management (view, cancel)
- Host availability management (block/unblock dates)
- Admin dashboard, user management, booking intervention
- Audit log for admin and moderation actions
- Role-based access control (guest, host, admin)
- Ownership-scoped host queries

### Deferred to Phase 2+

- Payment processing and payouts
- Host monetization (subscription, commission)
- Guest-host messaging
- Reviews and ratings
- Email/push notifications
- Wishlists / saved listings
- Map-based search
- Dynamic/seasonal pricing tools
- Calendar sync (iCal)
- Identity verification
- Dispute resolution
- Cancellation policy engine
- Multi-language support
- Advanced ranking and recommendations
- Support ticket system
