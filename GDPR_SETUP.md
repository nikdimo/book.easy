# GDPR Compliance Setup - Quick Start Guide

Complete setup guide for GDPR/privacy compliance features in Linger Homes.

## What's Included

### ✅ Legal Documents
- Privacy Policy (`/privacy`)
- Terms of Service (`/terms`)
- Cookie Policy (`/cookies`)

### ✅ User Data Management
- Download personal data as JSON (`/account/privacy`)
- Delete account & all personal data (`/account/privacy`)
- View GDPR rights and policies

### ✅ Admin Controls
- Legal document management (`/admin/legal`)
- Data retention policy review
- Manual data cleanup triggers
- Compliance status dashboard
- Automatic cleanup scheduling

### ✅ Consent System
- Beautiful consent banner (auto-appears on first visit)
- Granular cookie preferences (essential/analytics/marketing)
- Persistent consent tracking
- GDPR-compliant UI (no dark patterns)

---

## Step-by-Step Setup

### 1. Run Database Migration

First, create the `UserConsent` table:

```bash
npm run db:migrate
# or
npm run db:push
```

This creates:
- `UserConsent` table (tracks consent preferences)
- Indexes for performance
- Foreign key to User model

### 2. Environment Variables

Update `.env`:

```bash
# Google Analytics (optional)
NEXT_PUBLIC_GA_ID="G-XXXXXXXXXX"  # Get from Google Analytics
```

### 3. Set Up Automated Cleanup

Choose one option:

**Option A: Cron Job (Linux/Mac)**
```bash
# Add to crontab (runs daily at 2:00 AM)
0 2 * * * cd /path/to/lingerhomes && npx tsx scripts/gdpr-cleanup.ts
```

**Option B: Docker**
Use docker-compose with ofelia scheduler

**Option C: Cloud Scheduler**
Set up via Google Cloud Scheduler, AWS Lambda, etc.

**Option D: Manual**
Admin clicks button in `/admin/legal` → Data Retention tab

### 4. Deploy

```bash
git add -A
git commit -m "feat: add complete GDPR compliance system"
git push
npm run build  # Test build before deploying
```

### 5. Verify Setup

1. **Test Consent Banner:**
   - Open site in private/incognito window
   - Banner should appear at bottom
   - Click "Show details" to expand
   - Test "Accept All" / "Reject All" / "Save Preferences"

2. **Test Data Export:**
   - Log in as test user
   - Go to `/account/privacy`
   - Click "Download My Data"
   - Should download JSON file with all user data

3. **Test Account Deletion:**
   - Go to `/account/privacy`
   - Scroll to "Delete Your Account"
   - Click button and follow confirmation steps
   - Account should be deleted

4. **Test Admin Panel:**
   - Log in as admin
   - Go to `/admin/legal`
   - Review retention policies
   - Test "Run Cleanup Now" button

5. **Test Legal Pages:**
   - Visit `/privacy`, `/terms`, `/cookies`
   - All pages should render correctly
   - Links should work

---

## Features Overview

### User Features

#### 1. Access Data (Article 20)
**Location:** `/account/privacy` → "Export Your Data"

Users can download all their personal data:
- Account info, profile, bookings
- Listings, favorites, reviews
- Activity logs, consent history
- Format: JSON (portable)

#### 2. Delete Account (Article 17)
**Location:** `/account/privacy` → "Delete Your Account"

Permanently delete account:
- Personal data removed within 24 hours
- Booking records kept (anonymized, 7 years tax requirement)
- Listings archived
- Two-step confirmation required

#### 3. Manage Consent
**Location:** Cookie banner or footer

Users can:
- Accept/reject non-essential cookies
- Customize preferences anytime
- Withdraw consent at any time

---

### Admin Features

#### 1. Legal Documents
**Location:** `/admin/legal` → "Legal Documents"

- View all three legal documents
- See edit instructions
- Track version history via git

#### 2. Data Retention Policies
**Location:** `/admin/legal` → "Data Retention"

Review retention periods:
- Account data: 7 years (tax)
- Bookings: 7 years (tax)
- Page views: 14 months (analytics)
- Audit logs: 2 years (compliance)
- Sessions: 24 hours (active use)
- Consents: 7 years (GDPR proof)

#### 3. Manual Cleanup
**Location:** `/admin/legal` → "Data Retention" → "Run Cleanup Now"

Trigger immediate data cleanup:
- Delete old analytics data
- Remove expired tokens
- Deactivate inactive accounts
- See deletion summary

#### 4. Compliance Dashboard
**Location:** `/admin/legal` → "Compliance"

Check status:
- ✅ GDPR compliance checklist
- ✅ ePrivacy compliance
- ✅ Security measures
- ✅ Recommended actions
- 👥 DPO contact info

---

## API Endpoints

### User Endpoints

**Download Personal Data**
```bash
GET /api/gdpr/export
Authorization: User session cookie
Returns: JSON file attachment
```

**Delete Account**
```bash
POST /api/gdpr/delete
Body: {
  "confirmPassword": "user_password",
  "confirmPhrase": "DELETE MY DATA"
}
Returns: {success, deleted records, anonymized records}
```

**Save Consent**
```bash
POST /api/consent
Body: {
  "essential": true,
  "analytics": true,
  "marketing": false
}
Returns: {success}
```

### Admin Endpoints

**Run Data Cleanup**
```bash
POST /api/admin/gdpr/cleanup
Authorization: Admin session cookie
Returns: {success, deletedRecords object}
```

---

## File Structure

```
lingerhomes/
├── src/
│   ├── app/
│   │   ├── (public)/
│   │   │   ├── privacy/page.tsx         # Privacy Policy
│   │   │   ├── cookies/page.tsx         # Cookie Policy
│   │   │   └── terms/page.tsx           # Terms of Service
│   │   ├── (auth)/
│   │   │   └── account/
│   │   │       └── privacy/page.tsx     # User data access/deletion
│   │   ├── admin/
│   │   │   └── legal/page.tsx           # Admin GDPR panel
│   │   └── api/
│   │       ├── consent/route.ts         # Consent API
│   │       ├── gdpr/
│   │       │   ├── export/route.ts      # Data export
│   │       │   └── delete/route.ts      # Account deletion
│   │       └── admin/gdpr/
│   │           └── cleanup/route.ts     # Cleanup trigger
│   ├── components/
│   │   └── shared/
│   │       └── consent-banner.tsx       # Consent banner component
│   └── lib/
│       └── services/
│           ├── consent.service.ts       # Consent logic
│           └── gdpr.service.ts          # GDPR operations
├── prisma/
│   ├── schema.prisma                    # +UserConsent model
│   └── migrations/
│       └── 20260725095000_add_user_consent/
│           └── migration.sql            # UserConsent table
├── scripts/
│   └── gdpr-cleanup.ts                  # Cleanup job script
├── LEGAL_COMPLIANCE.md                  # Legal docs guide
├── GDPR_DATA_MANAGEMENT.md              # Data management guide
├── GDPR_SETUP.md                        # This file
└── .env.example                         # +NEXT_PUBLIC_GA_ID

```

---

## Database Schema

### UserConsent Table

```sql
CREATE TABLE "UserConsent" (
    id              TEXT PRIMARY KEY,
    userId          TEXT,                    -- FK to User (nullable for anonymous)
    sessionId       TEXT UNIQUE,             -- Session identifier
    essential       BOOLEAN DEFAULT true,   -- Always true (required)
    analytics       BOOLEAN DEFAULT false,  -- Google Analytics
    marketing       BOOLEAN DEFAULT false,  -- Marketing campaigns
    consentVersion  TEXT DEFAULT '1.0',
    ipAddress       TEXT,                   -- For audit trail
    userAgent       TEXT,                   -- For audit trail
    consentedAt     TIMESTAMP DEFAULT NOW(),
    updatedAt       TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
);

CREATE INDEX idx_userId ON "UserConsent"(userId);
CREATE INDEX idx_consentedAt ON "UserConsent"(consentedAt);
```

---

## Monitoring & Maintenance

### Daily
- Automatic cleanup runs (if scheduled)
- Consent banner tracks preferences
- Users can export/delete data anytime

### Weekly
- Review admin logs for errors
- Check if cleanup ran successfully

### Monthly
- Audit data retention policies
- Review consent statistics

### Quarterly
- Full privacy audit
- Review third-party data usage
- Update legal documents if needed

### Annually
- Full GDPR compliance review
- Staff training
- Data Protection Impact Assessment (DPIA)

---

## Compliance Verified

This implementation complies with:

✅ **GDPR (EU)**
- Lawful basis documented
- Privacy Policy complete
- User rights enabled
- DPO contact provided

✅ **ePrivacy Regulations**
- Consent before non-essential cookies
- Clear cookie disclosure
- Easy opt-out

✅ **UK PECR**
- Email opt-in required
- Unsubscribe links in emails
- Consent tracking

✅ **Data Protection**
- HTTPS encryption
- Database encryption
- Password hashing
- IP hashing (analytics)

---

## Troubleshooting

### Consent Banner Not Showing
- Clear browser cookies/localStorage
- Check browser console for errors
- Verify `ConsentBanner` component in root layout

### Data Export Not Working
- Check user session is valid
- Verify database connections
- Check server logs for errors

### Cleanup Job Failing
- Verify cron schedule is correct
- Check database write permissions
- Review server logs
- Test manually via admin panel

### Legal Pages Not Rendering
- Check routes are correct
- Verify .tsx files exist
- Clear Next.js cache: `rm -rf .next`

---

## Support

For questions:

1. **User Questions:** Direct to `/account/privacy` page
2. **Technical Issues:** Check server logs or contact developer
3. **Legal Issues:** Consult legal team or DPO
4. **GDPR Compliance:** Review LEGAL_COMPLIANCE.md

---

**Status:** ✅ Ready for Production
**Last Updated:** July 2026
**Version:** 1.0
