# book.easy.mk (Book)

**book.easy.mk** is the stays & bookings product in the **easy.mk** family of SaaS tools. Guests discover and book, hosts manage listings, admins operate the platform.

## Tech Stack

- **Framework**: Next.js 16 (App Router, Server Components, Server Actions)
- **Language**: TypeScript
- **UI**: React 19, Tailwind CSS v4, shadcn/ui (Radix Nova)
- **Database**: PostgreSQL via Prisma 7
- **Auth**: Auth.js v5 (Google + email magic links, JWT sessions)
- **Validation**: Zod v4

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL (local instance or Docker)

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env` with your database URL and a random auth secret:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/bookeasy?schema=public"
AUTH_SECRET="your-random-secret-here"
AUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_APP_NAME="book.easy.mk"
```

Generate a secret: `openssl rand -base64 32`

### 3. Set up the database

```bash
npx prisma generate
npx prisma migrate deploy
```

### 4. Seed demo data

```bash
npx prisma db seed
```

### 5. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Test Accounts

Sign in with Google or request an email magic link for the account email.

| Role | Email | Capabilities |
|------|-------|-------------|
| Admin | dimovski.niko@outlook.com | Full platform access |
| Host | elena@example.com | Host dashboard, listing management |
| Host | marko@example.com | Host dashboard, listing management |
| Guest | guest@example.com | Browse, book, manage bookings |
| Guest | traveler@example.com | Browse, book, manage bookings |

## Project Structure

```
src/
├── app/
│   ├── (public)/          # Guest-facing pages (homepage, search, listing detail)
│   ├── (auth)/            # Login, register
│   ├── (account)/         # User account (bookings, profile, become-host)
│   ├── (host)/host/       # Host dashboard (listings, bookings, availability)
│   ├── admin/             # Admin panel (moderation, users, bookings, audit)
│   └── api/               # API routes (auth, upload, host booking actions)
├── components/
│   ├── ui/                # shadcn/ui primitives
│   ├── public/            # PropertyCard, SearchFilters, BookingWidget, etc.
│   ├── host/              # ListingForm, AvailabilityManager, etc.
│   ├── admin/             # AdminListingActions, AdminUserActions, etc.
│   ├── account/           # ProfileForm, BecomeHostForm, etc.
│   ├── auth/              # LoginForm, RegisterForm
│   └── shared/            # Header, Footer, DateRangePicker, EmptyState
├── lib/
│   ├── actions/           # Server actions (auth, booking, listing, admin, etc.)
│   ├── services/          # Business logic (search, booking, availability, audit)
│   ├── validations/       # Zod schemas
│   ├── storage/           # File storage abstraction
│   ├── utils/             # Formatting helpers
│   ├── auth.ts            # Auth.js configuration
│   ├── db.ts              # Prisma client singleton
│   └── constants.ts       # App constants
└── types/                 # TypeScript type augmentations
```

## Key Features

### Public
- Homepage with search, featured listings, property type browsing
- Search with filters: location, dates, guests, price, amenities, property type
- Listing detail with photo gallery, amenities, booking widget
- Availability calendar with blocked dates

### Booking
- Request-to-book model (guest requests, host confirms)
- Transactional booking creation with double-booking prevention
- Price calculation with nightly rate + cleaning fee
- Full booking lifecycle (pending, confirmed, cancelled, completed)

### Host
- "Become a Host" onboarding flow
- Listing CRUD with amenity selection and pricing
- Submit listings for platform review
- Calendar-based availability blocking
- Booking request management (confirm/reject)

### Admin
- Dashboard with platform metrics
- Listing moderation queue (approve, reject with reason, suspend)
- User management (view, deactivate/reactivate)
- Booking oversight (view all, admin cancel)
- Audit log of all moderation and admin actions

## Architecture Decisions

- **Modular monolith**: Single Next.js app with clean module boundaries in `lib/services/` and `lib/actions/`. Ready for extraction if needed.
- **Property/Listing separation**: Physical property and bookable listing are separate entities, supporting future multi-unit properties.
- **Request-to-book**: Safest MVP model for a marketplace. Pending bookings create availability holds to prevent double-booking.
- **Listing moderation**: Hosts submit listings, admins approve. Only APPROVED listings are publicly visible.
- **Local file storage with abstraction**: `StorageAdapter` interface allows swapping to S3 by implementing a new adapter.

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Create a new migration from schema changes (dev) |
| `npm run db:migrate:deploy` | Apply pending migrations (prod/CI) |
| `npm run db:push` | Push schema without a migration (prototyping only — do not use against production) |
| `npm run db:seed` | Seed demo data |
| `npm run db:studio` | Open Prisma Studio |
| `npm run typecheck` | Type-check without emitting |
| `npm test` | Run the test suite (integration tests — needs the local DB running, `npm run db:docker`) |
