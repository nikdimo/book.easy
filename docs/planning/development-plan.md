# BookEasy.mk -- Development Plan

## Overview

This document outlines the phased development plan for BookEasy.mk, a two-sided property marketplace. The plan is structured to deliver a launchable MVP in Phase 1, then expand toward full marketplace functionality in subsequent phases.

---

## Phase 1: Marketplace MVP

**Goal**: A functional, launchable two-sided marketplace where guests can discover and book properties, hosts can list and manage their properties, and admins can moderate and operate the platform.

**Estimated Duration**: 4-6 weeks for a focused solo developer or small team.

### Phase 1 Deliverables

#### 1.1 Foundation (Week 1)

| Item | Details |
|------|---------|
| Project scaffold | Next.js 15, TypeScript, Tailwind CSS, shadcn/ui |
| Database schema | Prisma schema with all Phase 1 entities, migrations |
| Auth system | Auth.js v5 with credentials provider, JWT sessions |
| Middleware | Route protection for admin, account, and host routes |
| Seed data | Sample users (guest, host, admin), properties, listings, amenities, bookings |
| Environment config | .env.example with all required variables |
| Folder structure | Full modular structure as defined in architecture doc |

#### 1.2 Public Website (Week 2)

| Item | Details |
|------|---------|
| Layout | Header with navigation (logo, search, auth buttons), footer |
| Homepage | Hero section, search bar, featured listings grid |
| Search results | Listing cards with cover photo, title, location, price, key stats |
| Search filters | Location, date range, guest count, price range, amenities, property type |
| Listing detail | Full details, photo gallery, amenities, calendar, booking widget, host info |
| Auth pages | Login, register, with form validation |
| Responsive design | Mobile-first, works on phone/tablet/desktop |
| SEO | Page titles, meta descriptions, Open Graph tags |

#### 1.3 Booking Flow (Week 3)

| Item | Details |
|------|---------|
| Date selection | Calendar-based check-in/check-out picker on listing detail |
| Guest count | Selector with max guest validation |
| Availability check | Server-side overlap detection against blocks and bookings |
| Price calculation | Nightly rate x nights + cleaning fee, displayed as breakdown |
| Booking creation | Transactional creation of Booking + AvailabilityBlock hold |
| Collision prevention | Database transaction prevents double-booking |
| Confirmation page | Booking reference, summary, status, next steps |
| My Bookings | Guest view of all their bookings with status |
| Guest cancellation | Cancel pending or confirmed bookings |

#### 1.4 Host Experience (Week 3-4)

| Item | Details |
|------|---------|
| Become a Host | Onboarding flow to activate host capabilities |
| Host dashboard | Overview of listings and booking requests |
| Create listing | Multi-step form: details, location, amenities, photos, pricing |
| Edit listing | Edit all listing fields, manage photos |
| Submit for review | Submit draft listing for admin moderation |
| Listing status | Host sees moderation status on each listing |
| Booking management | View, confirm, reject booking requests for own listings |
| Availability management | Block/unblock dates on a calendar per listing |

#### 1.5 Admin Area (Week 4-5)

| Item | Details |
|------|---------|
| Admin layout | Sidebar navigation, admin-only access |
| Dashboard | Platform stats: users, hosts, listings by status, bookings by status |
| Listing moderation | Queue of pending listings, approve/reject with reasons |
| Listing suspension | Suspend approved listings |
| User management | View users, view their listings/bookings, deactivate accounts |
| Booking management | View all bookings, admin cancel with reason |
| Audit log | View log of moderation and admin actions |

#### 1.6 Polish (Week 5-6)

| Item | Details |
|------|---------|
| Loading states | Skeleton loaders, Suspense boundaries |
| Empty states | All list views handle zero results gracefully |
| Error handling | Error boundaries, 404/500 pages, form error display |
| Validation | Client + server validation on all forms |
| Responsive pass | Final mobile/tablet testing and fixes |
| README | Setup instructions, environment variables, seed data usage |

### Phase 1 Dependencies

```
Foundation ──► Public Website ──► Booking Flow
    │                                  │
    └──► Host Experience ──────────────┤
                                       │
                              Admin Area ◄──┘
                                  │
                              Polish ◄──┘
```

- Public website depends on foundation (schema, auth, layout)
- Booking flow depends on public website (listing detail page) and foundation (availability model)
- Host experience depends on foundation (auth, schema) and runs parallel to public website
- Admin area depends on listing/booking features existing to moderate/manage
- Polish runs last after features are stable

### Phase 1 Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Booking race conditions | Double-booked dates | Use database transactions with overlap checks; test concurrency |
| Complex form state | Poor host experience for listing creation | Break into manageable steps; save draft frequently |
| Image upload reliability | Lost uploads, broken listing photos | Validate before upload; show upload progress; store confirmations |
| Auth edge cases | Session expiry during booking flow | Handle auth errors gracefully; redirect to login with return URL |
| Search performance | Slow results with many filters | Index key columns; profile queries early; keep filter logic in SQL |

---

## Phase 2: Marketplace Growth

**Goal**: Add trust, monetization, and communication features that enable the marketplace to function as a real commercial platform.

**Prerequisites**: Phase 1 complete and stable.

### Phase 2 Features

#### 2.1 Payment Integration
- Integrate Stripe Connect for marketplace payments
- Guest pays at booking confirmation
- Platform collects commission (serviceFee)
- Host receives payout after guest check-in (or configurable delay)
- Refund logic for cancellations based on policy
- Payment status tracking on bookings

**Dependency**: Stripe account, legal/compliance review for payment processing

#### 2.2 Reviews & Ratings
- Guests leave reviews after check-out (rating + text)
- Hosts can respond to reviews
- Reviews visible on listing detail pages
- Average rating displayed on listing cards
- Review moderation by admin
- Review window: 14 days after check-out

**Dependency**: Booking lifecycle must reliably mark bookings as COMPLETED

#### 2.3 Messaging
- In-platform messaging between guest and host
- Conversation per booking or per listing inquiry
- Message history preserved
- Notification triggers for new messages
- Admin can view conversations for moderation purposes

**Dependency**: Notification system (at least email)

#### 2.4 Notifications
- Email notifications for key events:
  - New booking request (to host)
  - Booking confirmed/rejected (to guest)
  - Listing approved/rejected (to host)
  - New message received
  - Booking reminder (upcoming check-in)
- In-app notification center (bell icon with unread count)
- Notification preferences (which emails to receive)

**Dependency**: Email provider integration (Resend, SendGrid, or SMTP)

#### 2.5 Cancellation Policies
- Define cancellation policy templates (flexible, moderate, strict)
- Host selects a policy per listing
- Policy determines refund amount based on cancellation timing
- Policy snapshot stored on booking at creation time
- Clear display of policy to guests before booking

**Dependency**: Payment integration (refunds depend on payment)

#### 2.6 Wishlists
- Guests can save listings to wishlists
- Multiple named wishlists per user
- Wishlist accessible from account area
- Heart icon on listing cards and detail pages

**Dependency**: None (can be built independently)

### Phase 2 Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Payment compliance | Legal/regulatory requirements | Use Stripe Connect which handles most compliance |
| Review manipulation | Fake or unfair reviews | Verify reviewer had a completed booking; admin moderation |
| Messaging abuse | Spam, inappropriate content | Rate limiting; reporting mechanism; admin moderation |
| Notification volume | Email fatigue, deliverability | User preferences; batch notifications; use reputable email provider |

---

## Phase 3: Platform Maturity

**Goal**: Advanced features that differentiate the platform and improve efficiency for power users.

### Phase 3 Features

#### 3.1 Calendar Sync
- Import external calendars (iCal format) to block dates
- Export BookEasy calendar for use in other platforms
- Periodic sync to keep availability current
- Support for multi-platform hosts

#### 3.2 Dynamic Pricing
- Seasonal pricing rules (date range -> price override)
- Weekend pricing differential
- Pricing suggestions based on demand (future: ML-based)
- Bulk pricing tools for hosts

#### 3.3 Advanced Search
- Map-based browsing with property pins
- Geo-search (listings near a point/area)
- Search ranking based on relevance, reviews, and recency
- Autocomplete for location search
- Type-ahead suggestions

#### 3.4 Host Analytics
- Booking statistics (occupancy rate, revenue, average stay length)
- Calendar heatmap (popular dates)
- Guest demographics summary
- Comparison to platform averages

#### 3.5 Identity Verification
- Government ID upload for hosts
- Phone number verification
- Email verification enforcement
- Verified badge on profiles

#### 3.6 Support Tooling
- Internal ticket system for user issues
- Admin case management
- Dispute resolution workflow
- Template responses for common issues

### Phase 3 Dependencies

- Calendar sync requires stable availability model (Phase 1)
- Dynamic pricing requires PricingRule model extension
- Advanced search may require Meilisearch/PostGIS
- Host analytics requires sufficient booking data
- Identity verification requires file storage (Phase 1) + external service
- Support tooling requires messaging foundation (Phase 2)

---

## Phase 4: Scale & Optimize

**Goal**: Performance, internationalization, and operational efficiency at scale.

### Phase 4 Features

- Multi-language support (i18n)
- Multi-currency support with conversion
- Performance optimization (caching, CDN, query optimization)
- A/B testing infrastructure
- Automated listing quality scoring
- SEO optimization (structured data, sitemap, performance)
- Mobile app (React Native or PWA)
- API for third-party integrations

---

## Implementation Principles (All Phases)

1. **Ship incrementally** -- each feature should be usable on its own, not dependent on everything being done
2. **Test the critical path** -- booking creation and availability checks must be tested for correctness and concurrency
3. **Don't build what you don't need** -- resist adding future-phase features into current-phase work
4. **Keep module boundaries** -- even as features are added, maintain clean separation between modules
5. **Document decisions** -- when a non-obvious choice is made, record it with rationale
6. **Seed realistically** -- demo data should look like a real platform, not placeholder text
7. **Secure by default** -- every new feature must include server-side authorization checks
