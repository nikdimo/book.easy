"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Tx, interpolate, useI18n } from "@/lib/i18n/client";
import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  TITLE_MAX,
  TITLE_MIN,
  listingBasicsIssues,
  type BasicsIssue,
} from "@/lib/host/v2/listing-basics";
import type { ListingSpaceTypeValue } from "@/lib/types/listing-space-type";
import type { PropertyTypeOption } from "@/lib/types/property-type";
import { ListingFlowFooter } from "./listing-flow-footer";
import { useHostStartDraft } from "./host-start-draft-provider";

/** Which of the two halves of this step is on screen. Both live in one route: the pair
 *  is a single decision for the host — what the place is called, and how it reads — and
 *  keeping them in one component is what lets the text survive moving between them
 *  without a draft ever being written. */
type DescriptionView = "title" | "description";

/**
 * Phase two, step three: the listing's title and description.
 *
 * UI-only, like every other screen in the create flow — nothing is saved, no draft is
 * created, and there is no form to submit. The flow still carries its state in the URL,
 * so what the host types here lives in this component until integration wires the whole
 * phase up to a real listing.
 *
 * The limits and the trim-before-counting rule come from `listing-basics`, the same
 * module the post-publish editor enforces, so a title accepted here is a title the
 * editor accepts later.
 */
export function DescriptionStep({
  propertyType,
  spaceType,
  initialView = "title",
  initialTitle = "",
  initialDescription = "",
}: {
  propertyType: PropertyTypeOption;
  spaceType: ListingSpaceTypeValue;
  /** Test seam, and the reason the second half is reachable in a static render. */
  initialView?: DescriptionView;
  initialTitle?: string;
  initialDescription?: string;
}) {
  const query = `propertyType=${encodeURIComponent(propertyType.value)}&spaceType=${encodeURIComponent(spaceType)}`;
  const { data, save } = useHostStartDraft();
  const [view, setView] = useState<DescriptionView>(initialView);
  const [title, setTitle] = useState(data.title ?? initialTitle);
  const [description, setDescription] = useState(data.description ?? initialDescription);
  /** The errors appear once the host has tried to move on, not while they are still
   *  typing the fifth character. One flag per half: leaving the title in an error state
   *  should not greet the host with a red description they have not written yet. */
  const [titleTouched, setTitleTouched] = useState(false);
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const router = useRouter();
  /** So a refused Next puts the caret back in the field the host has to fix, rather than
   *  leaving it on the footer with an error they have to go looking for. */
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  const issues = listingBasicsIssues({ title, description });

  return view === "title" ? (
    <>
      <main className="flex min-h-0 flex-1 px-5 pb-28 pt-6 md:items-center md:px-8 md:pb-24 md:pt-2">
        <div className="mx-auto w-full max-w-[39rem]">
          <h1 className="font-heading text-[1.75rem] font-semibold tracking-[-0.03em] text-slate-950 sm:text-[2rem]">
            <Tx k="host.v2.description.title_heading" source="Give your place a title" />
          </h1>
          <p className="mt-1.5 text-sm leading-6 text-slate-500">
            <Tx
              k="host.v2.description.title_hint"
              source="Short titles work best. You can change it anytime."
            />
          </p>
          <Field
            id="listing-flow-title"
            length={title.trim().length}
            min={TITLE_MIN}
            max={TITLE_MAX}
            issue={titleTouched ? issues.title : undefined}
          >
            {(field) => (
              <input
                {...field}
                ref={titleRef}
                type="text"
                // The host's own copy: the page-level Google translation is a reading
                // aid, and must never rewrite what a host is typing.
                className="notranslate w-full rounded-2xl border border-slate-300 px-4 py-4 font-heading text-xl leading-8 tracking-[-0.01em] text-slate-950 outline-none placeholder:text-slate-400 focus:border-slate-950 sm:text-2xl"
                translate="no"
                maxLength={TITLE_MAX}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                onBlur={() => setTitleTouched(true)}
              />
            )}
          </Field>
        </div>
      </main>
      <ListingFlowFooter
        backHref={`/host/start/photos?${query}`}
        onNext={() => {
          setTitleTouched(true);
          if (issues.title) {
            titleRef.current?.focus();
            return;
          }
          setView("description");
        }}
        phaseOneProgress={100}
        phaseTwoProgress={60}
        nextLabel="Next"
      />
    </>
  ) : (
    <>
      <main className="flex min-h-0 flex-1 px-5 pb-28 pt-6 md:items-center md:px-8 md:pb-24 md:pt-2">
        <div className="mx-auto w-full max-w-[39rem]">
          <h1 className="font-heading text-[1.75rem] font-semibold tracking-[-0.03em] text-slate-950 sm:text-[2rem]">
            <Tx k="host.v2.description.description_heading" source="Create your description" />
          </h1>
          <p className="mt-1.5 text-sm leading-6 text-slate-500">
            <Tx
              k="host.v2.description.description_hint"
              source="Share what makes your place special."
            />
          </p>
          <Field
            id="listing-flow-description"
            length={description.trim().length}
            min={DESCRIPTION_MIN}
            max={DESCRIPTION_MAX}
            issue={descriptionTouched ? issues.description : undefined}
          >
            {(field) => (
              <textarea
                {...field}
                ref={descriptionRef}
                className="notranslate h-[clamp(9rem,30vh,17rem)] w-full resize-none rounded-2xl border border-slate-300 px-4 py-4 text-base leading-7 text-slate-950 outline-none placeholder:text-slate-400 focus:border-slate-950"
                translate="no"
                maxLength={DESCRIPTION_MAX}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                onBlur={() => setDescriptionTouched(true)}
              />
            )}
          </Field>
        </div>
      </main>
      <ListingFlowFooter
        // Back returns to the title half in place, so the typed title is still there.
        // The href is the same route, and only matters if JS has not taken over yet.
        backHref={`/host/start/description?${query}`}
        onBack={() => setView("title")}
        // Gated the same way the title is, so the minimum the editor enforces later is
        // the minimum the host meets here. Navigating in the handler rather than
        // linking is what lets the check run at all — and the title half is already a
        // handler, so this view is only reachable with JS anyway.
        onNext={async () => {
          setDescriptionTouched(true);
          if (issues.description) {
            descriptionRef.current?.focus();
            return;
          }
          // Both halves are re-checked here, not just this one: the title is saved by
          // the same patch, and a host who reached this view before an edit made the
          // title invalid must not write it.
          if (issues.title) {
            setTitleTouched(true);
            setView("title");
            return;
          }
          if (await save({ title: title.trim(), description: description.trim(), currentStepId: "pricing" })) {
            router.push(`/host/start/phase-two-complete?${query}`);
          }
        }}
        phaseOneProgress={100}
        phaseTwoProgress={80}
        nextLabel="Next"
      />
    </>
  );
}

/**
 * One field with its counter and error, wired for screen readers.
 *
 * The counter and the error are both `aria-describedby` targets, so the box is
 * announced with its count and "Needs at least 5 characters" rather than leaving them
 * as loose text after it. The copy is the editor's, deliberately: a host meets the same
 * numbers before and after publishing.
 */
function Field({
  id,
  length,
  min,
  max,
  issue,
  children,
}: {
  id: string;
  /** Trimmed length — the number the rules are actually applied to. */
  length: number;
  min: number;
  max: number;
  issue: BasicsIssue | undefined;
  children: (field: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby": string;
  }) => React.ReactNode;
}) {
  const { resolve } = useI18n();
  const countId = `${id}-count`;
  const errorId = `${id}-error`;

  const message = issue ? interpolate(issueTemplate(resolve, issue), { min, max }).text : null;

  return (
    <div className="mt-[clamp(1rem,3vh,2rem)]">
      {children({
        id,
        "aria-invalid": Boolean(issue),
        "aria-describedby": `${countId}${issue ? ` ${errorId}` : ""}`,
      })}
      <div className="mt-2 flex items-start justify-between gap-4">
        {/* Always in the tree, so the live region is there to announce into rather than
            being created at the moment it has something to say. */}
        <p id={errorId} role="alert" className="text-sm text-rose-600 empty:hidden">
          {message}
        </p>
        <span
          id={countId}
          // Counting up to the minimum answers the only question a host has early on;
          // after that the ceiling is the useful number.
          className={`ml-auto shrink-0 text-sm tabular-nums ${length > max ? "text-rose-600" : "text-slate-500"}`}
          translate="no"
        >
          {
            interpolate(
              length < min
                ? resolve("host.editor.basics.counter_min", "{count}/{min} minimum")
                : resolve("host.editor.basics.counter_max", "{count}/{max}"),
              { count: length, min, max },
            ).text
          }
        </span>
      </div>
    </div>
  );
}

function issueTemplate(
  resolve: (key: string, source: string) => { text: string; translated: boolean },
  issue: BasicsIssue,
) {
  switch (issue) {
    case "EMPTY":
      return resolve("host.editor.basics.error_empty", "Guests need this to book.");
    case "TOO_SHORT":
      return resolve("host.editor.basics.error_too_short", "Needs at least {min} characters.");
    case "TOO_LONG":
      return resolve("host.editor.basics.error_too_long", "Can be at most {max} characters.");
  }
}
