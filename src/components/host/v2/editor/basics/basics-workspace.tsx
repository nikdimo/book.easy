"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { beginSave, endSave } from "@/components/host/v2/editor/save-state";
import { updateListingBasics } from "@/lib/actions/listing-basics.actions";
import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  TITLE_MAX,
  TITLE_MIN,
  listingBasicsIssues,
  type BasicsIssue,
} from "@/lib/host/v2/listing-basics";
import {
  planBasicsAutosave,
  readBasicsSaveResult,
} from "@/lib/host/v2/listing-basics-autosave";
import { Tx, interpolate, useI18n } from "@/lib/i18n/client";

/** Long enough that a host typing a sentence is not saved mid-word, short enough that
 *  looking up at the header after a pause shows "Saved" rather than nothing. */
const AUTOSAVE_DELAY = 800;

/**
 * The Title & description section.
 *
 * Two fields, no save button: the header reports the state and the debounce decides
 * when. Local state is authoritative while the host is typing — the server's answer is
 * only used to settle what "last saved" means, never to overwrite the box under a
 * cursor.
 *
 * The inputs are `notranslate` on purpose. This is the host's original copy, and the
 * page-level Google translation of a listing's own words is a *reading* aid: if the
 * widget rewrote the textarea, the next autosave would store the machine translation as
 * the listing's real description. Hosts reading in another language get the translated
 * preview below instead, which is the same text guests see.
 */
export function BasicsWorkspace({
  listingId,
  title: initialTitle,
  description: initialDescription,
}: {
  listingId: string;
  title: string;
  description: string;
}) {
  const { resolve, requestedLocale } = useI18n();

  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  /** What the server is known to hold, so an unchanged field never costs a round trip. */
  const saved = useRef({ title: initialTitle, description: initialDescription });
  /** Latest local draft, including changes made while an earlier save is in flight. */
  const latest = useRef({ title: initialTitle, description: initialDescription });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);
  const mounted = useRef(true);
  const flushRef = useRef<() => Promise<void>>(async () => {});
  /** Errors appear once a field has been left, or once a save has been refused — not
   *  while the host is still typing the fifth character of a title. */
  const [touched, setTouched] = useState({ title: false, description: false });

  const issues = listingBasicsIssues({ title, description });

  const flush = useCallback(
    async () => {
      // Serialize writes. Otherwise a slow earlier request can land after a newer one
      // and put the listing back to text the host has already replaced.
      if (saving.current) return;

      // An incomplete draft is not a failed save — the host is mid-sentence. The field
      // says what is missing; the header stays quiet until there is something to store.
      const plan = planBasicsAutosave(latest.current, saved.current);
      if (plan.action === "skip") return;

      saving.current = true;
      beginSave();
      try {
        const outcome = readBasicsSaveResult(
          plan.value,
          await updateListingBasics(listingId, plan.value),
        );
        if (outcome.status === "failed") {
          endSave(true);
          if (mounted.current && outcome.issues) {
            setTouched({ title: true, description: true });
          }
          if (mounted.current && outcome.message) toast.error(outcome.message);
          return;
        }
        saved.current = outcome.saved;
        endSave();
      } catch {
        endSave(true);
        if (mounted.current) {
          toast.error(
            resolve(
              "host.editor.basics.save_failed",
              "We couldn't save that. Check your connection — your text is still here.",
            ).text,
          );
        }
      } finally {
        saving.current = false;
        // A newer valid draft may have arrived during the request. Flush it after the
        // first write settles; failed unchanged drafts wait for the host to retry/edit.
        if (planBasicsAutosave(latest.current, plan.value).action === "save") {
          void flushRef.current();
        }
      }
    },
    [listingId, resolve],
  );

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const schedule = useCallback((next: { title: string; description: string }) => {
    latest.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void flushRef.current();
    }, AUTOSAVE_DELAY);
  }, []);

  const flushNow = useCallback((next: { title: string; description: string }) => {
    latest.current = next;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    void flushRef.current();
  }, []);

  // Navigating to another editor section must not drop a valid draft that is still
  // inside the debounce window.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      void flushRef.current();
    };
  }, []);

  const titleLabel = resolve("host.editor.basics.title_label", "Title").text;
  const descriptionLabel = resolve(
    "host.editor.basics.description_label",
    "Description",
  ).text;

  return (
    <div className="mx-auto w-full max-w-2xl py-6 md:py-10">
      {/* Named by the rail, the browser tab and the active chip on a phone. Kept in the
          outline for screen readers, which have no rail to read. */}
      <header>
        <h1 className="sr-only">
          <Tx k="host.editor.basics.heading" source="Title & description" />
        </h1>
        <p className="text-sm leading-6 text-slate-600">
          <Tx
            k="host.editor.basics.intro"
            source="This is what guests read first — in search results, and at the top of your listing page."
          />
        </p>
      </header>

      <div className="mt-8 space-y-8">
        <Field
          id="listing-title"
          label={titleLabel}
          hint={
            resolve(
              "host.editor.basics.title_hint",
              "Name the place and what makes it worth the trip.",
            ).text
          }
          length={title.trim().length}
          min={TITLE_MIN}
          max={TITLE_MAX}
          issue={touched.title ? issues.title : undefined}
        >
          {(field) => (
            <Input
              {...field}
              className="notranslate"
              translate="no"
              maxLength={TITLE_MAX}
              value={title}
              onChange={(event) => {
                const nextTitle = event.target.value;
                setTitle(nextTitle);
                schedule({ title: nextTitle, description });
              }}
              onBlur={() => {
                setTouched((current) => ({ ...current, title: true }));
                flushNow({ title, description });
              }}
              placeholder={
                resolve(
                  "host.editor.basics.title_placeholder",
                  "Modern apartment near the center",
                ).text
              }
            />
          )}
        </Field>

        <Field
          id="listing-description"
          label={descriptionLabel}
          hint={
            resolve(
              "host.editor.basics.description_hint",
              "Describe the stay, the layout, and the neighborhood.",
            ).text
          }
          length={description.trim().length}
          min={DESCRIPTION_MIN}
          max={DESCRIPTION_MAX}
          issue={touched.description ? issues.description : undefined}
        >
          {(field) => (
            <Textarea
              {...field}
              className="notranslate min-h-56"
              translate="no"
              maxLength={DESCRIPTION_MAX}
              rows={10}
              value={description}
              onChange={(event) => {
                const nextDescription = event.target.value;
                setDescription(nextDescription);
                schedule({ title, description: nextDescription });
              }}
              onBlur={() => {
                setTouched((current) => ({ ...current, description: true }));
                flushNow({ title, description });
              }}
              placeholder={
                resolve(
                  "host.editor.basics.description_placeholder",
                  "Describe the stay, layout, neighborhood, and what makes it easy to book.",
                ).text
              }
            />
          )}
        </Field>

        {requestedLocale.split("-")[0] !== "en" ? (
          <TranslatedPreview title={title} description={description} />
        ) : null}
      </div>
    </div>
  );
}

/**
 * Label, control, help line and error for one field.
 *
 * The counter and the error are both `aria-describedby` targets, so a screen reader
 * hears "83/100" and "Needs at least 5 characters" as description of the box rather
 * than as loose text somewhere after it.
 */
function Field({
  id,
  label,
  hint,
  length,
  min,
  max,
  issue,
  children,
}: {
  id: string;
  label: string;
  hint: string;
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
  const hintId = `${id}-hint`;
  const countId = `${id}-count`;
  const errorId = `${id}-error`;

  const message = issue
    ? interpolate(issueTemplate(resolve, issue), { min, max }).text
    : null;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-900">
        {label}
      </label>
      <p id={hintId} className="mt-1 text-sm leading-6 text-slate-600">
        {hint}
      </p>
      <div className="mt-2">
        {children({
          id,
          "aria-invalid": Boolean(issue),
          "aria-describedby": `${hintId} ${countId}${issue ? ` ${errorId}` : ""}`,
        })}
      </div>
      <div className="mt-1.5 flex items-start justify-between gap-4">
        {/* Always in the tree, so the live region is there to announce into rather than
            being created at the moment it has something to say. */}
        <p
          id={errorId}
          role="alert"
          className="text-sm text-rose-600 empty:hidden md:text-xs"
        >
          {message}
        </p>
        <span
          id={countId}
          // Counting up to the minimum answers the only question a host has early on;
          // after that the ceiling is the useful number.
          className={`ml-auto shrink-0 text-sm tabular-nums md:text-xs ${
            length > max ? "text-rose-600" : "text-slate-500"
          }`}
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
      return resolve(
        "host.editor.basics.error_too_short",
        "Needs at least {min} characters.",
      );
    case "TOO_LONG":
      return resolve(
        "host.editor.basics.error_too_long",
        "Can be at most {max} characters.",
      );
  }
}

/**
 * The host's own text, shown the way a guest browsing in this language sees it.
 *
 * Read-only by construction: this is the one block on the page the translation widget
 * is allowed to touch, and nothing in it is ever sent back to the server.
 */
function TranslatedPreview({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h2 className="text-sm font-medium text-slate-900">
        <Tx
          k="host.editor.basics.preview_heading"
          source="How guests read this in your language"
        />
      </h2>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        <Tx
          k="host.editor.basics.preview_note"
          source="An automatic translation of your text. Your own words are what gets saved."
        />
      </p>
      <div className="mt-3 space-y-2" data-user-generated-content translate="yes">
        <p className="text-sm font-medium text-slate-900">{title}</p>
        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">
          {description}
        </p>
      </div>
    </section>
  );
}
