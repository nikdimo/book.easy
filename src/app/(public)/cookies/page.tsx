/* eslint-disable react/no-unescaped-entities -- Long-form legal prose is clearer in source form. */
import { Metadata } from "next";
import Link from "next/link";
import { PRIVACY_EMAIL } from "@/lib/branding";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "How we use cookies and tracking technologies",
};

export default function CookiesPage() {
  return (
    <div className="min-h-screen bg-background py-12">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-4xl font-bold mb-2">Cookie Policy</h1>
        <p className="text-muted-foreground mb-8">
          Last updated: July 2026 | Effective date: July 1, 2026
        </p>

        <article className="prose prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. What Are Cookies?</h2>
            <p>
              Cookies are small text files stored on your device (computer, phone, tablet) when
              you visit a website. They help websites remember information about you and your
              preferences. Cookies are not programs and cannot contain viruses or malware.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">2. Types of Cookies We Use</h2>

            <h3 className="text-xl font-semibold mb-3">2.1 Essential/Necessary Cookies</h3>
            <p>
              <strong>These cookies are required for the Site to function properly.</strong> They
              are enabled by default and you cannot opt-out. Without these cookies, services you
              request cannot be provided.
            </p>
            <div className="bg-muted/50 p-4 rounded space-y-3">
              <div>
                <h4 className="font-semibold">Authentication Cookies</h4>
                <p className="text-sm text-muted-foreground">
                  <strong>Name:</strong> next-auth.session-token, next-auth.csrf-token
                  <br />
                  <strong>Purpose:</strong> Keeps you logged in, stores your session ID
                  <br />
                  <strong>Expiry:</strong> 24 hours
                </p>
              </div>
              <div>
                <h4 className="font-semibold">Language & Localization</h4>
                <p className="text-sm text-muted-foreground">
                  <strong>Name:</strong> googtrans
                  <br />
                  <strong>Purpose:</strong> Remembers your language preference
                  <br />
                  <strong>Expiry:</strong> 30 days
                </p>
              </div>
              <div>
                <h4 className="font-semibold">Security & CSRF Protection</h4>
                <p className="text-sm text-muted-foreground">
                  <strong>Name:</strong> csrf-token, __Host-* cookies
                  <br />
                  <strong>Purpose:</strong> Protects against cross-site request forgery attacks
                  <br />
                  <strong>Expiry:</strong> Session (browser close)
                </p>
              </div>
            </div>

            <h3 className="text-xl font-semibold mb-3 mt-6">2.2 Analytics Cookies</h3>
            <p>
              <strong>These cookies help us understand how you use the Site.</strong> They collect
              data about how many people visit, which pages are popular, and error logging. This
              data is anonymized and aggregated.
            </p>
            <div className="bg-muted/50 p-4 rounded space-y-3">
              <div>
                <h4 className="font-semibold">User Engagement Tracking</h4>
                <p className="text-sm text-muted-foreground">
                  <strong>Data Collected:</strong> Pages visited, time on site, clicks, search
                  queries
                  <br />
                  <strong>Purpose:</strong> Improve site performance and user experience
                  <br />
                  <strong>Consent Required:</strong> Yes (opt-in via cookie banner)
                  <br />
                  <strong>Retention:</strong> 14 months (then aggregated/anonymized)
                </p>
              </div>
            </div>

            <h3 className="text-xl font-semibold mb-3 mt-6">2.3 Marketing Cookies</h3>
            <p>
              <strong>These cookies help us track advertising effectiveness and personalize marketing
              messages.</strong> They may be shared with advertising partners to serve relevant
              ads.
            </p>
            <div className="bg-muted/50 p-4 rounded space-y-3">
              <div>
                <h4 className="font-semibold">Remarketing & Advertising</h4>
                <p className="text-sm text-muted-foreground">
                  <strong>Data Collected:</strong> Browsing history, interests, conversion tracking
                  <br />
                  <strong>Purpose:</strong> Show you relevant ads and measure campaign performance
                  <br />
                  <strong>Consent Required:</strong> Yes (opt-in via cookie banner)
                  <br />
                  <strong>Partners:</strong> Google Ads, Facebook Ads, Resend
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">3. IP Address Hashing</h2>
            <p>
              To protect your privacy, we don't store your raw IP address. Instead:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Your IP address is combined with your User Agent (browser info)
              </li>
              <li>
                This combination is hashed using a secure algorithm (one-way encryption)
              </li>
              <li>
                Only the hash is stored in analytics (the original IP cannot be recovered)
              </li>
              <li>
                This allows us to count unique visitors without identifying individuals
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. Third-Party Cookies</h2>
            <p>
              Third-party services may set cookies on our Site. These include:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Google Sign-In:</strong> Sets cookies for authentication (necessary)
              </li>
              <li>
                <strong>Google Analytics:</strong> Sets analytics cookies (consent-based)
              </li>
              <li>
                <strong>Resend Email Service:</strong> May set marketing cookies (consent-based)
              </li>
              <li>
                <strong>Map Provider (Leaflet/Mapbox):</strong> May set performance cookies (necessary)
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5. Do Not Track (DNT)</h2>
            <p>
              Some browsers include a "Do Not Track" feature. We currently do not respond to DNT
              browser signals, but we do respect your cookie preferences selected via our consent
              banner. If you have DNT enabled, you can still manage cookies in your browser
              settings.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. How to Control Cookies</h2>

            <h3 className="text-xl font-semibold mb-3">6.1 Via Our Consent Banner</h3>
            <p>
              When you first visit the Site, a banner appears allowing you to:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Accept all cookies</li>
              <li>Accept only essential cookies</li>
              <li>Customize your preferences for each category</li>
              <li>Reject all non-essential cookies</li>
            </ul>
            <p className="mt-3">
              You can change your preferences at any time by clicking the cookie settings icon in
              the footer or your account settings.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">6.2 Via Your Browser</h3>
            <p>
              Most browsers allow you to refuse cookies or alert you when cookies are being set.
              Instructions for popular browsers:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Chrome:</strong> Settings → Privacy and Security → Cookies and other site
                data
              </li>
              <li>
                <strong>Firefox:</strong> Preferences → Privacy & Security → Cookies and Site Data
              </li>
              <li>
                <strong>Safari:</strong> Preferences → Privacy → Cookies and website data
              </li>
              <li>
                <strong>Edge:</strong> Settings → Privacy and Security → Cookies and other site
                data
              </li>
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">
              <strong>Note:</strong> Disabling essential cookies may prevent the Site from
              functioning properly.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">6.3 Opt-Out Links</h3>
            <p>
              <strong>Google Analytics Opt-out:</strong>{" "}
              <a
                href="https://tools.google.com/dlpage/gaoptout"
                className="text-primary hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Click here to opt-out globally
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. Cookie Consent & Storage</h2>
            <p>
              When you consent to cookies, we store your preference in our database to remember
              your choice across devices and sessions. This ensures:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>You only see the banner once per device</li>
              <li>Your preferences persist when you log in on different devices</li>
              <li>You can update preferences anytime without re-consenting to essential cookies</li>
              <li>We can demonstrate compliance if requested</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">8. GDPR Compliance</h2>
            <p>
              We comply with GDPR requirements for cookies:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Consent Before Non-Essential:</strong> We obtain opt-in consent before
                setting analytics and marketing cookies
              </li>
              <li>
                <strong>Granular Control:</strong> You can choose which cookie categories to accept
              </li>
              <li>
                <strong>Easy Withdrawal:</strong> You can change your preferences anytime
              </li>
              <li>
                <strong>Transparency:</strong> We clearly disclose what cookies we use and why
              </li>
              <li>
                <strong>No Dark Patterns:</strong> Rejecting all cookies is as easy as accepting all
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">9. Changes to This Policy</h2>
            <p>
              We may update this Cookie Policy to reflect changes in our cookie use or legal
              requirements. We will notify you of material changes by updating the "Last updated"
              date above.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">10. Contact Us</h2>
            <p>
              Questions about our cookie practices? Contact us at {PRIVACY_EMAIL}
            </p>
            <p className="mt-4">
              See our <Link href="/privacy" className="text-primary hover:underline">
                Privacy Policy
              </Link>{" "}
              for more information about how we handle your data.
            </p>
          </section>
        </article>
      </div>
    </div>
  );
}
