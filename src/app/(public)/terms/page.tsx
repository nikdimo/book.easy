/* eslint-disable react/no-unescaped-entities -- Long-form legal prose is clearer in source form. */
import { Metadata } from "next";
import Link from "next/link";
import { SITE_DOMAIN, SUPPORT_EMAIL } from "@/lib/branding";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Legal terms and conditions for using our platform",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background py-12">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-4xl font-bold mb-2">Terms of Service</h1>
        <p className="text-muted-foreground mb-8">
          Last updated: July 2026 | Effective date: July 1, 2026
        </p>

        <article className="prose prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
            <p>
              By accessing and using {SITE_DOMAIN} ("Site"), including all associated mobile
              applications and services (collectively, the "Service"), you agree to be bound by
              these Terms of Service ("Terms"). If you do not agree to all of these Terms, do not
              use the Service.
            </p>
            <p>
              We reserve the right to modify these Terms at any time. Your continued use of the
              Service following the posting of revised Terms means that you accept and agree to
              the changes. It is your responsibility to check these Terms periodically for
              changes.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">2. Eligibility</h2>
            <p>
              To use the Service, you must:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Be at least 18 years old (or the age of majority in your jurisdiction)</li>
              <li>Have the legal capacity to enter into binding contracts</li>
              <li>Agree to comply with all applicable laws and regulations</li>
              <li>Not be prohibited by law from using the Service</li>
              <li>Not have been previously suspended or banned from the Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">3. Account Registration & Responsibility</h2>

            <h3 className="text-xl font-semibold mb-3">3.1 Creating an Account</h3>
            <p>
              To access certain features, you must create an account and provide accurate,
              complete, and current information. You agree to:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Maintain the confidentiality of your password</li>
              <li>Accept responsibility for all activities under your account</li>
              <li>Notify us immediately of unauthorized access</li>
              <li>Provide truthful information (identity fraud is grounds for termination)</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6">3.2 Account Termination</h3>
            <p>
              We may suspend or terminate your account if you:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Violate these Terms</li>
              <li>Engage in fraudulent or illegal activity</li>
              <li>Harm other users or their property</li>
              <li>Violate our content policies</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. Booking & Guest Responsibilities</h2>

            <p className="rounded-lg border border-border bg-muted/40 p-4">
              <strong>How payment works.</strong> Linger Homes does not collect or hold booking
              payments. We do not charge you, process payments, verify or protect them, issue
              refunds, or pay hosts out. Payment is arranged directly with the host after the
              booking is accepted, on terms the two of you agree.
            </p>

            <h3 className="text-xl font-semibold mb-3">4.1 Requesting a Booking</h3>
            <p>
              The Service operates on a request-to-book basis. When you send a booking request
              through the Service:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Your request is not a confirmed booking until the host accepts it</li>
              <li>
                If the host accepts, you are entering into a binding contract with the property
                host
              </li>
              <li>You agree to the listed house rules and cancellation policy</li>
              <li>The price displayed is the price agreed with the host; we add no fees</li>
              <li>You are responsible for knowing check-in/check-out times</li>
              <li>
                We do not charge you at any point. The host arranges payment with you directly
                after accepting your request
              </li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6">4.2 Cancellations</h3>
            <p>
              Cancellation terms are determined by the host's policy (Flexible, Moderate, or
              Strict), as shown on the listing at the time you send your request.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Host must approve most cancellations within 48 hours</li>
              <li>
                Because we never hold your money, we cannot issue a refund. Anything you paid
                the host is returned, or not, by the host under their own policy
              </li>
              <li>
                We are not a party to any payment between you and a host and are not responsible
                for the outcome of one
              </li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6">4.3 Guest Conduct</h3>
            <p>
              As a guest, you must:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Treat the property and host's belongings with respect</li>
              <li>Follow house rules and local laws</li>
              <li>Not exceed the maximum occupancy</li>
              <li>Not host parties or sublease without permission</li>
              <li>Report damage immediately to the host</li>
              <li>Leave the property in the condition you found it</li>
            </ul>
            <p className="mt-3">
              Guests may be held liable for damages beyond normal wear and tear. Excessive
              damages may result in account suspension and legal action.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5. Hosting & Property Responsibilities</h2>

            <h3 className="text-xl font-semibold mb-3">5.1 Listing Requirements</h3>
            <p>
              Property listings must be:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Accurate and up-to-date (you must update within 7 days of changes)</li>
              <li>Legal and compliant with local zoning/rental laws</li>
              <li>Safe and meet minimum habitability standards</li>
              <li>Contain truthful photos and descriptions</li>
              <li>Disclose all fees, rules, and restrictions</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6">5.2 Host Conduct</h3>
            <p>
              As a host, you must:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Respond to booking inquiries within 24 hours</li>
              <li>Provide safe, clean accommodations</li>
              <li>Respect guests' privacy and property</li>
              <li>Not discriminate based on protected characteristics</li>
              <li>Maintain accurate availability calendar</li>
              <li>Honor confirmed bookings (cancellation requires justification)</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6">5.3 Payment</h3>
            <p>
              We charge no service fee on bookings and we do not pay hosts out. After accepting a
              request, the host arranges payment with the guest directly and receives it directly.
              Hosts are responsible for:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Agreeing payment terms and a method with the guest</li>
              <li>Issuing any receipt or invoice the guest is entitled to</li>
              <li>Handling their own refunds under their stated cancellation policy</li>
              <li>Applicable taxes on the amount they receive</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6">5.4 Host Liability</h3>
            <p>
              Hosts are responsible for:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Property damage caused by negligence or policy violation</li>
              <li>Ensuring the property complies with local laws</li>
              <li>Obtaining necessary permits and insurance</li>
              <li>Maintaining accurate tax records</li>
              <li>Paying all applicable local taxes and fees</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. Prohibited Conduct</h2>
            <p>
              You agree not to use the Service to:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Engage in fraud, scams, or deceptive practices</li>
              <li>Harass, threaten, or discriminate against others</li>
              <li>Infringe on intellectual property rights</li>
              <li>Post illegal content or facilitate illegal activity</li>
              <li>Bypass our security systems</li>
              <li>Interfere with the Service's operation</li>
              <li>Scrape or collect data without authorization</li>
              <li>Create fake accounts or impersonate others</li>
              <li>Spam or send unsolicited communications</li>
              <li>Engage in sexual exploitation or trafficking</li>
            </ul>
            <p className="mt-3">
              Violations may result in account suspension, legal action, and reporting to
              authorities.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. Intellectual Property Rights</h2>
            <p>
              The Service, including all text, graphics, logos, images, and software, is owned or
              licensed by book.easy and protected by copyright and trademark law. You may not:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Reproduce, modify, or distribute our content without permission</li>
              <li>Use our trademarks or logos without authorization</li>
              <li>Reverse-engineer or decompile the Service</li>
            </ul>
            <p className="mt-3">
              User-generated content (photos, reviews, messages) remains your property, but you
              grant us a license to use it for displaying listings and improving the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">8. Reviews & Ratings</h2>
            <p>
              Reviews must be:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Truthful and based on genuine experience</li>
              <li>Free from hate speech, harassment, or discrimination</li>
              <li>Not solicited in exchange for money or favors</li>
              <li>About the property or host conduct (not unrelated complaints)</li>
            </ul>
            <p className="mt-3">
              We may remove reviews that violate these rules. Fake reviews or manipulation may
              result in account suspension.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">9. Dispute Resolution</h2>

            <h3 className="text-xl font-semibold mb-3">9.1 Resolution Center</h3>
            <p>
              If a dispute arises between guest and host, either party can open a case in our
              Resolution Center. We will:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Review all evidence provided</li>
              <li>Make a determination based on our policies</li>
              <li>Record the outcome and act on the accounts involved where warranted</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6">9.2 Payment Disputes</h3>
            <p>
              We do not hold the money, so we cannot move it. A dispute about an amount paid to a
              host is between you and that host, and any refund must come from them. We can record
              the dispute, take account action, and provide what we hold about the booking.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">10. Disclaimers & Limitations of Liability</h2>

            <h3 className="text-xl font-semibold mb-3">10.1 "As-Is" Service</h3>
            <p>
              The Service is provided "as-is" without warranties of any kind, express or implied.
              We do not guarantee:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Uninterrupted or error-free operation</li>
              <li>Accuracy of listings or user information</li>
              <li>Safety or security of transactions</li>
              <li>Guest or host conduct</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6">10.2 Limitation of Liability</h3>
            <p>
              To the maximum extent permitted by law, book.easy shall not be liable for:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Indirect, incidental, special, or consequential damages (lost profits, data,
                reputation)
              </li>
              <li>Damage to property or personal injury</li>
              <li>Host or guest conduct or violations of laws</li>
              <li>Unauthorized account access or data breaches</li>
              <li>Third-party service failures (email, hosting, mapping)</li>
            </ul>
            <p className="mt-3">
              <strong>Total Liability Cap:</strong> Our total liability shall not exceed the total
              amount, if any, you have paid us in the past 12 months. We currently charge no fees
              for the Service.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">10.3 User Assumption of Risk</h3>
            <p>
              You acknowledge that:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>You are responsible for evaluating properties and hosts</li>
              <li>You should meet hosts and inspect properties before booking</li>
              <li>You assume all risk of booking through our platform</li>
              <li>You release us from liability for property or guest issues</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">11. Indemnification</h2>
            <p>
              You agree to indemnify and hold harmless book.easy and its officers, employees, and
              agents from any claims, damages, or costs arising from:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Your breach of these Terms</li>
              <li>Your violation of applicable laws</li>
              <li>Your conduct on the Service</li>
              <li>Claims by third parties related to your use of the Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">12. Privacy & Data Protection</h2>
            <p>
              Your use of the Service is subject to our{" "}
              <Link href="/privacy" className="text-primary hover:underline">
                Privacy Policy
              </Link>{" "}
              and{" "}
              <Link href="/cookies" className="text-primary hover:underline">
                Cookie Policy
              </Link>
              . Please review these policies to understand our practices.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">13. Third-Party Links & Services</h2>
            <p>
              The Service may contain links to third-party websites and services. We are not
              responsible for their content, policies, or practices. Your use of third-party
              services is at your own risk and subject to their terms and privacy policies.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">14. Termination</h2>
            <p>
              We may terminate or suspend your account and access to the Service at any time, for
              any reason, with or without notice. Upon termination:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Your right to use the Service immediately ceases</li>
              <li>Pending booking requests may be cancelled</li>
              <li>
                Anything you owe a host directly remains owed to that host and is unaffected
              </li>
              <li>Your data is handled according to our Privacy Policy</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">15. Governing Law & Dispute Resolution</h2>
            <p>
              <strong>Governing Law:</strong> These Terms are governed by the laws of North
              Macedonia, without regard to conflict of law principles.
            </p>
            <p className="mt-3">
              <strong>Dispute Resolution:</strong> Any dispute shall first be attempted to be
              resolved through our Resolution Center. If not resolved, disputes shall be governed
              by the laws of North Macedonia and handled through our support process before any
              legal action.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">16. Severability</h2>
            <p>
              If any provision of these Terms is found to be invalid or unenforceable, that
              provision shall be severed and the remaining provisions shall continue in full force
              and effect.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">17. Contact Us</h2>
            <p>
              Questions about these Terms? Contact us at {SUPPORT_EMAIL}
            </p>
          </section>
        </article>
      </div>
    </div>
  );
}
