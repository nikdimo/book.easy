'use client';

import { useState } from 'react';
import { BookOpen, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const RETENTION_POLICIES = {
  accountData: {
    name: 'Account & User Data',
    retention: '7 years',
    reason: 'Tax compliance and legal records',
    note: 'Kept after account deletion to satisfy tax requirements',
    status: 'active',
  },
  bookingRecords: {
    name: 'Booking Records',
    retention: '7 years',
    reason: 'Tax, audit, and dispute resolution',
    note: 'Guest/host identifiers removed after account deletion, bookings kept anonymized',
    status: 'active',
  },
  listingViews: {
    name: 'Analytics & Page Views',
    retention: '14 months',
    reason: 'Analytics aggregation and trend analysis',
    note: 'Raw data aggregated and anonymized after period expires',
    status: 'active',
  },
  auditLogs: {
    name: 'Audit Logs',
    retention: '2 years',
    reason: 'Security and compliance audit trail',
    note: 'User linkage removed, action records kept for compliance',
    status: 'active',
  },
  sessionData: {
    name: 'Session Data',
    retention: '24 hours inactivity',
    reason: 'Active session management',
    note: 'Automatically cleared by browser after inactivity',
    status: 'active',
  },
  consentRecords: {
    name: 'Consent Records',
    retention: '7 years',
    reason: 'Proof of consent for GDPR compliance',
    note: 'Kept with anonymized user indicator for audit trail',
    status: 'active',
  },
  inactiveAccounts: {
    name: 'Inactive Accounts',
    retention: '2 years',
    reason: 'User account recovery window',
    note: 'Accounts deactivated (not deleted) after 2 years of inactivity, with email notification',
    status: 'active',
  },
};

export default function AdminLegalPage() {
  const [selectedTab, setSelectedTab] = useState('retention');
  const [lastCleanup, setLastCleanup] = useState<string | null>(null);
  const [isRunningCleanup, setIsRunningCleanup] = useState(false);

  const handleRunCleanup = async () => {
    if (!confirm('Run data retention cleanup? This will delete old data according to policy.')) {
      return;
    }

    setIsRunningCleanup(true);
    try {
      const response = await fetch('/api/admin/gdpr/cleanup', {
        method: 'POST',
      });
      if (response.ok) {
        const data = await response.json();
        setLastCleanup(new Date().toLocaleString());
        alert(
          `Cleanup completed:\n${Object.entries(data.deletedRecords || {})
            .map(([key, count]) => `${key}: ${count}`)
            .join('\n')}`
        );
      } else {
        alert('Cleanup failed. Check server logs.');
      }
    } catch {
      alert('Error running cleanup');
    } finally {
      setIsRunningCleanup(false);
    }
  };

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Legal & GDPR Management</h1>
          <p className="text-muted-foreground">
            Manage legal documents, review retention policies, and monitor GDPR compliance
          </p>
        </div>

        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="retention">Data Retention</TabsTrigger>
            <TabsTrigger value="documents">Legal Documents</TabsTrigger>
            <TabsTrigger value="compliance">Compliance</TabsTrigger>
          </TabsList>

          {/* Data Retention Policies */}
          <TabsContent value="retention" className="space-y-6">
            <div className="p-4 border border-border rounded-lg bg-muted/30 flex gap-3">
              <RefreshCw className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold">Data Retention Policies</h3>
                <p className="text-sm text-muted-foreground">
                  Automatic cleanup runs daily via scheduled job. You can manually trigger it below.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {Object.entries(RETENTION_POLICIES).map(([key, policy]) => (
                <div
                  key={key}
                  className="p-6 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      {policy.name}
                    </h3>
                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                      {policy.retention}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">{policy.reason}</p>
                  <p className="text-xs text-muted-foreground italic">{policy.note}</p>
                </div>
              ))}
            </div>

            <div className="p-6 rounded-lg border border-border bg-muted/30">
              <h3 className="font-semibold mb-3">Manual Cleanup</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Trigger data retention cleanup immediately. This will delete old data according to
                the policies above.
              </p>
              {lastCleanup && (
                <p className="text-xs text-green-600 mb-4">
                  Last run: {lastCleanup}
                </p>
              )}
              <Button
                onClick={handleRunCleanup}
                disabled={isRunningCleanup}
                variant="secondary"
              >
                {isRunningCleanup ? 'Running...' : '🧹 Run Cleanup Now'}
              </Button>
            </div>
          </TabsContent>

          {/* Legal Documents */}
          <TabsContent value="documents" className="space-y-6">
            <div className="p-4 border border-border rounded-lg bg-muted/30 flex gap-3">
              <BookOpen className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold">Legal Documents</h3>
                <p className="text-sm text-muted-foreground">
                  Review and manage your legal documents. Last updated dates are automatically
                  tracked.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Link
                href="/privacy"
                target="_blank"
                className="p-6 rounded-lg border border-border hover:bg-muted/50 transition-colors group"
              >
                <h3 className="font-semibold mb-2 group-hover:text-primary">Privacy Policy</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  GDPR-compliant privacy policy covering data collection, processing, and rights
                </p>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>✓ GDPR Article 13/14 compliant</p>
                  <p>✓ Right to erasure included</p>
                  <p>✓ Data retention periods clear</p>
                </div>
              </Link>

              <Link
                href="/terms"
                target="_blank"
                className="p-6 rounded-lg border border-border hover:bg-muted/50 transition-colors group"
              >
                <h3 className="font-semibold mb-2 group-hover:text-primary">Terms of Service</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Legal terms for platform usage, bookings, hosting, and dispute resolution
                </p>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>✓ Host/guest liability clear</p>
                  <p>✓ Cancellation policy defined</p>
                  <p>✓ Dispute resolution process</p>
                </div>
              </Link>

              <Link
                href="/cookies"
                target="_blank"
                className="p-6 rounded-lg border border-border hover:bg-muted/50 transition-colors group"
              >
                <h3 className="font-semibold mb-2 group-hover:text-primary">Cookie Policy</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Transparency about cookies, analytics, and user tracking technologies
                </p>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>✓ ePrivacy compliant</p>
                  <p>✓ Consent-based analytics</p>
                  <p>✓ Cookie types disclosed</p>
                </div>
              </Link>

              <div className="p-6 rounded-lg border border-border bg-muted/30">
                <h3 className="font-semibold mb-2">Edit Documents</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Legal documents are stored as code. To edit:
                </p>
                <ol className="text-sm text-muted-foreground space-y-1 list-decimal pl-5 mb-4">
                  <li>Edit the .tsx files in src/app/(public)/</li>
                  <li>Update &quot;Last updated&quot; date in the document</li>
                  <li>Deploy to production</li>
                  <li>Keep version history for audit trail</li>
                </ol>
                <Link href="/LEGAL_COMPLIANCE.md" className="text-primary hover:underline text-sm">
                  View implementation guide →
                </Link>
              </div>
            </div>
          </TabsContent>

          {/* GDPR Compliance Status */}
          <TabsContent value="compliance" className="space-y-6">
            <div className="p-4 border border-border rounded-lg bg-muted/30 flex gap-3">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold">Compliance Status</h3>
                <p className="text-sm text-muted-foreground">
                  Current GDPR and privacy regulation compliance status
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="p-6 rounded-lg border border-green-600/30 bg-green-50/5">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  GDPR (General Data Protection Regulation)
                </h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>✓ Lawful basis documented for all processing</li>
                  <li>✓ Privacy Policy includes all Article 13 requirements</li>
                  <li>✓ User rights clearly described (access, deletion, portability)</li>
                  <li>✓ Data retention periods specified (7 years for tax records)</li>
                  <li>✓ Consent management system implemented</li>
                  <li>✓ DPO contact information provided</li>
                  <li>✓ Data breach procedures documented</li>
                </ul>
              </div>

              <div className="p-6 rounded-lg border border-green-600/30 bg-green-50/5">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  ePrivacy Regulations (EU)
                </h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>✓ Consent banner on all pages</li>
                  <li>✓ Essential-only cookies by default</li>
                  <li>✓ Granular cookie categories (essential/analytics/marketing)</li>
                  <li>✓ Easy opt-out mechanism</li>
                  <li>✓ No dark patterns in consent UI</li>
                  <li>✓ Third-party cookies disclosed</li>
                </ul>
              </div>

              <div className="p-6 rounded-lg border border-green-600/30 bg-green-50/5">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  Data Security & Privacy
                </h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>✓ HTTPS encryption (all data in transit)</li>
                  <li>✓ Database encryption at rest</li>
                  <li>✓ IP addresses hashed (not stored raw)</li>
                  <li>✓ Password hashing with bcrypt/argon2</li>
                  <li>✓ Session tokens signed and httpOnly</li>
                  <li>✓ CSRF protection on all forms</li>
                  <li>✓ Rate limiting on auth endpoints</li>
                </ul>
              </div>

              <div className="p-6 rounded-lg border border-blue-600/30 bg-blue-50/5">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-blue-600" />
                  Recommended Actions
                </h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>
                    📋 Document your Data Processing Agreement (DPA) with third parties (Resend,
                    Mapbox, etc.)
                  </li>
                  <li>
                    📋 Set up automated data breach notification process (mail to privacy@...)
                  </li>
                  <li>
                    📋 Create Data Protection Impact Assessment (DPIA) for new features
                  </li>
                  <li>
                    📋 Train staff on GDPR compliance and data handling procedures
                  </li>
                  <li>
                    📋 Perform annual privacy audit and update this compliance checklist
                  </li>
                  <li>
                    📋 Review third-party service providers&apos; privacy policies quarterly
                  </li>
                </ul>
              </div>
            </div>

            {/* Contact Info */}
            <div className="p-6 rounded-lg border border-border bg-muted/30">
              <h3 className="font-semibold mb-4">Legal Contact Information</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-medium">Data Protection Officer (DPO)</p>
                  <p className="text-muted-foreground">dpo@book.easy.mk</p>
                </div>
                <div>
                  <p className="font-medium">Privacy Inquiries</p>
                  <p className="text-muted-foreground">privacy@book.easy.mk</p>
                </div>
                <div>
                  <p className="font-medium">Legal Support</p>
                  <p className="text-muted-foreground">support@book.easy.mk</p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
