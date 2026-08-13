"use client";

import { useState, useTransition } from "react";
import { Cookie, Download, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { PrivacySettingsModal } from "@/components/shared/privacy-settings-modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requestAccountDeletionAction } from "@/lib/actions/account-deletion.actions";
import { Tx, useI18n } from "@/lib/i18n/client";

function Row({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 py-5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="flex min-w-0 gap-3">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {icon}
        </div>
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="shrink-0 pl-12 text-sm sm:pl-0">{children}</div>
    </div>
  );
}

export function PrivacyControls() {
  const { resolve } = useI18n();
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [deletionRequested, setDeletionRequested] = useState(false);
  const [isRequesting, startRequest] = useTransition();

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const response = await fetch("/api/gdpr/export");
      if (!response.ok) throw new Error(resolve("account.privacy.export_failed_short", "Export failed").text);

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `personal-data-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success(resolve("account.privacy.export_success", "Your personal data has been downloaded").text);
    } catch {
      toast.error(resolve("account.privacy.export_failed", "Failed to export data. Please try again.").text);
    } finally {
      setIsExporting(false);
    }
  };

  const handleRequestDeletion = () => {
    startRequest(async () => {
      const result = await requestAccountDeletionAction();
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setDeletionRequested(true);
      toast.success(resolve("account.privacy.confirm_email", "Check your email to confirm deletion").text);
    });
  };

  return (
    <Card>
      <CardContent className="divide-y p-5 sm:p-6">
        <Row
          title={resolve("account.privacy.cookies_title", "Cookies and consent").text}
          description={resolve("account.privacy.cookies_description", "Choose which optional cookies we may use. You can change this at any time.").text}
          icon={<Cookie className="size-4" aria-hidden="true" />}
        >
          <Button type="button" variant="outline" onClick={() => setShowPrivacyModal(true)}>
            <Tx k="account.privacy.manage_preferences" source="Manage preferences" />
          </Button>
        </Row>

        <Row
          title={resolve("account.privacy.download_title", "Download your data").text}
          description={resolve("account.privacy.download_description", "Download your profile, bookings, listings and favourites as JSON, a standard machine-readable format.").text}
          icon={<Download className="size-4" aria-hidden="true" />}
        >
          <Button
            type="button"
            variant="outline"
            onClick={handleExportData}
            disabled={isExporting}
          >
            {isExporting
              ? resolve("account.privacy.preparing", "Preparing…").text
              : resolve("account.privacy.download", "Download").text}
          </Button>
        </Row>

        <Row
          title={resolve("account.privacy.delete_title", "Delete your account").text}
          description={resolve("account.privacy.delete_description", "Pending bookings are cancelled and your listings are archived. Booking records are kept anonymously for 7 years to meet tax and legal obligations. This can't be undone.").text}
          icon={<ShieldAlert className="size-4" aria-hidden="true" />}
        >
          {deletionRequested ? (
            <div className="space-y-2 text-muted-foreground sm:text-right">
              <p><Tx k="account.privacy.email_sent" source="Confirmation email sent. The link expires in an hour." /></p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRequestDeletion}
                disabled={isRequesting}
              >
                <Tx k="account.privacy.resend" source="Resend" />
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={handleRequestDeletion}
              disabled={isRequesting}
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              {isRequesting
                ? resolve("common.sending", "Sending...").text
                : resolve("account.privacy.request_deletion", "Request deletion").text}
            </Button>
          )}
        </Row>
      </CardContent>

      <PrivacySettingsModal
        isOpen={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
      />
    </Card>
  );
}
