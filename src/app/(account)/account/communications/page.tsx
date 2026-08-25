import { saveCommunicationPreferences } from "@/lib/actions/communication-preference.actions";
import { requireUserPage } from "@/lib/auth-helpers";
import {
  getUserCommunicationSettings,
} from "@/lib/services/marketing-consent.service";
import { Checkbox } from "@/components/ui/checkbox";
import { getT, T, t } from "@/lib/i18n/t";

export const metadata = { title: "Communication preferences" };

function Toggle({
  name,
  defaultChecked,
  title,
  description,
}: {
  name: string;
  defaultChecked: boolean;
  title: string;
  description: string;
}) {
  return (
    <label className="flex items-start gap-4 rounded-xl border p-4">
      <Checkbox
        name={name}
        defaultChecked={defaultChecked}
        className="mt-1"
      />
      <span>
        <span className="block font-medium">{title}</span>
        <span className="mt-1 block text-sm text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

export default async function CommunicationsPage() {
  const translator = await getT();
  const session = await requireUserPage("/account/communications");
  const settings = await getUserCommunicationSettings(session.id);
  const audience = settings.user.isHost ? "HOST" : "GUEST";
  const emailPreference = settings.marketing.find(
    (item) => item.channel === "EMAIL" && item.audience === audience
  );
  const pushPreference = settings.marketing.find(
    (item) => item.channel === "PUSH" && item.audience === audience
  );
  const emailSubscribed = emailPreference?.status === "SUBSCRIBED";
  const emailPending = emailPreference?.status === "PENDING";
  const marketingDescription = (channel: "EMAIL" | "PUSH") => {
    if (channel === "EMAIL" && audience === "GUEST") return t(translator, "account.communications.consent.email_guest", "I would like to receive travel inspiration, special offers and news from Linger Homes by email. I can unsubscribe at any time.");
    if (channel === "EMAIL") return t(translator, "account.communications.consent.email_host", "I would like to receive hosting inspiration, product news and special offers from Linger Homes by email. I can unsubscribe at any time.");
    if (audience === "GUEST") return t(translator, "account.communications.consent.push_guest", "I would like to receive travel inspiration and special offers from Linger Homes by push notification. I can turn these off at any time.");
    return t(translator, "account.communications.consent.push_host", "I would like to receive hosting inspiration, product news and special offers from Linger Homes by push notification. I can turn these off at any time.");
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-semibold"><T t={translator} k="account.communications.heading" source="Communication preferences" /></h1>
      <p className="mt-3 text-muted-foreground">
        <T t={translator} k="account.communications.intro_booking" source="Promotional communication is optional. Essential account, security, listing, messaging, and active-booking messages cannot be disabled while those services are in use." />
      </p>
      <form action={saveCommunicationPreferences} className="mt-8 space-y-8">
        <section>
          <h2 className="text-xl font-semibold"><T t={translator} k="account.communications.service" source="Service communication" /></h2>
          <div className="mt-4 space-y-3">
            <Toggle
              name="messageEmail"
              defaultChecked={settings.operational.messageEmail}
              title={t(translator, "account.communications.message_email", "New message emails")}
              description={t(translator, "account.communications.message_email_description", "Email me when a guest, host, or support agent sends a message.")}
            />
            <Toggle
              name="reviewEmail"
              defaultChecked={settings.operational.reviewEmail}
              title={t(translator, "account.communications.review_email", "Review reminders")}
              description={t(translator, "account.communications.review_email_description", "Remind me to review a completed stay.")}
            />
            <Toggle
              name="operationalPush"
              defaultChecked={settings.operational.operationalPush}
              title={t(translator, "account.communications.service_push", "Service push notifications")}
              description={t(translator, "account.communications.service_push_description", "Booking, message, listing, and account updates on registered devices.")}
            />
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold"><T t={translator} k="account.communications.marketing" source="Optional marketing" /></h2>
          <div className="mt-4 space-y-3">
            <Toggle
              name="marketingEmail"
              defaultChecked={emailSubscribed || emailPending}
              title={t(translator, "account.communications.marketing_email", "Marketing by email")}
              description={marketingDescription("EMAIL")}
            />
            {emailPending && (
              <p className="text-sm text-amber-700">
                <T t={translator} k="account.communications.pending" source="Confirmation pending. Check your inbox; you are not subscribed until you confirm." />
              </p>
            )}
            <Toggle
              name="marketingPush"
              defaultChecked={pushPreference?.status === "SUBSCRIBED"}
              title={t(translator, "account.communications.marketing_push", "Marketing push notifications")}
              description={marketingDescription("PUSH")}
            />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            <T t={translator} k="account.communications.marketing_note" source="Turning email marketing off immediately suppresses all promotional email, for both guest and host content. No login is required to use links in marketing emails." />
          </p>
        </section>

        <button className="rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground">
          <T t={translator} k="account.communications.save" source="Save preferences" />
        </button>
      </form>
    </div>
  );
}
