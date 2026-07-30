/* eslint-disable react/no-unescaped-entities -- Long-form legal prose is clearer in source form. */
import { Metadata } from "next";
import Link from "next/link";
import { PRIVACY_EMAIL, SITE_DOMAIN } from "@/lib/branding";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How we collect, use, and protect your personal data",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background py-12">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground mb-8">
          Last updated: July 2026 | Effective date: July 1, 2026
        </p>

        <article className="prose prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
            <p>
              book.easy ("we," "us," "our," or "Company") respects your privacy and is committed
              to protecting it through our compliance with this privacy policy. This policy
              describes the types of information we collect from you when you use our website at{" "}
              <strong>{SITE_DOMAIN}</strong> (the "Site"), our mobile applications, and related
              services (collectively, the "Service"), and how we collect, use, disclose, and
              otherwise process that information.
            </p>
            <p>
              This Privacy Policy applies to information we collect from you when you:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Visit and interact with our Site</li>
              <li>Make a booking or listing on our platform</li>
              <li>Create an account with us</li>
              <li>Contact our customer support</li>
              <li>Participate in surveys or promotional activities</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">2. Information We Collect</h2>

            <h3 className="text-xl font-semibold mb-3">2.1 Information You Provide Directly</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Account Information:</strong> Name, email address, phone number, profile
                picture, password, and bio when you create an account
              </li>
              <li>
                <strong>Booking Information:</strong> Check-in/check-out dates, number of guests,
                special requests, and payment information
              </li>
              <li>
                <strong>Listing Information:</strong> Property details, descriptions, photos,
                pricing, availability, and house rules (if you are a host)
              </li>
              <li>
                <strong>Communication:</strong> Messages you send to other users, reviews, ratings,
                and support inquiries
              </li>
              <li>
                <strong>Payment Data:</strong> We do not directly collect credit card data; payment
                processing is handled by third-party payment processors
              </li>
              <li>
                <strong>Preferences:</strong> Language settings, saved listings (favorites), and
                notification preferences
              </li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6">2.2 Information Collected Automatically</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Device Information:</strong> Browser type, device type, operating system,
                IP address (hashed for analytics), user agent
              </li>
              <li>
                <strong>Usage Data:</strong> Pages visited, time spent on site, referral sources,
                search queries, and clicks (via cookies and analytics tools)
              </li>
              <li>
                <strong>Location Data:</strong> City/country inferred from IP address for
                localization and map centering (not precise geolocation). If you
                explicitly choose &quot;Use my current location&quot; while creating a
                listing, your browser may also provide precise coordinates after asking
                for permission. Listing addresses and selected map coordinates are
                processed by our mapping provider to search for and verify locations.
              </li>
              <li>
                <strong>Cookies:</strong> Session cookies for authentication and analytics cookies
                (with your consent)
              </li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6">2.3 Information from Third Parties</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Social Login:</strong> If you use Google Sign-In, we receive your name,
                email, and profile picture from Google
              </li>
              <li>
                <strong>Payment Processors:</strong> Transaction confirmations and fraud prevention
                data
              </li>
              <li>
                <strong>Analytics Providers:</strong> Aggregated usage patterns and user behavior
                data
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">3. Legal Basis for Processing (GDPR)</h2>
            <p>
              We process your personal data on the following lawful bases under GDPR Article 6:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Contractual Necessity:</strong> Processing required to provide the booking,
                hosting, and communication services you request
              </li>
              <li>
                <strong>Consent:</strong> Analytics and non-essential cookies through cookie
                settings, and separate affirmative consent for each marketing channel. Accepting
                marketing cookies does not subscribe you to email or push marketing.
              </li>
              <li>
                <strong>Legal Obligation:</strong> Anti-fraud detection, tax compliance, and
                regulatory reporting
              </li>
              <li>
                <strong>Legitimate Interest:</strong> Site security, preventing abuse, improving
                service quality, and fraud prevention
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. How We Use Your Information</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>To create and maintain your account</li>
              <li>To process bookings and payments</li>
              <li>To connect hosts and guests for communication</li>
              <li>To send transactional emails (booking confirmations, cancellations)</li>
              <li>To improve and optimize the Site and Service</li>
              <li>To detect and prevent fraud and abuse</li>
              <li>To comply with legal obligations</li>
              <li>To send marketing communications (only with your consent)</li>
              <li>To analyze usage patterns and trends (analytics)</li>
              <li>To respond to your support inquiries</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5. Data Retention</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Account Data:</strong> Retained for as long as your account is active, or
                as required by law (typically 7 years for tax records)
              </li>
              <li>
                <strong>Booking Records:</strong> Retained for 7 years for tax and audit purposes
              </li>
              <li>
                <strong>Analytics Data:</strong> Typically retained for 14 months; older data is
                aggregated and anonymized
              </li>
              <li>
                <strong>Session Data:</strong> Automatically deleted after 24 hours of inactivity
              </li>
              <li>
                <strong>Marketing Data:</strong> Active preferences are retained while used.
                Consent evidence and a minimal suppression record may be retained after withdrawal
                for the applicable limitation period so we can demonstrate compliance and avoid
                contacting you again.
              </li>
              <li>
                <strong>Inactive Accounts:</strong> May be purged after 2 years of inactivity,
                after notification
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. How We Share Your Information</h2>

            <h3 className="text-xl font-semibold mb-3">6.1 Host-to-Guest Communication</h3>
            <p>
              Your email and basic profile information is visible to users you communicate with
              on the platform (other guests see limited info; hosts see booking details).
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">6.2 Service Providers</h3>
            <p>We share data with third parties who help us operate the Service:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Email Delivery Provider:</strong> Delivery of account, booking, and
                consented marketing email
              </li>
              <li>
                <strong>Payment Processors:</strong> Payment authorization and processing
              </li>
              <li>
                <strong>Analytics Providers:</strong> Usage patterns (anonymized where possible)
              </li>
              <li>
                <strong>Cloud Infrastructure:</strong> Database and server hosting
              </li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6">6.3 Legal Requirements</h3>
            <p>
              We may disclose your information if required by law, court order, or government
              request, or to protect our legal rights and safety.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">6.4 Business Transfers</h3>
            <p>
              If book.easy is acquired or merged, your information may be transferred as part of
              that transaction. We will notify you of any such change.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. Data Security</h2>
            <p>
              We implement industry-standard security measures to protect your personal data
              against unauthorized access, alteration, disclosure, or destruction. However, no
              transmission over the Internet is 100% secure. We cannot guarantee absolute
              security, but we take reasonable precautions including:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>HTTPS encryption for all data in transit</li>
              <li>Database encryption at rest</li>
              <li>Regular security audits and penetration testing</li>
              <li>Restricted access to personal data (employees with need-to-know only)</li>
              <li>Secure password hashing and session management</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">8. Your Rights Under GDPR</h2>
            <p>
              If you are located in the EU, you have the following rights regarding your personal
              data:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Right to Access:</strong> Request a copy of the data we hold about you
              </li>
              <li>
                <strong>Right to Rectification:</strong> Correct inaccurate or incomplete data
              </li>
              <li>
                <strong>Right to Erasure ("Right to be Forgotten"):</strong> Request deletion of
                your data (subject to legal retention requirements)
              </li>
              <li>
                <strong>Right to Restrict Processing:</strong> Limit how we use your data
              </li>
              <li>
                <strong>Right to Data Portability:</strong> Receive a copy of your data in a
                portable format
              </li>
              <li>
                <strong>Right to Object:</strong> Opt-out of marketing and certain processing
              </li>
              <li>
                <strong>Right to Withdraw Consent:</strong> Withdraw consent for optional data
                processing
              </li>
              <li>
                <strong>Right to Lodge a Complaint:</strong> File a complaint with your local data
                protection authority
              </li>
            </ul>
            <p className="mt-4">
              To exercise any of these rights, contact us at{" "}
              <strong>{PRIVACY_EMAIL}</strong>.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">9. Cookies & Tracking Technologies</h2>
            <p>
              We use cookies and similar tracking technologies. See our{" "}
              <Link href="/cookies" className="text-primary hover:underline">
                Cookie Policy
              </Link>{" "}
              for details.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">10. Children's Privacy</h2>
            <p>
              Our Service is not intended for children under 16. We do not knowingly collect
              personal information from children under 16. If we learn we have collected data from
              a child under 16 without parental consent, we will promptly delete it. If you
              believe we have inadvertently collected data from a child, please contact us
              immediately.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">11. Third-Party Links</h2>
            <p>
              Our Site may contain links to third-party websites. We are not responsible for their
              privacy practices. We encourage you to review their privacy policies before
              providing any personal information.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">12. International Data Transfers</h2>
            <p>
              Your data may be transferred to, stored in, and processed in countries other than
              your country of residence, including countries that may not have the same data
              protection laws. By using our Service, you consent to such transfers. We implement
              Standard Contractual Clauses or Binding Corporate Rules where required by GDPR.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">13. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material
              changes by updating the "Last updated" date above and, if the change is significant,
              by sending you an email or displaying a prominent notice on the Site. Your continued
              use of the Service constitutes your acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">14. Contact Us</h2>
            <p>
              If you have questions, concerns, or requests regarding this Privacy Policy or our
              privacy practices, please contact us:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Email:</strong> {PRIVACY_EMAIL}
              </li>
              <li>
                <strong>Data Protection Officer (DPO):</strong> {PRIVACY_EMAIL}
              </li>
              <li>
                <strong>Mailing Address:</strong> book.easy, Inc., North Macedonia
              </li>
              <li>
                <strong>Response Time:</strong> We will respond to data requests within 30 days
              </li>
            </ul>
          </section>

          <section className="bg-muted/50 p-6 rounded-lg">
            <h2 className="text-lg font-semibold mb-3">Data Subject Rights Request Form</h2>
            <p className="mb-3">
              To exercise your GDPR rights, please{" "}
              <Link href="/account" className="text-primary hover:underline">
                contact our support
              </Link>{" "}
              with:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-sm">
              <li>Your name and email address</li>
              <li>Type of request (Access, Deletion, Correction, etc.)</li>
              <li>Any relevant details (dates, booking IDs)</li>
              <li>Proof of identity if you're not logged in</li>
            </ul>
          </section>
        </article>
      </div>
    </div>
  );
}
