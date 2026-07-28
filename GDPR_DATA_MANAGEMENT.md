# GDPR Data Management & User Deletion Guide

This document explains the complete data access, deletion, and retention management system for Linger Homes users and administrators.

## User-Facing Features

### 1. Access Your Data (Right to Data Portability)

**Location:** `/account/privacy` → "Export Your Data"

Users can download **all their personal data** in a portable JSON format, including:
- Account information (name, email, profile picture)
- Booking history (dates, prices, status)
- Listings they created (title, status, view count)
- Saved/favorite properties
- Activity logs and audit trail
- Consent records

**GDPR Basis:** Article 20 (Right to Data Portability)

**How it works:**
1. User clicks "Download My Data" button
2. System generates JSON export of all user data
3. Browser downloads file: `personal-data-YYYY-MM-DD.json`
4. User can open in any text editor or import to another service

**API Endpoint:** `GET /api/gdpr/export`

### 2. Delete Your Account (Right to Erasure)

**Location:** `/account/privacy` → "Delete Your Account"

Users can permanently delete their account with all personal data removed:

**GDPR Basis:** Article 17 (Right to be Forgotten / Right to Erasure)

**What gets deleted:**
- ✅ User profile (name, email, phone, bio)
- ✅ Profile picture/avatar
- ✅ Authentication records (sessions, accounts)
- ✅ Consent records
- ✅ User preferences

**What gets preserved (legally required):**
- 📋 Booking history (anonymized) - Tax requirement (7 years)
- 📋 Tax/payment records - Legal compliance
- 📋 Audit logs (user linkage removed) - Compliance audit trail

**What happens to their listings:**
- 🏠 All listings archived (no longer visible publicly)
- 🏠 Can't create new listings
- 🏠 Historical booking data kept (anonymized)

**Active bookings:**
- 📅 Pending bookings automatically cancelled
- 📅 User notified of cancellation
- 📅 Host receives cancellation notice
- 📅 Refund issued according to policy

**Deletion Process (2-step confirmation):**
1. User must type "DELETE MY DATA"
2. User must enter their password
3. Click "Permanently Delete Account"
4. User logged out immediately
5. Data deleted within 24 hours

**API Endpoint:** `POST /api/gdpr/delete`

**Example Request:**
```bash
curl -X POST https://lingerhomes.com/api/gdpr/delete \
  -H "Content-Type: application/json" \
  -b "next-auth.session-token=..." \
  -d '{
    "confirmPassword": "user_password",
    "confirmPhrase": "DELETE MY DATA"
  }'
```

### 3. View Legal Documents

**Locations:**
- `/privacy` - Full Privacy Policy
- `/cookies` - Cookie & Tracking Policy
- `/terms` - Terms of Service

All documents include:
- Plain language explanations
- GDPR compliance details
- Data retention periods
- User rights information
- Contact for questions

---

## Admin Features

### 1. Legal Document Management

**Location:** `/admin/legal` → "Legal Documents" tab

Admins can:
- 👁️ View all three legal documents
- ✏️ Edit documents (via code)
- 📋 Track version history
- 📅 See last updated dates

**Documents in codebase:**
```
src/app/(public)/
├── privacy/page.tsx      # Privacy Policy
├── cookies/page.tsx      # Cookie Policy
└── terms/page.tsx        # Terms of Service
```

**To edit a document:**
1. Open the .tsx file in your editor
2. Update the content
3. Update the "Last updated" date
4. Commit to git (creates version history)
5. Deploy to production
6. Old versions available in git history

### 2. Data Retention Policy Management

**Location:** `/admin/legal` → "Data Retention" tab

View all retention policies:

| Data Type | Retention | Reason | Notes |
|-----------|-----------|--------|-------|
| Account data | 7 years | Tax compliance | Anonymized after deletion |
| Booking records | 7 years | Legal/audit | Tax requirement |
| Page views | 14 months | Analytics | Aggregated after period |
| Audit logs | 2 years | Compliance trail | User link removed |
| Sessions | 24 hours | Active use | Auto-cleared |
| Consent records | 7 years | GDPR proof | Anonymized |
| Inactive accounts | 2 years | Recovery window | Deactivated, not deleted |

**How it works:**
1. Policies defined in code (`gdpr.service.ts`)
2. Automatic cleanup runs daily via cron job
3. Can be manually triggered in admin panel
4. Detailed log of what was deleted

### 3. Manual Data Cleanup

**Location:** `/admin/legal` → "Data Retention" tab → "Manual Cleanup"

Trigger data retention cleanup immediately:

1. Click "🧹 Run Cleanup Now"
2. Confirm the action
3. System runs cleanup process
4. Shows deleted record counts
5. Last run timestamp displayed

**What cleanup does:**
- Deletes page views older than 14 months
- Deletes expired verification tokens
- Removes audit logs older than 2 years
- Deactivates inactive users (2+ years)
- Logs all deletions for audit trail

### 4. GDPR Compliance Status

**Location:** `/admin/legal` → "Compliance" tab

Admins can:
- ✅ See compliance checklist (GDPR, ePrivacy, etc.)
- ✅ View security measures
- ✅ Review recommended actions
- 👥 See legal contact information (DPO, privacy email)

**Compliance sections:**
- GDPR (General Data Protection Regulation)
- ePrivacy Regulations (EU)
- Data Security & Privacy measures
- Recommended actions checklist

---

## Automated Data Retention

### How Automatic Cleanup Works

**Schedule:** Daily at 2:00 AM (configurable)

**Process:**
1. System identifies old data per retention policies
2. Data is deleted or anonymized
3. Deletion logged for audit trail
4. Admin notified if errors occur

### Setting Up Automated Cleanup

#### Option 1: Unix/Linux Cron Job

Add to `/etc/crontab` or via `crontab -e`:

```bash
# Run GDPR cleanup daily at 2:00 AM
0 2 * * * cd /path/to/lingerhomes && npx tsx scripts/gdpr-cleanup.ts >> /var/log/lingerhomes-gdpr-cleanup.log 2>&1
```

#### Option 2: Docker/Container

In your Dockerfile or docker-compose.yml:

```yaml
services:
  app:
    # ... existing config ...
    environment:
      - GDPR_CLEANUP_ENABLED=true
      - GDPR_CLEANUP_HOUR=2  # 2:00 AM

  scheduler:
    image: mcuadros/ofelia:latest
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    command: daemon --docker
    depends_on:
      - app

# Add to app service:
labels:
  ofelia.enabled: "true"
  ofelia.job-exec.gdpr-cleanup.schedule: "@daily"
  ofelia.job-exec.gdpr-cleanup.command: "npx tsx scripts/gdpr-cleanup.ts"
```

#### Option 3: Cloud Scheduler (Google Cloud, AWS, etc.)

**Google Cloud Scheduler:**
```bash
gcloud scheduler jobs create http gdpr-cleanup \
  --schedule="0 2 * * *" \
  --http-method=POST \
  --uri="https://lingerhomes.com/api/admin/gdpr/cleanup" \
  --headers="Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**AWS Lambda + CloudWatch Events:**
```python
# Lambda function
import requests

def lambda_handler(event, context):
    response = requests.post(
        'https://lingerhomes.com/api/admin/gdpr/cleanup',
        headers={'Authorization': f'Bearer {ADMIN_TOKEN}'}
    )
    return response.json()
```

#### Option 4: Manual (No Automation)

Admins must click "Run Cleanup Now" in `/admin/legal` periodically.

---

## Data That's NOT Deleted

### Why Some Data is Preserved

**Legal/Tax Requirements (7 years):**
- Booking transaction records (payment amounts, dates)
- Tax records (used for VAT, income reporting)
- Dispute logs (refund/cancellation records)

**These remain even after user deletion**, but are **anonymized**:
- User's name/email removed
- Listing title removed
- Payment amount kept (tax compliance)
- Date kept (audit trail)
- Host/guest identifiers replaced with IDs

**Example:**
Before deletion:
```json
{
  "guestId": "user_123",
  "guestName": "John Doe",
  "guestEmail": "john@example.com",
  "listingTitle": "Cozy Apartment",
  "amount": 150.00,
  "date": "2024-01-15"
}
```

After anonymization:
```json
{
  "guestId": "[DELETED]",
  "guestName": "[DELETED]",
  "guestEmail": "[DELETED]",
  "listingTitle": "[DELETED]",
  "amount": 150.00,
  "date": "2024-01-15"
}
```

---

## User Data Export Format

When users download their data via `/account/privacy`, they get a JSON file with this structure:

```json
{
  "account": {
    "id": "user_123",
    "email": "user@example.com",
    "name": "John Doe",
    "image": "https://...",
    "role": "USER",
    "isHost": true,
    "createdAt": "2023-01-15T10:30:00Z",
    "updatedAt": "2024-07-24T15:45:00Z"
  },
  "profile": {
    "phone": "+389-123-456",
    "bio": "Love hosting travelers",
    "hostBio": "Experienced host",
    "hostDisplayName": "John"
  },
  "bookings": [
    {
      "id": "booking_456",
      "listingTitle": "Mountain Villa",
      "checkIn": "2024-08-01",
      "checkOut": "2024-08-05",
      "guestCount": 4,
      "totalPrice": "500.00",
      "status": "CONFIRMED",
      "createdAt": "2024-07-20T12:00:00Z"
    }
  ],
  "listings": [
    {
      "id": "listing_789",
      "title": "Cozy Apartment",
      "slug": "cozy-apartment",
      "status": "APPROVED",
      "views": 247,
      "createdAt": "2023-06-10T08:00:00Z"
    }
  ],
  "favorites": [
    {
      "listingTitle": "Beach House",
      "addedAt": "2024-03-15T14:30:00Z"
    }
  ],
  "reviews": [
    {
      "listingTitle": "Mountain Villa",
      "comment": "Amazing place, great host!",
      "createdAt": "2024-08-06T10:00:00Z"
    }
  ],
  "auditLog": [
    {
      "action": "LOGIN",
      "entityType": "User",
      "createdAt": "2024-07-24T09:15:00Z"
    }
  ],
  "consentHistory": [
    {
      "essential": true,
      "analytics": true,
      "marketing": false,
      "consentedAt": "2024-07-01T00:00:00Z"
    }
  ]
}
```

---

## Admin Endpoints Reference

### List User Data (for support team)
**Endpoint:** `GET /api/gdpr/export`
**Auth:** User's own session only
**Returns:** All user's data as JSON

### Delete Account (user-initiated)
**Endpoint:** `POST /api/gdpr/delete`
**Auth:** User's own session + password confirmation
**Returns:** Deletion summary

### Run Data Cleanup (admin only)
**Endpoint:** `POST /api/admin/gdpr/cleanup`
**Auth:** Admin session required
**Returns:** Cleanup results with deleted record counts

---

## Compliance Checklist

### Before Going Live
- [ ] Test data export (does it include everything?)
- [ ] Test account deletion (does it work without errors?)
- [ ] Test automatic cleanup (schedule and manual trigger)
- [ ] Review legal documents (are they accurate for your business?)
- [ ] Set up automated cleanup schedule
- [ ] Configure DPO email address
- [ ] Add privacy/legal contact emails to customer support

### Quarterly
- [ ] Review data retention policies
- [ ] Check cleanup logs for errors
- [ ] Audit third-party data processors
- [ ] Update legal documents if needed
- [ ] Test data export for new data types

### Annually
- [ ] Full privacy audit
- [ ] DPIA (Data Protection Impact Assessment)
- [ ] Staff training on GDPR
- [ ] Third-party contract review
- [ ] Update compliance checklist

---

## FAQs

**Q: Can I recover a deleted account?**
A: No. Account deletion is permanent and cannot be undone. Users should download their data first if they want to keep it.

**Q: Do I have to delete booking records?**
A: No. GDPR requires you to keep booking records for 7 years for tax compliance. Delete only personal identifiers (name, email), not transaction data.

**Q: How long does cleanup take?**
A: Typically 30 seconds to 2 minutes depending on data volume. Large datasets may take longer.

**Q: What if cleanup fails?**
A: Errors are logged. Check server logs in `/var/log/gdpr-cleanup.log` or database logs. Failed cleanup can be retried without issues.

**Q: Can I manually delete specific users?**
A: Yes, use `/api/gdpr/delete` endpoint with user's permission.

**Q: What about GDPR requests from data subjects?**
A: Users can self-serve via `/account/privacy`. For official requests:
1. Verify identity
2. Use `/api/gdpr/export` to gather data
3. Send manually via secure channel or use data portability export

**Q: How do I report a data breach?**
A: Contact your DPO and local data protection authority within 72 hours. Document in support system with incident details.

---

## Support & Questions

- **GDPR Questions:** Contact your Data Protection Officer
- **Technical Issues:** Check `/admin/legal` compliance status
- **User Questions:** Direct to `/account/privacy` page or `/privacy` policy
- **Legal Review:** Consult with legal team quarterly

---

**Last Updated:** July 2026
**Status:** ✅ Production Ready
