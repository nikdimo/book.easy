'use client';

import { useEffect, useState } from 'react';
import { X, ChevronDown } from 'lucide-react';
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
  if (!measurementId || window.gtag) return;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  const gtag = (...args: GtagArguments) => {
    window.dataLayer.push(args);
  };
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', measurementId);
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
          // Ignore malformed browser storage and keep the safe defaults.
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
        'fixed inset-0 z-50 bg-black/50 transition-opacity duration-300',
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
        {/* Header */}
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-start justify-between">
          <div className="flex-1 pr-8">
            <h2 className="text-xl font-semibold mb-2">
              <Tx k="consent.title" source="We respect your privacy" />
            </h2>
            <p className="text-sm text-muted-foreground">
              <Tx
                k="consent.description"
                source="We use cookies to improve your experience, understand how the site is used, and personalize content. You control your preferences."
              />
            </p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 hover:bg-muted rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
            <span className="sr-only">
              <Tx k="common.close" source="Close" />
            </span>
          </button>
        </div>

        {/* Expandable Details */}
        <div
          className={cn(
            'max-w-7xl mx-auto px-6 transition-all duration-300 overflow-hidden',
            isExpanded ? 'max-h-96 mb-6' : 'max-h-0'
          )}
        >
          <div className="space-y-4 pt-4 border-t border-border">
            {/* Essential */}
            <div className="flex items-start gap-4">
              <input
                type="checkbox"
                id="essential"
                checked={preferences.essential}
                disabled
                className="mt-1 w-4 h-4 rounded cursor-not-allowed"
              />
              <div className="flex-1">
                <label htmlFor="essential" className="font-medium text-sm block mb-1">
                  <Tx k="consent.essential_cookies" source="Essential cookies" />
                </label>
                <p className="text-xs text-muted-foreground">
                  <Tx
                    k="consent.essential_description"
                    source="Required for sign-in, security, and basic site functions. These are always enabled."
                  />
                </p>
              </div>
              <span className="text-xs bg-muted px-2 py-1 rounded">
                <Tx k="consent.always_on" source="Always on" />
              </span>
            </div>

            {/* Analytics */}
            <div className="flex items-start gap-4">
              <input
                type="checkbox"
                id="analytics"
                checked={preferences.analytics}
                onChange={(e) =>
                  setPreferences({ ...preferences, analytics: e.target.checked })
                }
                className="mt-1 w-4 h-4 rounded cursor-pointer"
              />
              <div className="flex-1">
                <label htmlFor="analytics" className="font-medium text-sm block mb-1">
                  <Tx k="consent.analytics_cookies" source="Analytics cookies" />
                </label>
                <p className="text-xs text-muted-foreground">
                  <Tx
                    k="consent.analytics_description"
                    source="Help us understand how the site is used so we can improve it. The data is anonymized."
                  />
                </p>
              </div>
            </div>

            {/* Marketing */}
            <div className="flex items-start gap-4">
              <input
                type="checkbox"
                id="marketing"
                checked={preferences.marketing}
                onChange={(e) =>
                  setPreferences({ ...preferences, marketing: e.target.checked })
                }
                className="mt-1 w-4 h-4 rounded cursor-pointer"
              />
              <div className="flex-1">
                <label htmlFor="marketing" className="font-medium text-sm block mb-1">
                  <Tx k="consent.marketing_cookies" source="Marketing cookies" />
                </label>
                <p className="text-xs text-muted-foreground">
                  <Tx
                    k="consent.marketing_description"
                    source="Personalize advertising and measure campaign performance. You can opt out at any time."
                  />
                </p>
              </div>
            </div>

            {/* Privacy Links */}
            <div className="pt-4 border-t border-border flex gap-4 text-xs">
              <Link href="/privacy" className="text-primary hover:underline">
                <Tx k="consent.privacy_policy" source="Privacy Policy" />
              </Link>
              <Link href="/cookies" className="text-primary hover:underline">
                <Tx k="consent.cookie_policy" source="Cookie Policy" />
              </Link>
              <Link href="/terms" className="text-primary hover:underline">
                <Tx k="consent.terms_of_service" source="Terms of Service" />
              </Link>
            </div>
          </div>
        </div>

        {/* Toggle Button */}
        <div className="max-w-7xl mx-auto px-6">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 text-sm text-primary hover:underline mb-6 transition-colors"
          >
            {isExpanded ? (
              <Tx k="consent.hide_details" source="Hide details" />
            ) : (
              <Tx k="consent.show_details" source="Show details" />
            )}
            <ChevronDown className={cn('w-4 h-4 transition-transform', isExpanded && 'rotate-180')} />
          </button>
        </div>

        {/* Actions */}
        <div className="max-w-7xl mx-auto px-6 pb-6 flex gap-3 flex-col sm:flex-row">
          <Button
            onClick={handleRejectAll}
            variant="outline"
            className="flex-1"
          >
            <Tx k="consent.reject_all" source="Reject all" />
          </Button>

          {isExpanded && (
            <Button
              onClick={handleSavePreferences}
              variant="secondary"
              className="flex-1"
            >
              <Tx k="consent.save_preferences" source="Save preferences" />
            </Button>
          )}

          <Button
            onClick={handleAcceptAll}
            className="flex-1 bg-primary hover:bg-primary/90"
          >
            <Tx k="consent.accept_all" source="Accept all" />
          </Button>
        </div>
      </div>
    </div>
  );
}

declare global {
  type GtagArguments = [command: string, value: Date | string];

  interface Window {
    gtag?: (...args: GtagArguments) => void;
    dataLayer: GtagArguments[];
  }
}
