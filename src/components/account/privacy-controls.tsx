"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PrivacySettingsModal } from "@/components/shared/privacy-settings-modal";
import { requestAccountDeletionAction } from "@/lib/actions/account-deletion.actions";

/** Shared look for every control on this page: a plain underlined text link, never a
 * button. Deleting an account is a deliberate, rare act — a prominent destructive
 * button invites the mis-click it's meant to guard against. */
const linkClass =
  "underline underline-offset-4 hover:text-foreground disabled:no-underline disabled:opacity-60";

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 border-t py-5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0 text-sm">{children}</div>
    </div>
  );
}

export function PrivacyControls() {
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [deletionRequested, setDeletionRequested] = useState(false);
  const [isRequesting, startRequest] = useTransition();

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const response = await fetch("/api/gdpr/export");
      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `personal-data-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success("Your personal data has been downloaded");
    } catch {
      toast.error("Failed to export data. Please try again.");
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
      toast.success("Check your email to confirm deletion");
    });
  };

  return (
    <div className="border-b">
      <Row
        title="Cookies and consent"
        description="Choose which optional cookies we may use. You can change this at any time."
      >
        <button type="button" onClick={() => setShowPrivacyModal(true)} className={linkClass}>
          Manage preferences
        </button>
      </Row>

      <Row
        title="Download your data"
        description="A copy of your profile, bookings, listings and favourites as a JSON file."
      >
        <button
          type="button"
          onClick={handleExportData}
          disabled={isExporting}
          className={linkClass}
        >
          {isExporting ? "Preparing…" : "Download"}
        </button>
      </Row>

      <Row
        title="Delete your account"
        description="Pending bookings are cancelled and your listings are archived. Booking records are kept
          anonymously for 7 years to meet tax and legal obligations. This can't be undone."
      >
        {deletionRequested ? (
          <span className="text-muted-foreground">
            Confirmation email sent — the link expires in an hour.{" "}
            <button
              type="button"
              onClick={handleRequestDeletion}
              disabled={isRequesting}
              className={linkClass}
            >
              Resend
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={handleRequestDeletion}
            disabled={isRequesting}
            className={`${linkClass} text-destructive`}
          >
            {isRequesting ? "Sending…" : "Request deletion"}
          </button>
        )}
      </Row>

      <PrivacySettingsModal
        isOpen={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
      />
    </div>
  );
}
