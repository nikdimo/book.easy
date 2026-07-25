'use client';

import { useEffect, useState } from 'react';
import { X, Lock } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Tx, useI18n } from '@/lib/i18n/client';

export interface ConsentPreferences {
  essential: boolean;
  analytics: boolean;
  marketing: boolean;
}

function isConsentPreferences(value: unknown): value is ConsentPreferences {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ConsentPreferences>;
  return (
    candidate.essential === true &&
    typeof candidate.analytics === 'boolean' &&
    typeof candidate.marketing === 'boolean'
  );
}

function ToggleSwitch({
  id,
  checked,
  onChange,
  disabled = false,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={cn(
        'relative inline-flex h-6 w-11 rounded-full transition-colors duration-200',
        checked ? 'bg-primary' : 'bg-muted',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:opacity-90'
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-200',
          checked ? 'translate-x-5' : 'translate-x-0.5'
        )}
      />
    </button>
  );
}

export function PrivacySettingsModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const i18n = useI18n();
  const [preferences, setPreferences] = useState<ConsentPreferences>({
    essential: true,
    analytics: false,
    marketing: false,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [consentDate, setConsentDate] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled || !isOpen) return;

      const stored = localStorage.getItem('consent-preferences');
      const consentGiven = localStorage.getItem('consent-given');

      if (stored) {
        try {
          const parsed: unknown = JSON.parse(stored);
          if (isConsentPreferences(parsed)) {
            setPreferences(parsed);
          }
        } catch {
          // Ignore malformed browser storage and keep the safe defaults.
        }
      }

      if (consentGiven) {
        const date = new Date(consentGiven);
        if (!Number.isNaN(date.getTime())) {
          setConsentDate(date.toLocaleString());
        }
      }

    });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      localStorage.setItem('consent-preferences', JSON.stringify(preferences));
      localStorage.setItem('consent-given', new Date().toISOString());

      // Send to server
      await fetch('/api/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences),
      });

      toast.success(
        i18n.resolve(
          'privacy_settings.saved',
          'Privacy settings saved successfully'
        ).text
      );
      onClose();
    } catch (error) {
      toast.error(
        i18n.resolve(
          'privacy_settings.save_failed',
          'Failed to save privacy settings'
        ).text
      );
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAcceptAll = async () => {
    setIsSaving(true);
    try {
      const allAccepted = {
        essential: true,
        analytics: true,
        marketing: true,
      };
      setPreferences(allAccepted);
      localStorage.setItem('consent-preferences', JSON.stringify(allAccepted));
      localStorage.setItem('consent-given', new Date().toISOString());

      await fetch('/api/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(allAccepted),
      });

      toast.success(
        i18n.resolve('privacy_settings.all_enabled', 'All cookies enabled').text
      );
      onClose();
    } catch {
      toast.error(
        i18n.resolve(
          'privacy_settings.update_failed',
          'Failed to update settings'
        ).text
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleRejectAll = async () => {
    setIsSaving(true);
    try {
      const minimal = {
        essential: true,
        analytics: false,
        marketing: false,
      };
      setPreferences(minimal);
      localStorage.setItem('consent-preferences', JSON.stringify(minimal));
      localStorage.setItem('consent-given', new Date().toISOString());

      await fetch('/api/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(minimal),
      });

      toast.success(
        i18n.resolve(
          'privacy_settings.nonessential_disabled',
          'Non-essential cookies disabled'
        ).text
      );
      onClose();
    } catch {
      toast.error(
        i18n.resolve(
          'privacy_settings.update_failed',
          'Failed to update settings'
        ).text
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity"
      onClick={onClose}
    >
      <div
        className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-background border border-border rounded-lg shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-background border-b border-border px-6 py-6 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Lock className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-xl font-bold">
                <Tx k="privacy_settings.title" source="Privacy settings" />
              </h2>
            </div>
            {consentDate && (
              <p className="text-xs text-muted-foreground ml-11">
                <Tx k="consent.last_updated" source="Last updated:" /> {consentDate}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-lg transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5" />
            <span className="sr-only">
              <Tx k="common.close" source="Close" />
            </span>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-6">
          <p className="text-sm text-muted-foreground">
            <Tx
              k="privacy_settings.description"
              source="Manage your privacy preferences. Choose which cookies you want to enable."
            />
          </p>

          {/* Essential */}
          <div className="space-y-3 pb-4 border-b border-border">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h3 className="font-semibold text-sm">
                  <Tx k="consent.essential_cookies" source="Essential cookies" />
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  <Tx
                    k="consent.essential_description"
                    source="Required for sign-in, security, and basic site functions. These are always enabled."
                  />
                </p>
              </div>
              <ToggleSwitch
                id="essential-modal"
                checked={preferences.essential}
                onChange={() => {}}
                disabled={true}
              />
            </div>
            <span className="text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded inline-block">
              <Tx k="consent.always_on" source="Always on" />
            </span>
          </div>

          {/* Analytics */}
          <div className="space-y-3 pb-4 border-b border-border">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h3 className="font-semibold text-sm">
                  <Tx k="consent.analytics_cookies" source="Analytics cookies" />
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  <Tx
                    k="consent.analytics_description"
                    source="Help us understand how the site is used so we can improve it. The data is anonymized."
                  />
                </p>
              </div>
              <ToggleSwitch
                id="analytics-modal"
                checked={preferences.analytics}
                onChange={(checked) =>
                  setPreferences({ ...preferences, analytics: checked })
                }
              />
            </div>
          </div>

          {/* Marketing */}
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h3 className="font-semibold text-sm">
                  <Tx k="consent.marketing_cookies" source="Marketing cookies" />
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  <Tx
                    k="consent.marketing_description"
                    source="Personalize advertising and measure campaign performance. You can opt out at any time."
                  />
                </p>
              </div>
              <ToggleSwitch
                id="marketing-modal"
                checked={preferences.marketing}
                onChange={(checked) =>
                  setPreferences({ ...preferences, marketing: checked })
                }
              />
            </div>
          </div>

          {/* Links */}
          <div className="pt-4 border-t border-border flex flex-wrap gap-2 text-xs">
            <Link href="/privacy" className="text-primary hover:text-primary/80 font-medium hover:underline">
              <Tx k="consent.privacy_policy" source="Privacy Policy" />
            </Link>
            <span className="text-muted-foreground">•</span>
            <Link href="/cookies" className="text-primary hover:text-primary/80 font-medium hover:underline">
              <Tx k="consent.cookie_policy" source="Cookie Policy" />
            </Link>
            <span className="text-muted-foreground">•</span>
            <Link href="/terms" className="text-primary hover:text-primary/80 font-medium hover:underline">
              <Tx k="consent.terms_of_service" source="Terms of Service" />
            </Link>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-background border-t border-border px-6 py-4 flex gap-3 flex-col-reverse sm:flex-row">
          <Button
            onClick={handleRejectAll}
            variant="outline"
            disabled={isSaving}
            className="flex-1"
          >
            <Tx k="consent.reject_all" source="Reject all" />
          </Button>
          <Button
            onClick={handleAcceptAll}
            variant="secondary"
            disabled={isSaving}
            className="flex-1"
          >
            <Tx k="consent.accept_all" source="Accept all" />
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 bg-primary hover:bg-primary/90"
          >
            {isSaving ? (
              <Tx k="privacy_settings.saving" source="Saving..." />
            ) : (
              <Tx k="consent.save_preferences" source="Save preferences" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
