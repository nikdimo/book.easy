import { saveCommunicationPreferences } from "@/lib/actions/communication-preference.actions";
import { requireUserPage } from "@/lib/auth-helpers";
import {
  getUserCommunicationSettings,
  marketingConsentText,
} from "@/lib/services/marketing-consent.service";

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
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-1 h-5 w-5"
      />
      <span>
        <span className="block font-medium">{title}</span>
        <span className="mt-1 block text-sm text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

export default async function CommunicationsPage() {
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

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-semibold">Communication preferences</h1>
      <p className="mt-3 text-muted-foreground">
        Promotional communication is optional. Essential security, payment, listing, and
        active-booking messages cannot be disabled while those services are in use.
      </p>
      <form action={saveCommunicationPreferences} className="mt-8 space-y-8">
        <section>
          <h2 className="text-xl font-semibold">Service communication</h2>
          <div className="mt-4 space-y-3">
            <Toggle
              name="messageEmail"
              defaultChecked={settings.operational.messageEmail}
              title="New message emails"
              description="Email me when a guest, host, or support agent sends a message."
            />
            <Toggle
              name="reviewEmail"
              defaultChecked={settings.operational.reviewEmail}
              title="Review reminders"
              description="Remind me to review a completed stay."
            />
            <Toggle
              name="operationalPush"
              defaultChecked={settings.operational.operationalPush}
              title="Service push notifications"
              description="Booking, message, listing, and account updates on registered devices."
            />
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Optional marketing</h2>
          <div className="mt-4 space-y-3">
            <Toggle
              name="marketingEmail"
              defaultChecked={emailSubscribed || emailPending}
              title="Marketing by email"
              description={marketingConsentText("EMAIL", audience)}
            />
            {emailPending && (
              <p className="text-sm text-amber-700">
                Confirmation pending. Check your inbox; you are not subscribed until you confirm.
              </p>
            )}
            <Toggle
              name="marketingPush"
              defaultChecked={pushPreference?.status === "SUBSCRIBED"}
              title="Marketing push notifications"
              description={marketingConsentText("PUSH", audience)}
            />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Turning email marketing off immediately suppresses all promotional email, for both
            guest and host content. No login is required to use links in marketing emails.
          </p>
        </section>

        <button className="rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground">
          Save preferences
        </button>
      </form>
    </div>
  );
}
