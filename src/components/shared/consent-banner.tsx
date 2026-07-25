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
        className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-background border border-border rounded-lg shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with close button */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 className="text-lg font-bold">
            <Tx k="consent.dialog_title" source="We use cookies" />
          </h2>
          {canClose && (
            <button
              onClick={handleClose}
              className="p-1 hover:bg-muted rounded transition-colors flex-shrink-0"
            >
              <X className="w-5 h-5" />
              <span className="sr-only">
                <Tx k="common.close" source="Close" />
              </span>
            </button>
          )}
        </div>

        {/* Main content */}
        <p className="text-sm text-muted-foreground mb-4">
          <Tx
            k="consent.intro"
            source="We use cookies to collect information about you. We use this information:"
          />
        </p>

        {/* Cookie purposes list */}
        <ol className="list-decimal list-inside text-sm space-y-2 mb-6 text-muted-foreground">
          <li>
            <span className="font-medium">
              <Tx k="consent.functional_benefit" source="to give you a better experience" />
            </span>
            {' '}
            <Tx k="consent.functional_desc" source="of our website (functional)" />
          </li>
          <li>
            <span className="font-medium">
              <Tx k="consent.statistics" source="to count the pages you visit" />
            </span>
            {' '}
            <Tx k="consent.statistics_desc" source="(statistics)" />
          </li>
          <li>
            <span className="font-medium">
              <Tx k="consent.marketing_benefit" source="to serve you relevant" />
            </span>
            {' '}
            <Tx k="consent.marketing_desc" source="promotions (marketing)" />
          </li>
        </ol>

        {/* Detailed info */}
        {showDetails && (
          <div className="mb-6 pb-4 border-b border-border space-y-3 text-sm text-muted-foreground">
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
            <div className="flex flex-wrap gap-2 pt-2">
              <Link href="/privacy" className="text-primary hover:underline font-medium">
                <Tx k="consent.privacy_policy" source="Privacy Policy" />
              </Link>
              <span className="text-muted-foreground">
                <Tx k="common.and" source="and" />
              </span>
              <Link href="/cookies" className="text-primary hover:underline font-medium">
                <Tx k="consent.cookie_policy" source="Cookie Policy" />
              </Link>
            </div>
          </div>
        )}

        {/* Show details toggle */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-primary hover:text-primary/80 text-sm font-medium transition-colors mb-6 underline"
        >
          {showDetails ? (
            <Tx k="consent.hide_details" source="Hide details" />
          ) : (
            <Tx k="consent.show_details" source="Show details" />
          )}
        </button>

        {/* Main buttons */}
        <div className="flex gap-3 mb-6">
          <Button
            onClick={handleDeclineAll}
            variant="outline"
            className="flex-1 font-medium"
          >
            <Tx k="consent.decline_all" source="Decline all" />
          </Button>
          <Button
            onClick={handleAcceptAll}
            className="flex-1 bg-primary hover:bg-primary/90 font-medium"
          >
            <Tx k="consent.accept_all" source="Accept all" />
          </Button>
        </div>

        {/* Cookie toggles below buttons */}
        <div className="space-y-3 text-xs">
          {/* Strictly necessary */}
          <div className="flex items-center justify-between gap-3">
            <label className="flex-1">
              <h4 className="font-semibold text-foreground">
                <Tx k="consent.strictly_necessary" source="Strictly necessary" />
              </h4>
            </label>
            <ToggleSwitch
              id="essential"
              checked={true}
              onChange={() => {}}
              disabled={true}
            />
          </div>

          {/* Functional */}
          <div className="flex items-center justify-between gap-3">
            <label className="flex-1">
              <h4 className="font-semibold text-foreground">
                <Tx k="consent.functional" source="Functional" />
              </h4>
            </label>
            <ToggleSwitch
              id="functional"
              checked={preferences.analytics}
              onChange={(checked) =>
                setPreferences({ ...preferences, analytics: checked })
              }
            />
          </div>

          {/* Statistical */}
          <div className="flex items-center justify-between gap-3">
            <label className="flex-1">
              <h4 className="font-semibold text-foreground">
                <Tx k="consent.statistical" source="Statistical" />
              </h4>
            </label>
            <ToggleSwitch
              id="statistical"
              checked={preferences.analytics}
              onChange={(checked) =>
                setPreferences({ ...preferences, analytics: checked })
              }
            />
          </div>

          {/* Marketing */}
          <div className="flex items-center justify-between gap-3">
            <label className="flex-1">
              <h4 className="font-semibold text-foreground">
                <Tx k="consent.marketing" source="Marketing" />
              </h4>
            </label>
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
    </div>
  );
}
