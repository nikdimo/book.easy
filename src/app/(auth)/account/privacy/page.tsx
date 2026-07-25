'use client';

import { useState } from 'react';
import { AlertCircle, Download, Trash2, Eye } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function PrivacyPage() {
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmPhrase, setDeleteConfirmPhrase] = useState('');
  const [deletePassword, setDeletePassword] = useState('');

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const response = await fetch('/api/gdpr/export');
      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `personal-data-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Your personal data has been downloaded');
    } catch {
      toast.error('Failed to export data. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmPhrase !== 'DELETE MY DATA') {
      toast.error('Please type the confirmation phrase exactly');
      return;
    }

    if (!deletePassword) {
      toast.error('Please enter your password to confirm');
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch('/api/gdpr/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmPassword: deletePassword,
          confirmPhrase: deleteConfirmPhrase,
        }),
      });

      if (!response.ok) throw new Error('Deletion failed');

      toast.success('Your account and data have been permanently deleted. Redirecting...');

      // Redirect to home after 2 seconds
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    } catch {
      toast.error('Failed to delete account. Please contact support.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background py-12">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold mb-8">Data & Privacy</h1>

        {/* Legal Links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          <Link
            href="/privacy"
            className="p-6 rounded-lg border border-border hover:bg-muted/50 transition-colors"
          >
            <Eye className="w-6 h-6 mb-2 text-primary" />
            <h3 className="font-semibold mb-2">Privacy Policy</h3>
            <p className="text-sm text-muted-foreground">
              How we collect and use your data
            </p>
          </Link>

          <Link
            href="/cookies"
            className="p-6 rounded-lg border border-border hover:bg-muted/50 transition-colors"
          >
            <Eye className="w-6 h-6 mb-2 text-primary" />
            <h3 className="font-semibold mb-2">Cookie Policy</h3>
            <p className="text-sm text-muted-foreground">
              About our cookies and tracking
            </p>
          </Link>

          <Link
            href="/terms"
            className="p-6 rounded-lg border border-border hover:bg-muted/50 transition-colors"
          >
            <Eye className="w-6 h-6 mb-2 text-primary" />
            <h3 className="font-semibold mb-2">Terms of Service</h3>
            <p className="text-sm text-muted-foreground">
              Our legal terms and conditions
            </p>
          </Link>
        </div>

        {/* Data Export Section */}
        <div className="mb-12 p-8 rounded-lg border border-border bg-muted/30">
          <div className="flex items-start gap-4 mb-4">
            <Download className="w-6 h-6 text-primary mt-1" />
            <div className="flex-1">
              <h2 className="text-xl font-semibold mb-2">Export Your Data</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Download a copy of all your personal data in a portable JSON format. This includes
                your profile, bookings, listings, favorites, and more.
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                <strong>GDPR Right:</strong> Right to Data Portability (Article 20)
              </p>
              <Button onClick={handleExportData} disabled={isExporting} className="w-full sm:w-auto">
                {isExporting ? 'Exporting...' : '⬇️ Download My Data'}
              </Button>
            </div>
          </div>
        </div>

        {/* Data Access Section */}
        <div className="mb-12 p-8 rounded-lg border border-border bg-muted/30">
          <div className="flex items-start gap-4 mb-4">
            <Eye className="w-6 h-6 text-primary mt-1" />
            <div className="flex-1">
              <h2 className="text-xl font-semibold mb-2">Access Your Data</h2>
              <p className="text-sm text-muted-foreground mb-4">
                See exactly what information we have stored about you, including:
              </p>
              <ul className="text-sm text-muted-foreground space-y-2 mb-4 list-disc pl-5">
                <li>Account information (name, email, profile)</li>
                <li>Booking history and payments</li>
                <li>Property listings you&apos;ve created</li>
                <li>Saved/favorite properties</li>
                <li>Activity logs and consent records</li>
              </ul>
              <p className="text-xs text-muted-foreground mb-4">
                <strong>GDPR Right:</strong> Right of Access (Article 15)
              </p>
              <p className="text-sm font-medium text-primary">
                Click &quot;Download My Data&quot; above to see all your information.
              </p>
            </div>
          </div>
        </div>

        {/* Data Deletion Section */}
        <div className="mb-12 p-8 rounded-lg border-2 border-destructive/50 bg-destructive/5">
          <div className="flex items-start gap-4 mb-4">
            <Trash2 className="w-6 h-6 text-destructive mt-1" />
            <div className="flex-1">
              <h2 className="text-xl font-semibold mb-2 text-destructive">Delete Your Account</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Permanently delete your account and all associated personal data. This action cannot
                be undone.
              </p>

              <div className="mb-4 p-4 border border-destructive/50 bg-destructive/10 rounded-lg">
                <div className="flex gap-3 mb-2">
                  <AlertCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                  <h4 className="font-semibold text-destructive">Important</h4>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground pl-8">
                  <li>
                    <strong>Active bookings:</strong> Pending bookings will be automatically
                    cancelled
                  </li>
                  <li>
                    <strong>Listings:</strong> All your listings will be archived and no longer
                    visible
                  </li>
                  <li>
                    <strong>Booking history:</strong> Kept for 7 years for tax & legal compliance
                    (anonymized)
                  </li>
                  <li>
                    <strong>Reviews:</strong> Your reviews may remain (anonymous) for community
                    transparency
                  </li>
                  <li>
                    <strong>No recovery:</strong> Your account cannot be recovered after deletion
                  </li>
                </ul>
              </div>

              <p className="text-xs text-muted-foreground mb-6">
                <strong>GDPR Right:</strong> Right to Erasure (Article 17 - &quot;Right to be Forgotten&quot;)
              </p>

              <Button
                onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
                variant="destructive"
                className="w-full sm:w-auto"
              >
                {showDeleteConfirm ? 'Cancel' : '🗑️ Delete My Account'}
              </Button>
            </div>
          </div>

          {/* Deletion Confirmation */}
          {showDeleteConfirm && (
            <div className="mt-8 pt-8 border-t border-destructive/30 space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Type this phrase to confirm:
                  <code className="ml-2 px-2 py-1 bg-background rounded text-primary">
                    DELETE MY DATA
                  </code>
                </label>
                <input
                  type="text"
                  value={deleteConfirmPhrase}
                  onChange={(e) => setDeleteConfirmPhrase(e.target.value)}
                  placeholder="Type exactly: DELETE MY DATA"
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Enter your password to confirm:
                </label>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Your password"
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                />
              </div>

              <div className="p-4 border border-destructive/50 bg-destructive/10 rounded-lg mb-6">
                <div className="flex gap-3 mb-2">
                  <AlertCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                  <h4 className="font-semibold text-destructive">Final Warning</h4>
                </div>
                <p className="text-sm text-muted-foreground">
                  This will permanently delete your account. This action cannot be undone. All your
                  personal data will be removed within 30 days.
                </p>
              </div>

              <div className="flex gap-4">
                <Button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmPhrase('');
                    setDeletePassword('');
                  }}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDeleteAccount}
                  disabled={
                    isDeleting ||
                    deleteConfirmPhrase !== 'DELETE MY DATA' ||
                    !deletePassword
                  }
                  variant="destructive"
                  className="flex-1"
                >
                  {isDeleting ? 'Deleting...' : 'Permanently Delete Account'}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* GDPR Rights Info */}
        <div className="p-8 rounded-lg border border-border bg-muted/30">
          <h3 className="font-semibold mb-4">Your GDPR Rights</h3>
          <div className="space-y-3 text-sm">
            <p>
              <strong>1. Right of Access:</strong> You have the right to know what data we hold
              about you. Download your data above.
            </p>
            <p>
              <strong>2. Right to Rectification:</strong> You can update your information in your
              account settings anytime.
            </p>
            <p>
              <strong>3. Right to Erasure:</strong> You can request deletion of your account and
              personal data.
            </p>
            <p>
              <strong>4. Right to Data Portability:</strong> You can download your data in a
              portable format (JSON).
            </p>
            <p>
              <strong>5. Right to Object:</strong> You can opt out of analytics and marketing
              cookies in your consent settings.
            </p>
            <p>
              <strong>6. Right to Withdraw Consent:</strong> You can change your cookie preferences
              at any time.
            </p>
            <p className="pt-4 border-t border-border text-muted-foreground">
              <strong>Questions?</strong> Contact our Data Protection Officer at{' '}
              <a href="mailto:privacy@book.easy.mk" className="text-primary hover:underline">
                privacy@book.easy.mk
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
