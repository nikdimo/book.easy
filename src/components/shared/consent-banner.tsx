'use client';

import { useEffect, useState } from 'react';
import { X, ChevronDown, Lock } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Tx } from '@/lib/i18n/client';

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
  if ((window as any).gtag) return;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);

  (window as any).dataLayer = (window as any).dataLayer || [];
  (window as any).gtag = function () {
    (window as any).dataLayer.push(arguments);
  };
  (window as any).gtag('js', new Date());
  (window as any).gtag('config', measurementId);
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

export function ConsentBanner() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [preferences, setPreferences] = useState<ConsentPreferences>({
    essential: true,
    analytics: false,
    marketing: false,
  });
  const [mounted, setMounted] = useState(false);
  const [consentDate, setConsentDate] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;

      const stored = localStorage.getItem('consent-preferences');
      const consentGiven = localStorage.getItem('consent-given');

      if (!consentGiven) {
        setIsOpen(true);
      } else if (stored) {
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

      if (consentGiven) {
        try {
          const date = new Date(consentGiven);
          setConsentDate(date.toLocaleDateString());
        } catch {
          // Ignore date parsing errors
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

  const handleRejectAll = () => {
    const minimalConsent = {
      essential: true,
      analytics: false,
      marketing: false,
    };
    savePreferences(minimalConsent);
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

  if (!mounted || !isOpen) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity duration-300',
        isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
      )}
      onClick={() => isExpanded && setIsExpanded(false)}
    >
      <div
        className={cn(
          'absolute bottom-0 left-0 right-0 bg-background border-t border-border shadow-2xl transition-all duration-300 transform',
          isOpen ? 'translate-y-0' : 'translate-y-full'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with icon */}
        <div className="max-w-5xl mx-auto px-6 py-8 md:py-10 flex items-start justify-between gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Lock className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">
                <Tx k="consent.title" source="We respect your privacy" />
              </h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed mb-2">
              <Tx
                k="consent.description"
                source="We use cookies to enhance your experience, analyze how you use our site, and show you relevant content. You're in control."
              />
            </p>
            {consentDate && (
              <p className="text-xs text-muted-foreground">
                Last updated: {consentDate}
              </p>
            )}
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-muted rounded-lg transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Expandable Details */}
        <div
          className={cn(
            'max-w-5xl mx-auto px-6 transition-all duration-300 overflow-hidden',
            isExpanded ? 'max-h-96 mb-6' : 'max-h-0'
          )}
        >
          <div className="space-y-5 pt-6 border-t border-border">
            {/* Essential */}
            <div className="flex items-start justify-between gap-4 pb-4">
              <div className="flex-1">
                <label htmlFor="essential" className="font-semibold text-sm block mb-1">
                  <Tx k="consent.essential_cookies" source="Essential Cookies" />
                </label>
                <p className="text-xs text-muted-foreground">
                  <Tx
                    k="consent.essential_description"
                    source="Required for sign-in, security, and basic functions. Always enabled."
                  />
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <ToggleSwitch
                  id="essential"
                  checked={preferences.essential}
                  onChange={() => {}}
                  disabled={true}
                />
                <span className="text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded whitespace-nowrap">
                  <Tx k="consent.always_on" source="Always on" />
                </span>
              </div>
            </div>

            {/* Analytics */}
            <div className="flex items-start justify-between gap-4 pb-4 border-t border-border pt-5">
              <div className="flex-1">
                <label htmlFor="analytics" className="font-semibold text-sm block mb-1">
                  <Tx k="consent.analytics_cookies" source="Analytics Cookies" />
                </label>
                <p className="text-xs text-muted-foreground">
                  <Tx
                    k="consent.analytics_description"
                    source="Help us understand usage to improve your experience. Data is anonymized."
                  />
                </p>
              </div>
              <ToggleSwitch
                id="analytics"
                checked={preferences.analytics}
                onChange={(checked) =>
                  setPreferences({ ...preferences, analytics: checked })
                }
              />
            </div>

            {/* Marketing */}
            <div className="flex items-start justify-between gap-4 pb-5 border-t border-border pt-5">
              <div className="flex-1">
                <label htmlFor="marketing" className="font-semibold text-sm block mb-1">
                  <Tx k="consent.marketing_cookies" source="Marketing Cookies" />
                </label>
                <p className="text-xs text-muted-foreground">
                  <Tx
                    k="consent.marketing_description"
                    source="Personalize content and measure campaign performance. Opt out anytime."
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

            {/* Privacy Links */}
            <div className="pt-4 border-t border-border flex flex-wrap gap-2 text-xs">
              <Link href="/privacy" className="text-primary hover:text-primary/80 font-medium hover:underline">
                Privacy Policy
              </Link>
              <span className="text-muted-foreground">•</span>
              <Link href="/cookies" className="text-primary hover:text-primary/80 font-medium hover:underline">
                Cookie Policy
              </Link>
              <span className="text-muted-foreground">•</span>
              <Link href="/terms" className="text-primary hover:text-primary/80 font-medium hover:underline">
                Terms of Service
              </Link>
            </div>
          </div>
        </div>

        {/* Toggle Details Button */}
        <div className="max-w-5xl mx-auto px-6">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 font-medium mb-6 transition-colors"
          >
            <ChevronDown
              className={cn('w-4 h-4 transition-transform duration-200', isExpanded && 'rotate-180')}
            />
            {isExpanded ? 'Hide details' : 'Show details'}
          </button>
        </div>

        {/* Action Buttons */}
        <div className="max-w-5xl mx-auto px-6 pb-8 flex gap-3 flex-col-reverse sm:flex-row">
          <Button
            onClick={handleRejectAll}
            variant="outline"
            className="flex-1 font-medium h-10"
          >
            Reject All
          </Button>

          {isExpanded && (
            <Button
              onClick={handleSavePreferences}
              variant="secondary"
              className="flex-1 font-medium h-10"
            >
              Save Preferences
            </Button>
          )}

          <Button
            onClick={handleAcceptAll}
            className="flex-1 bg-primary hover:bg-primary/90 font-medium h-10"
          >
            Accept All
          </Button>
        </div>
      </div>
    </div>
  );
}
