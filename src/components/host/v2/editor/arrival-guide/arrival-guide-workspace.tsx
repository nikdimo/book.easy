import Link from "next/link";
import { ArrowRight, Clock3, Info, LogIn, LogOut } from "lucide-react";
import { ARRIVAL_GUIDE_UNAVAILABLE_TOPICS } from "@/lib/host/v2/listing-arrival-guide";
import { FLEXIBLE_STAY_TIME } from "@/lib/host/v2/listing-house-rules";
import { Tx } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { EDITOR_GROUP_HEADING } from "@/components/host/v2/editor/editor-group";

/**
 * Read-only arrival guidance until dedicated, access-controlled storage exists.
 *
 * Stay times are summarized here because they matter on arrival, but House rules is
 * their only editor. That keeps one source of truth and prevents two tabs from appearing
 * to own the same setting. Door codes and passwords are not accepted at all: today the
 * booking chat is the only appropriately private place to send them to a confirmed
 * guest.
 */
export function ArrivalGuideWorkspace({
  listingId,
  checkInTime,
  checkOutTime,
}: {
  listingId: string;
  checkInTime: string;
  checkOutTime: string;
}) {
  return (
    <div className="mx-auto w-full max-w-2xl py-6 pb-12 md:py-10 md:pb-14">
      {/* Named by the rail, the browser tab and the active chip on a phone. Kept in the
          outline for screen readers, which have no rail to read. */}
      <header>
        <h1 className="sr-only">
          <Tx k="host.editor.arrival_guide.heading" source="Arrival guide" />
        </h1>
        <p className="text-sm leading-6 text-slate-600">
          <Tx
            k="host.editor.arrival_guide.intro"
            source="Help guests understand what they need for arrival. Sensitive access details are shared in booking chat until secure guide storage is available."
          />
        </p>
      </header>

      <section
        className="mt-8 rounded-xl border border-slate-200 bg-white p-4"
        aria-labelledby="arrival-window-heading"
      >
        <h2
          id="arrival-window-heading"
          className={cn("flex items-center gap-2", EDITOR_GROUP_HEADING)}
        >
          <Clock3 className="size-4 shrink-0 text-slate-500" aria-hidden />
          <Tx
            k="host.editor.arrival_guide.window_heading"
            source="Arrival and departure times"
          />
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          <Tx
            k="host.editor.arrival_guide.window_owner"
            source="These times are managed in House rules so there is one place to change them."
          />
        </p>

        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <StayTimeSummary
            icon={LogIn}
            label={<Tx k="host.editor.arrival_guide.check_in_label" source="Check-in from" />}
            value={checkInTime}
          />
          <StayTimeSummary
            icon={LogOut}
            label={<Tx k="host.editor.arrival_guide.check_out_label" source="Check-out by" />}
            value={checkOutTime}
          />
        </dl>

        <Link
          href={`/host/listings/${listingId}/house-rules`}
          className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-slate-900 underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
        >
          <Tx k="host.editor.arrival_guide.open_house_rules" source="Open House rules" />
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </section>

      <UnavailableTopics />
    </div>
  );
}

function StayTimeSummary({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof LogIn;
  label: React.ReactNode;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-3">
      <dt className="flex items-center gap-2 text-xs text-slate-500">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-slate-900">
        {value === FLEXIBLE_STAY_TIME ? (
          <Tx
            k="host.editor.arrival_guide.flexible"
            source="Flexible — agree with the guest"
          />
        ) : (
          <span className="notranslate tabular-nums" translate="no">
            {value}
          </span>
        )}
      </dd>
    </div>
  );
}

function UnavailableTopics() {
  return (
    <section
      className="mt-8 rounded-xl border border-slate-200 bg-white p-4"
      aria-labelledby="arrival-unavailable-heading"
    >
      <h2
        id="arrival-unavailable-heading"
        className={cn("flex items-center gap-2", EDITOR_GROUP_HEADING)}
      >
        <Info className="size-4 shrink-0 text-slate-500" aria-hidden />
        <Tx
          k="host.editor.arrival_guide.unavailable_heading"
          source="Not stored on your listing yet"
        />
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        <Tx
          k="host.editor.arrival_guide.unavailable_intro"
          source="These topics need dedicated storage and guest-access rules before they can be edited here:"
        />
      </p>
      <ul className="mt-3 space-y-1.5 text-sm leading-6 text-slate-600">
        {ARRIVAL_GUIDE_UNAVAILABLE_TOPICS.map((topic) => (
          <li key={topic.key} className="flex gap-2">
            <span aria-hidden className="text-slate-300">
              •
            </span>
            <Tx k={topic.key} source={topic.source} />
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        <Tx
          k="host.editor.arrival_guide.unavailable_advice"
          source="Send door codes, key instructions and Wi-Fi passwords to a confirmed guest in booking chat. Never put them in the public listing description."
        />
      </p>
    </section>
  );
}
