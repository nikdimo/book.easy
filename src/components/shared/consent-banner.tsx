'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Tx } from '@/lib/i18n/client';
import { usePathname } from 'next/navigation';

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

function loadGoogleAnalytics() {
  const measurementId = process.env.NEXT_PUBLIC_GA_ID;
  if (!measurementId || typeof window === 'undefined') return;
  const analyticsWindow = window as Window & {
    dataLayer?: unknown[][];
    gtag?: (...args: unknown[]) => void;
  };
  if (analyticsWindow.gtag) return;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);

  analyticsWindow.dataLayer = analyticsWindow.dataLayer || [];
  analyticsWindow.gtag = (...args: unknown[]) => {
    analyticsWindow.dataLayer?.push(args);
  };
  analyticsWindow.gtag('js', new Date());
  analyticsWindow.gtag('config', measurementId);
}

// Beautiful toggle switch component
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
        'relative inline-flex h-6 w-11 rounded-full transition-colors duration-200 flex-shrink-0',
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

export function ConsentBanner() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [preferences, setPreferences] = useState<ConsentPreferences>({
    essential: true,
    analytics: false,
    marketing: false,
  });
  const [mounted, setMounted] = useState(false);

  // Determine if close button should be shown (only on landing page)
  const isLandingPage = pathname === '/' || pathname === '';
  const canClose = isLandingPage;

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;

      const consentGiven = localStorage.getItem('consent-given');

      if (!consentGiven) {
        setIsOpen(true);
      } else {
        const stored = localStorage.getItem('consent-preferences');
        if (stored) {
          try {
            const parsed: unknown = JSON.parse(stored);
            if (isConsentPreferences(parsed)) {
              setPreferences(parsed);
              if (parsed.analytics) loadGoogleAnalytics();
            }
          } catch {
            // Ignore malformed storage
          }
        }
      }

      setMounted(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleAcceptAll = () => {
    const allAccepted = {
      essential: true,
      analytics: true,
      marketing: true,
    };
    savePreferences(allAccepted);
  };

  const handleDeclineAll = () => {
    const minimal = {
      essential: true,
      analytics: false,
      marketing: false,
    };
    savePreferences(minimal);
  };

  const handleSavePreferences = () => {
    savePreferences(preferences);
  };

  const savePreferences = (prefs: ConsentPreferences) => {
    localStorage.setItem('consent-preferences', JSON.stringify(prefs));
    localStorage.setItem('consent-given', new Date().toISOString());

    // Send to server
    fetch('/api/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    }).catch(() => {
      // Silently fail, consent is already stored locally
    });

    // Load analytics if accepted
    if (prefs.analytics) {
      loadGoogleAnalytics();
    }

    setIsOpen(false);
  };

  const handleClose = () => {
    if (canClose) {
      setIsOpen(false);
    }
    // If not on landing page, don't allow closing - user MUST decide
  };

  if (!mounted || !isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity"
      onClick={canClose ? handleClose : undefined}
    >
      <div
        className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-background border border-border rounded-lg shadow-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-border px-8 py-6 flex items-start justify-between gap-4 flex-shrink-0">
          <div>
            <h2 className="text-2xl font-bold">
              <Tx k="consent.dialog_title" source="We use cookies" />
            </h2>
          </div>
          {canClose && (
            <button
              onClick={handleClose}
              className="p-2 hover:bg-muted rounded-lg transition-colors flex-shrink-0"
            >
              <X className="w-5 h-5" />
              <span className="sr-only">
                <Tx k="common.close" source="Close" />
              </span>
            </button>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 px-8 py-6 space-y-6">
          <div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              <Tx
                k="consent.intro"
                source="We use cookies to collect information about you. We use this information:"
              />
            </p>
          </div>

          {/* Cookie purposes list */}
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-1">
                <div className="w-2 h-2 rounded-full bg-primary mt-1.5" />
              </div>
              <div className="flex-1">
                <p className="text-sm">
                  <span className="font-medium">
                    <Tx
                      k="consent.functional_benefit"
                      source="to give you a better experience"
                    />
                  </span>
                  <span className="text-muted-foreground">
                    {' '}
                    <Tx k="consent.functional_desc" source="of our website (functional)" />
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-1">
                <div className="w-2 h-2 rounded-full bg-primary mt-1.5" />
              </div>
              <div className="flex-1">
                <p className="text-sm">
                  <span className="font-medium">
                    <Tx k="consent.statistics" source="to count the pages you visit" />
                  </span>
                  <span className="text-muted-foreground">
                    {' '}
                    <Tx k="consent.statistics_desc" source="(statistics)" />
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-1">
                <div className="w-2 h-2 rounded-full bg-primary mt-1.5" />
              </div>
              <div className="flex-1">
                <p className="text-sm">
                  <span className="font-medium">
                    <Tx k="consent.marketing_benefit" source="to serve you relevant" />
                  </span>
                  <span className="text-muted-foreground">
                    {' '}
                    <Tx k="consent.marketing_desc" source="promotions (marketing)" />
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-border pt-6" />

          {/* Detailed info */}
          {showDetails && (
            <div className="space-y-4 text-sm text-muted-foreground">
              <p>
                <Tx
                  k="consent.detailed_info"
                  source="Click 'Accept all' to give us your consent to use cookies for all these purposes. You can also use the toggles below to consent to specific purposes."
                />
              </p>
              <p>
                <Tx
                  k="consent.withdraw_info"
                  source="Withdraw or change your consent at any time by visiting your Privacy Settings. Read more about how we use cookies and other technologies to collect personal data:"
                />
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <Link href="/privacy" className="text-primary hover:underline font-medium">
                  <Tx k="consent.privacy_policy" source="Privacy Policy" />
                </Link>
                <span className="text-muted-foreground">•</span>
                <Link href="/cookies" className="text-primary hover:underline font-medium">
                  <Tx k="consent.cookie_policy" source="Cookie Policy" />
                </Link>
              </div>
            </div>
          )}

          {/* Show details toggle */}
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-primary hover:text-primary/80 text-sm font-medium transition-colors"
          >
            {showDetails ? '▼' : '▶'}{" "}
            {showDetails ? (
              <Tx k="consent.hide_details" source="Hide details" />
            ) : (
              <Tx k="consent.show_details" source="Show details" />
            )}
          </button>

          {/* Cookie Categories with toggles */}
          <div className="space-y-4 border-t border-border pt-6">
            {/* Strictly necessary */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <h4 className="font-semibold text-sm mb-1">
                  <Tx k="consent.strictly_necessary" source="Strictly necessary" />
                </h4>
                <p className="text-xs text-muted-foreground">
                  <Tx
                    k="consent.strictly_necessary_desc"
                    source="Always enabled. Required for sign-in and security."
                  />
                </p>
              </div>
              <ToggleSwitch
                id="essential"
                checked={true}
                onChange={() => {}}
                disabled={true}
              />
            </div>

            {/* Functional */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <h4 className="font-semibold text-sm mb-1">
                  <Tx k="consent.functional" source="Functional" />
                </h4>
                <p className="text-xs text-muted-foreground">
                  <Tx
                    k="consent.functional_toggle_desc"
                    source="Enhance your experience with personalized features."
                  />
                </p>
              </div>
              <ToggleSwitch
                id="functional"
                checked={preferences.analytics}
                onChange={(checked) =>
                  setPreferences({ ...preferences, analytics: checked })
                }
              />
            </div>

            {/* Statistical */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <h4 className="font-semibold text-sm mb-1">
                  <Tx k="consent.statistical" source="Statistical" />
                </h4>
                <p className="text-xs text-muted-foreground">
                  <Tx
                    k="consent.statistical_toggle_desc"
                    source="Help us understand usage to improve the site."
                  />
                </p>
              </div>
              <ToggleSwitch
                id="statistical"
                checked={preferences.analytics}
                onChange={(checked) =>
                  setPreferences({ ...preferences, analytics: checked })
                }
              />
            </div>

            {/* Marketing */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <h4 className="font-semibold text-sm mb-1">
                  <Tx k="consent.marketing" source="Marketing" />
                </h4>
                <p className="text-xs text-muted-foreground">
                  <Tx
                    k="consent.marketing_toggle_desc"
                    source="Personalize ads and measure campaign performance."
                  />
                </p>
              </div>
              <ToggleSwitch
                id="marketing"
                checked={preferences.marketing}
                onChange={(checked) =>
                  setPreferences({ ...preferences, marketing: checked })
                }
              />
            </div>
          </div>
        </div>

        {/* Footer with buttons */}
        <div className="border-t border-border px-8 py-6 flex gap-3 flex-col-reverse sm:flex-row flex-shrink-0 bg-muted/30">
          <Button
            onClick={handleDeclineAll}
            variant="outline"
            className="flex-1 font-medium h-11"
          >
            <Tx k="consent.decline_all" source="Decline all" />
          </Button>
          <Button
            onClick={handleSavePreferences}
            variant="secondary"
            className="flex-1 font-medium h-11"
          >
            <Tx k="consent.save_settings" source="Save settings" />
          </Button>
          <Button
            onClick={handleAcceptAll}
            className="flex-1 bg-primary hover:bg-primary/90 font-medium h-11"
          >
            <Tx k="consent.accept_all" source="Accept all" />
          </Button>
        </div>
      </div>
    </div>
  );
}
