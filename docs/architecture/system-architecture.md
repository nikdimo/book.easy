# book.easy.mk — System Architecture

## 1. Architecture Overview

book.easy.mk (Book) is a two-sided property marketplace built as a modular monolith within a single Next.js application. The architecture prioritizes clean domain boundaries, ownership-scoped data access, and extensibility for future marketplace features, while avoiding premature complexity.

### Architecture Style: Modular Monolith

A single deployable application with strong internal module boundaries. This is chosen over microservices because:

- MVP has a single small team (or AI-assisted development)
- Cross-domain transactions (booking + availability) are simpler within one process
- Deployment, debugging, and local development are radically simpler
- Module boundaries in code can be extracted to services later if scale demands it

The key discipline is maintaining clean boundaries between modules in code even though they share a runtime.

### High-Level Architecture

```
                    ┌─────────────────────────────────────────────┐
                    │              Next.js Application             │
                    │                                             │
                    │  ┌──────────┐ ┌──────────┐ ┌────────────┐  │
                    │  │ (public) │ │ (account)│ │   /admin    │  │
                    │  │  routes  │ │  routes  │ │   routes    │  │
                    │  └────┬─────┘ └────┬─────┘ └─────┬──────┘  │
                    │       │            │             │          │
                    │  ┌────┴────────────┴─────────────┴──────┐  │
                    │  │         Server Actions Layer          │  │
                    │  │    (auth checks, validation, dispatch)│  │
                    │  └────┬──────────────────────────┬──────┘  │
                    │       │                          │          │
                    │  ┌────┴──────────┐  ┌───────────┴───────┐  │
                    │  │  Service Layer │  │  Validation Layer │  │
                    │  │  (business    │  │  (Zod schemas,    │  │
                    │  │   logic)      │  │   shared client   │  │
                    │  └────┬──────────┘  │   + server)       │  │
                    │       │             └───────────────────┘  │
                    │  ┌────┴──────────┐                         │
                    │  │  Data Access  │                         │
                    │  │  (Prisma,     │                         │
                    │  │   queries)    │                         │
                    │  └────┬──────────┘                         │
                    │       │                                     │
                    └───────┼─────────────────────────────────────┘
                            │
                    ┌───────┴──────────┐
                    │   PostgreSQL     │
                    └──────────────────┘
```

### Request Flow

1. **Route/Page** (React Server Component or Client Component) calls a Server Action or fetches data via a server-side function
2. **Server Action** performs authentication check, parses/validates input with Zod, and delegates to a service
3. **Service** executes business logic, enforces authorization rules (ownership, role), and calls data access functions
4. **Data Access** executes Prisma queries within transactions where needed
5. **Response** flows back through the stack to the UI

---

## 2. Module Boundaries

The application is organized into domain modules. Each module owns its service logic, validation schemas, and server actions. Modules communicate through well-defined service interfaces, not direct database queries across boundaries.

### Core Modules

| Module | Responsibility | Key Entities |
|--------|---------------|--------------|
| **auth** | Authentication, session management | Session, credentials |
| **user** | User accounts, profiles, host onboarding | User, Profile |
| **listing** | Listing CRUD, photos, amenities, moderation | Listing, ListingImage, Amenity, ListingAmenity |
| **property** | Physical property records (future: multi-unit) | Property |
| **availability** | Date blocking, availability queries | AvailabilityBlock |
| **booking** | Booking lifecycle, pricing calculation | Booking |
| **search** | Search queries, filtering, discovery | (reads from listing + availability) |
| **admin** | Admin operations, moderation, audit | AuditLog |
| **storage** | File upload abstraction | (infrastructure) |
| **email** | Transactional email abstraction | (infrastructure) |

### Module Communication Rules

- Modules call each other's service functions, never each other's data access layer directly
- The **booking** module calls **availability** to check and create holds
- The **search** module reads listing and availability data (read-only cross-module access is acceptable)
- The **admin** module calls other modules' services with elevated permissions
- No circular dependencies between modules

---

## 3. Domain Model

### 3.1 Core Entities

#### User
The central identity entity. A user can have guest capabilities (default), host capabilities (activated), and admin privileges (assigned).

```
User
├── id: UUID (PK)
├── email: string (unique)
├── passwordHash: string
├── name: string
├── role: enum [USER, ADMIN]
├── isHost: boolean (default false)
├── isActive: boolean (default true)
├── emailVerified: datetime? (nullable, for future use)
├── createdAt: datetime
└── updatedAt: datetime
```

**Design decision**: `role` handles the admin/non-admin axis. `isHost` handles the host capability axis. This avoids a complex role hierarchy while supporting the reality that a user can be both a guest and a host simultaneously. Admin is kept as a role enum because admin privileges are fundamentally different from marketplace participant capabilities.

#### Profile
Extended user information, separated from auth-critical User fields.

```
Profile
├── id: UUID (PK)
├── userId: UUID (FK -> User, unique)
├── phone: string?
├── bio: text?
├── avatarUrl: string?
├── hostBio: text? (displayed on listings when user is host)
├── hostDisplayName: string?
├── createdAt: datetime
└── updatedAt: datetime
```

#### Property
Represents a physical property. In MVP, there is a 1:1 relationship between Property and Listing. The separation exists to support future multi-unit scenarios where one physical property has multiple bookable units/listings.

```
Property
├── id: UUID (PK)
├── ownerId: UUID (FK -> User)
├── name: string (internal reference name)
├── propertyType: enum [APARTMENT, HOUSE, VILLA, STUDIO, CABIN, COTTAGE, LOFT, OTHER]
├── address: string
├── city: string
├── area: string? (neighborhood/district)
├── country: string
├── postalCode: string?
├── latitude: float?
├── longitude: float?
├── createdAt: datetime
└── updatedAt: datetime
```

#### Listing
The public-facing bookable unit. Owned by a host. Subject to moderation.

```
Listing
├── id: UUID (PK)
├── propertyId: UUID (FK -> Property)
├── hostId: UUID (FK -> User)
├── title: string
├── slug: string (unique, URL-friendly)
├── description: text
├── status: enum [DRAFT, PENDING_REVIEW, APPROVED, REJECTED, UNPUBLISHED, SUSPENDED, ARCHIVED]
├── maxGuests: int
├── bedrooms: int
├── bathrooms: int
├── beds: int
├── moderationNote: text? (admin rejection/suspension reason)
├── approvedAt: datetime?
├── publishedAt: datetime?
├── createdAt: datetime
└── updatedAt: datetime
```

**Design decision -- Property vs Listing**: These are separated because:
- A property is a physical asset; a listing is a bookable representation
- Future: one property may have multiple listings (e.g., "Entire villa" + "Villa - Room 1")
- Moderation applies to listings, not properties
- Listing lifecycle (draft -> approved -> archived) is independent of the physical property

In MVP, a host creates a property and a listing together in a single form flow. The separation is transparent to the user but enforced in the data model.

#### ListingImage

```
ListingImage
├── id: UUID (PK)
├── listingId: UUID (FK -> Listing)
├── url: string
├── alt: string?
├── displayOrder: int
├── isPrimary: boolean (default false)
├── createdAt: datetime
└── updatedAt: datetime
```

#### Amenity

```
Amenity
├── id: UUID (PK)
├── name: string (unique)
├── category: string (e.g., "Essentials", "Features", "Safety")
├── icon: string? (icon identifier for UI)
└── createdAt: datetime
```

#### ListingAmenity (join table)

```
ListingAmenity
├── listingId: UUID (FK -> Listing)
├── amenityId: UUID (FK -> Amenity)
└── (composite PK: listingId + amenityId)
```

#### PricingRule

```
PricingRule
├── id: UUID (PK)
├── listingId: UUID (FK -> Listing, unique in MVP)
├── baseNightlyRate: decimal
├── cleaningFee: decimal (default 0)
├── serviceFeePercent: decimal (default 0, platform fee placeholder)
├── currency: string (default "EUR")
├── minNights: int (default 1)
├── maxNights: int (default 365)
├── createdAt: datetime
└── updatedAt: datetime
```

**Design decision**: 1:1 with Listing in MVP. The model supports evolution to 1:many for seasonal pricing by adding date range fields later. Currency is stored per-rule even though MVP uses a single currency, to avoid a painful migration later.

#### AvailabilityBlock

```
AvailabilityBlock
├── id: UUID (PK)
├── listingId: UUID (FK -> Listing)
├── startDate: date
├── endDate: date
├── blockType: enum [MANUAL_BLOCK, BOOKING_HOLD]
├── bookingId: UUID? (FK -> Booking, set when blockType is BOOKING_HOLD)
├── reason: string?
├── createdAt: datetime
└── updatedAt: datetime
```

**Design decision**: All unavailability is stored in a single table regardless of source. This simplifies the overlap check to a single query against one table. When a booking is created, a BOOKING_HOLD block is created in the same transaction. When a booking is cancelled, the hold is released.

#### Booking

```
Booking
├── id: UUID (PK)
├── listingId: UUID (FK -> Listing)
├── guestId: UUID (FK -> User)
├── checkIn: date
├── checkOut: date
├── guestCount: int
├── nightlyRate: decimal (snapshot at booking time)
├── cleaningFee: decimal (snapshot)
├── serviceFee: decimal (snapshot)
├── totalPrice: decimal
├── numberOfNights: int
├── status: enum [PENDING, CONFIRMED, REJECTED, CANCELLED_BY_GUEST, CANCELLED_BY_HOST, CANCELLED_BY_ADMIN, COMPLETED]
├── guestNote: text? (message from guest)
├── hostNote: text? (host response note)
├── cancellationReason: text?
├── createdAt: datetime
└── updatedAt: datetime
```

**Design decision -- Price snapshotting**: Nightly rate, cleaning fee, and service fee are snapshotted at booking creation time. This means price changes to the listing do not retroactively affect existing bookings. This is critical for financial integrity.

#### AuditLog

```
AuditLog
├── id: UUID (PK)
├── userId: UUID (FK -> User)
├── action: string (e.g., "listing.approve", "booking.cancel_by_admin")
├── entityType: string (e.g., "Listing", "Booking", "User")
├── entityId: UUID
├── metadata: JSON (before/after state, reason, etc.)
├── ipAddress: string?
├── createdAt: datetime
```

**Design decision**: Append-only. No update or delete operations on audit records. The metadata JSON allows flexible storage of context without schema changes for each new auditable action.

### 3.2 Entity Relationship Summary

```
User (1) ──── (0..1) Profile
User (1) ──── (0..*) Property          [as owner]
User (1) ──── (0..*) Listing           [as host]
User (1) ──── (0..*) Booking           [as guest]
User (1) ──── (0..*) AuditLog          [as actor]

Property (1) ──── (0..*) Listing       [1:1 in MVP, 1:many future]

Listing (1) ──── (0..*) ListingImage
Listing (1) ──── (0..*) ListingAmenity
Listing (1) ──── (0..1) PricingRule     [1:1 in MVP, 1:many future]
Listing (1) ──── (0..*) AvailabilityBlock
Listing (1) ──── (0..*) Booking

Amenity (1) ──── (0..*) ListingAmenity

Booking (1) ──── (0..1) AvailabilityBlock [booking hold]
```

---

## 4. Database Approach

### Database: PostgreSQL

Chosen for:
- Strong transactional support (critical for booking collision prevention)
- Excellent date/range query support
- JSON column support for flexible metadata (audit logs)
- Mature ecosystem with Prisma ORM
- Can scale vertically well past MVP traffic levels

### ORM: Prisma

Chosen for:
- Type-safe database client generated from schema
- Excellent migration tooling
- Transaction support
- Good developer experience with TypeScript

### Indexing Strategy

Key indexes for MVP performance:

- `Listing.slug` -- unique index for URL lookups
- `Listing.status` -- partial index for `WHERE status = 'APPROVED'` queries (search)
- `Listing.hostId` -- for ownership-scoped host dashboard queries
- `Listing.city, Listing.status` -- composite for location search
- `AvailabilityBlock.listingId, startDate, endDate` -- composite for overlap queries
- `Booking.listingId, status` -- for listing-scoped booking queries
- `Booking.guestId` -- for guest booking history
- `AuditLog.entityType, entityId` -- for entity-specific audit trail lookups
- `AuditLog.createdAt` -- for chronological browsing

### Transaction Strategy

The critical transaction in the system is booking creation:

```
BEGIN TRANSACTION (serializable or with advisory lock)
  1. Check for overlapping AvailabilityBlocks on listing for date range
  2. Check for overlapping Bookings (PENDING or CONFIRMED) for date range
  3. If no overlap: create Booking + create AvailabilityBlock (BOOKING_HOLD)
  4. If overlap: abort with conflict error
COMMIT
```

Prisma's `$transaction` with interactive transactions is used for this. For MVP traffic, this is sufficient. At scale, row-level advisory locks on the listing ID can prevent serialization failures.

---

## 5. Authentication & Authorization

### Authentication: Auth.js v5 (NextAuth)

- Credentials provider for email/password (MVP)
- Bcrypt for password hashing
- JWT-based sessions (stateless, simpler to scale)
- Session includes: userId, role, isHost
- Future: add OAuth providers (Google, Facebook) with zero architecture change

### Authorization Model

Authorization is enforced at the **server action layer** before any business logic executes.

Three levels of authorization checks:

1. **Authentication**: Is the user logged in? (required for all mutations and protected reads)
2. **Role/Capability**: Does the user have the required role or capability? (admin for moderation, isHost for listing management)
3. **Ownership**: Does the user own the resource they're trying to access/modify? (host can only edit their own listings, guest can only cancel their own bookings)

```
┌─────────────────────────────────────────────────┐
│                Server Action                     │
│                                                 │
│  1. getSession() → is user authenticated?       │
│  2. checkRole(session, requiredRole)            │
│  3. checkOwnership(session.userId, resource)    │
│  4. → proceed to service layer                  │
│                                                 │
│  Any failure → return unauthorized error         │
└─────────────────────────────────────────────────┘
```

### Middleware

Next.js middleware handles route-level protection:

- `/admin/*` routes: require authenticated user with ADMIN role
- `/account/*` routes: require authenticated user
- `/host/*` routes: require authenticated user with isHost=true
- Public routes: no authentication required
- API routes: authenticated per-route as needed

**Ownership checks cannot be done in middleware** (they require database lookups). These are always enforced in server actions/services.

---

## 6. File & Image Handling

### Strategy: Abstraction Layer with Local Storage for MVP

```
StorageAdapter (interface)
├── upload(file, path) → url
├── delete(path) → void
└── getUrl(path) → string

LocalStorageAdapter implements StorageAdapter
  → stores files in /public/uploads/ (or a configurable local directory)
  → returns URL paths relative to the app

S3StorageAdapter implements StorageAdapter (Phase 2)
  → stores files in S3-compatible bucket
  → returns signed URLs or CDN URLs
```

### MVP Implementation

- Files stored on local disk under `/uploads/` directory
- Served via Next.js static file serving or a custom route handler
- Image resizing/optimization deferred to Phase 2 (use Next.js `<Image>` component for client-side optimization)
- Max file size: 10MB per image
- Accepted formats: JPEG, PNG, WebP
- Max images per listing: 20

### Migration Path

When moving to S3:
1. Implement `S3StorageAdapter`
2. Switch the adapter in configuration
3. Migrate existing files with a script
4. No application code changes needed outside the adapter

---

## 7. Search & Filtering Strategy

### MVP: PostgreSQL-Based Search

For MVP traffic, PostgreSQL can handle search efficiently with proper indexing.

#### Search Query Construction

The search service builds a Prisma query dynamically based on provided filters:

```
Base query: Listing WHERE status = 'APPROVED'

+ location filter: AND (city ILIKE '%query%' OR area ILIKE '%query%' OR country ILIKE '%query%')
+ guest count: AND maxGuests >= guestCount
+ price range: AND PricingRule.baseNightlyRate BETWEEN min AND max
+ property type: AND Property.propertyType IN [selected types]
+ amenities: AND listing has ALL selected amenities (subquery)
+ date range: AND no overlapping AvailabilityBlock exists for the date range (NOT EXISTS subquery)
```

#### Date Availability Filter

```sql
-- Exclude listings that have ANY overlapping block in the requested range
WHERE NOT EXISTS (
  SELECT 1 FROM AvailabilityBlock ab
  WHERE ab.listingId = Listing.id
    AND ab.startDate < :checkOut
    AND ab.endDate > :checkIn
)
```

### Future Expansion

The search module is isolated behind a service interface. When traffic or feature complexity grows:
- Phase 2: Add PostgreSQL full-text search for keyword search
- Phase 3: Add Meilisearch or Elasticsearch for ranking, typo tolerance, geo-search
- The service interface remains the same; only the implementation changes

---

## 8. Availability & Booking Logic

### Availability Model

All unavailability is represented in the `AvailabilityBlock` table:

| Block Type | Created By | Released When |
|-----------|-----------|---------------|
| MANUAL_BLOCK | Host or Admin | Host/admin removes it |
| BOOKING_HOLD | System (on booking creation) | Booking is cancelled or rejected |

### Booking Lifecycle

```
Guest requests booking
       │
       ▼
   [PENDING] ─── availability hold created
       │
       ├── Host confirms ──► [CONFIRMED] ─── hold maintained
       │                          │
       │                          ├── Guest cancels ──► [CANCELLED_BY_GUEST] ─── hold released
       │                          ├── Host cancels ──► [CANCELLED_BY_HOST] ─── hold released
       │                          ├── Admin cancels ──► [CANCELLED_BY_ADMIN] ─── hold released
       │                          └── Check-out passes ──► [COMPLETED] ─── hold released
       │
       ├── Host rejects ──► [REJECTED] ─── hold released
       │
       ├── Guest cancels ──► [CANCELLED_BY_GUEST] ─── hold released
       │
       └── Admin cancels ──► [CANCELLED_BY_ADMIN] ─── hold released
```

### Key Rules

1. **Pending bookings block availability** -- this prevents double-booking while a host is deciding
2. **Only one active booking per date range per listing** -- enforced at creation time via transaction
3. **Cancellation always releases the hold** -- regardless of who cancels
4. **Completed bookings** -- hold is released because the dates are in the past (no longer relevant for availability)
5. **Admin can override** -- admin can cancel any booking regardless of status

### Future Compatibility

The availability model supports future additions without schema changes:
- **Min/max stay**: Add validation in the booking service (check PricingRule.minNights/maxNights)
- **Preparation buffer**: Add buffer days to the block when creating a BOOKING_HOLD
- **Check-in/check-out times**: Add time fields to AvailabilityBlock; current date-only model is a subset
- **Calendar sync**: External blocks become MANUAL_BLOCK entries with a source field (add column later)
- **Instant book**: Add a toggle on Listing; if enabled, booking is created as CONFIRMED directly

---

## 9. Listing Moderation Flow

### Lifecycle

```
Host creates listing
       │
       ▼
    [DRAFT] ─── host can edit freely
       │
       ├── Host submits for review
       ▼
 [PENDING_REVIEW] ─── host can still edit (returns to PENDING_REVIEW)
       │
       ├── Admin approves ──► [APPROVED] ─── publicly visible
       │                          │
       │                          ├── Host unpublishes ──► [UNPUBLISHED] ─── not visible
       │                          │                             │
       │                          │                             └── Host re-submits ──► [PENDING_REVIEW]
       │                          │
       │                          └── Admin suspends ──► [SUSPENDED] ─── not visible, needs admin action
       │
       └── Admin rejects ──► [REJECTED] ─── host sees reason, can edit and re-submit
                                  │
                                  └── Host edits and re-submits ──► [PENDING_REVIEW]
```

### Visibility Rules

- **Public search results**: Only APPROVED listings
- **Listing detail page (public URL)**: Only APPROVED listings (others return 404)
- **Host dashboard**: Host sees all their own listings in any status
- **Admin panel**: Admin sees all listings in any status

### Moderation Audit

Every moderation action creates an AuditLog entry:
- `listing.submit_for_review` -- host submits
- `listing.approve` -- admin approves (includes admin userId)
- `listing.reject` -- admin rejects (includes reason)
- `listing.suspend` -- admin suspends (includes reason)

---

## 10. Security

### Authentication Security
- Passwords hashed with Bcrypt (cost factor 12)
- JWT sessions with short expiry (1 day) and refresh
- Generic error messages for login failures (prevent email enumeration)
- Rate limiting on auth endpoints (deferred to Phase 2, but architecture supports it)

### Authorization Security
- All mutations require server-side authentication check
- All resource access requires ownership or role verification
- No client-side-only authorization checks
- Admin routes protected by middleware AND server action checks (defense in depth)
- Host queries always include `WHERE hostId = session.userId`

### Data Security
- No secrets in client bundles (all sensitive logic in server actions/API routes)
- Environment variables for all configuration (database URL, auth secret, etc.)
- Input validation with Zod on every server action
- SQL injection prevented by Prisma's parameterized queries
- XSS prevented by React's default escaping + Content Security Policy headers
- CSRF protected by Next.js server actions (built-in token validation)

### Data Integrity
- Foreign key constraints on all relationships
- Unique constraints on email, slug, and composite keys
- Soft deletes for listings with booking history (status = ARCHIVED)
- Users are deactivated, not deleted (isActive flag)
- Audit log is append-only

---

## 11. Data Lifecycle & Soft Delete Policy

### Soft Delete Entities

| Entity | Soft Delete Method | Can Hard Delete? |
|--------|-------------------|-----------------|
| User | `isActive = false` | Never (has bookings, audit trail) |
| Listing | `status = ARCHIVED` | Only if zero bookings ever existed |
| Property | No delete in MVP | Only if no listings reference it |
| Booking | Never deleted | Never (financial/operational record) |
| AuditLog | Never deleted | Never (compliance requirement) |
| ListingImage | Hard delete OK | Yes (no downstream references) |
| AvailabilityBlock | Hard delete on release | Yes (transient operational data) |

### Archive Rules

- A listing with any booking history (even cancelled) must use ARCHIVED status, not hard delete
- Archived listings are not visible publicly but remain queryable by admin and in booking history
- An archived listing's detail page shows "No longer available" to direct URL visitors
- User accounts are deactivated, not deleted. Deactivated users cannot log in but their data remains for booking history integrity.

---

## 12. Scalability Approach

### MVP Scale Target

- Dozens of hosts, hundreds of listings, thousands of bookings per month
- Single PostgreSQL instance, single application server
- This architecture comfortably handles this with no special optimization

### Growth Path

| Concern | MVP Solution | Scale Solution |
|---------|-------------|----------------|
| Database | Single PostgreSQL | Read replicas, then sharding if needed |
| Search | PostgreSQL queries | Meilisearch/Elasticsearch |
| File storage | Local disk | S3 + CDN |
| Caching | None (Prisma query cache) | Redis for sessions, search cache |
| Background jobs | None (inline) | Bull/BullMQ with Redis |
| Email | Inline sending | Queue-based sending |
| Rate limiting | None | Redis-based rate limiter middleware |
| Monitoring | Console logs | Structured logging + Sentry + metrics |

### Module Extraction Path

If the application grows beyond what a monolith can serve:

1. **Search service** -- first to extract (stateless, read-heavy)
2. **Notification service** -- second (event-driven, async)
3. **Payment service** -- third (isolated compliance requirements)
4. **Core booking/availability** -- last to extract (tightest coupling)

---

## 13. Monetization Architecture

### MVP: No Payment Processing

Payment processing is explicitly excluded from MVP. The platform operates as a request-to-book system where payment happens outside the platform (cash, bank transfer, etc.).

### Future Monetization Models (Architecture-Ready)

The domain model supports these without structural changes:

1. **Commission on bookings**: Add `platformFee` field to Booking. Calculate at booking creation. Requires payment integration.
2. **Host subscription**: Add `Subscription` entity linked to User. Gate listing creation/count based on subscription status.
3. **Per-listing fee**: Add `listingFee` field. Gate listing activation on payment.
4. **Hybrid**: Combine subscription + commission.

### Recommended Phase 2 Approach

Commission-based monetization (percentage of booking total) is recommended because:
- Aligns platform incentives with host success
- No upfront cost barrier for hosts (encourages supply growth)
- Standard marketplace model with well-understood patterns
- Requires only: Stripe Connect integration, payout logic, fee calculation in booking service

The Booking entity already stores `serviceFee` and `totalPrice` which will hold the platform's commission.

---

## 14. Tradeoffs

| Decision | Tradeoff | Rationale |
|----------|----------|-----------|
| Modular monolith over microservices | Limits independent scaling | Simplicity for MVP; module boundaries allow extraction later |
| Property + Listing separation | Extra join in queries, slightly more complex forms | Future-proofs for multi-unit; the join cost is negligible |
| Request-to-book over instant book | Slower booking experience for guests | Gives hosts control; safer for MVP; instant book is additive later |
| JWT sessions over database sessions | No server-side session revocation | Simpler, stateless; add Redis sessions if revocation needed |
| Local file storage over S3 | Files lost if server is replaced | Acceptable for MVP; abstraction layer enables S3 migration |
| PostgreSQL search over Elasticsearch | Limited relevance ranking | Sufficient for MVP query volume; service boundary allows swap |
| Pending bookings block dates | Hosts can't receive multiple competing requests | Prevents double-booking simply; add request queue model later if needed |
| Single currency in MVP | Limits international appeal | Avoids currency conversion complexity; currency field exists for future use |

---

## 15. Future Expansion Path

### Phase 2 Additions (Architecture Impact: Low)
- Payment integration (Stripe) -- adds payment entities, affects booking service
- Reviews -- new Review entity, affects listing detail and search ranking
- Messaging -- new Message/Conversation entities, may need WebSocket
- Email notifications -- implement email templates, trigger from services

### Phase 3 Additions (Architecture Impact: Medium)
- Calendar sync (iCal) -- adds external block source to AvailabilityBlock
- Dynamic pricing -- extends PricingRule to date-range-based rules
- Map search -- may require PostGIS or external search service
- Host analytics -- read-heavy dashboard, may need materialized views

### No-Go Without Redesign
The current architecture would need significant work for:
- Multi-region deployment (database sharding, CDN routing)
- Real-time features beyond basic (collaborative editing, live availability updates)
- Marketplace with millions of listings (search infrastructure, caching strategy)

These are not MVP concerns and represent natural growth points where investment is justified by scale.
