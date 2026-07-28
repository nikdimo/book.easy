import "server-only";
import { db } from "@/lib/db";
import { translateBatchToLocales } from "@/lib/ai/anthropic";
import { translateBatchToLocalesWithGemini } from "@/lib/ai/gemini";
import type { TranslationTarget } from "@/lib/ai/translation-batch";
import generatedCatalog from "@/lib/i18n/generated-ui-strings.json";
import { CURATED_TRANSLATION_OVERRIDES } from "@/lib/i18n/curated-overrides";

interface GeneratedUiString {
  key: string;
  sourceText: string;
  filePath: string;
}

const UI_CATALOG = generatedCatalog as GeneratedUiString[];
/** One request now translates a batch into every target locale at once, so the
 * request budget is the product of strings and locales rather than the string
 * count alone: 20 strings across 15 languages costs the same output as 300
 * single-language strings. */
const MAX_TRANSLATIONS_PER_REQUEST = 300;
const MAX_SOURCE_CHARACTERS_PER_REQUEST = 30_000;
const MAX_BATCH_STRINGS = 40;
const DEFAULT_SYNC_CONCURRENCY = 3;

const SYNC_LOCK_ID = "ui-translation-sync";
/** Generous fixed TTL rather than a heartbeat: the lock only needs to outlive one
 * sync, and a crashed holder self-heals once this elapses. A heartbeat would buy
 * faster crash recovery at the cost of renewal complexity we don't need here. */
const SYNC_LOCK_TTL_MS = 30 * 60 * 1000;

/** Thrown when another process already holds the sync lock, so callers can report
 * "already running" instead of surfacing a raw database error. */
export class TranslationSyncLockedError extends Error {
  constructor() {
    super("A translation sync is already running.");
    this.name = "TranslationSyncLockedError";
  }
}

/** Atomically claims the lock. The conditional `DO UPDATE ... WHERE expiresAt < now()`
 * means a live holder blocks the claim, while an expired one is taken over — both in
 * a single statement, so two processes racing can't both win. */
async function acquireSyncLock(): Promise<string | null> {
  const owner = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const expiresAt = new Date(Date.now() + SYNC_LOCK_TTL_MS);
  const rows = await db.$queryRaw<{ owner: string }[]>`
    INSERT INTO "TranslationSyncLock" ("id", "owner", "startedAt", "expiresAt")
    VALUES (${SYNC_LOCK_ID}, ${owner}, now(), ${expiresAt})
    ON CONFLICT ("id") DO UPDATE
      SET "owner" = EXCLUDED."owner",
          "startedAt" = EXCLUDED."startedAt",
          "expiresAt" = EXCLUDED."expiresAt"
      WHERE "TranslationSyncLock"."expiresAt" < now()
    RETURNING "owner"
  `;
  return rows.length > 0 ? owner : null;
}

/** Owner-checked release: if this holder's lock already expired and another process
 * took over, the `owner` predicate stops us from deleting the new holder's lock. */
async function releaseSyncLock(owner: string): Promise<void> {
  await db.$executeRaw`
    DELETE FROM "TranslationSyncLock"
    WHERE "id" = ${SYNC_LOCK_ID} AND "owner" = ${owner}
  `;
}

type TranslationEntry = Pick<GeneratedUiString, "key" | "sourceText">;

function chunks(
  entries: TranslationEntry[],
  localeCount: number,
): TranslationEntry[][] {
  const maxStrings = Math.max(
    1,
    Math.min(
      MAX_BATCH_STRINGS,
      Math.floor(MAX_TRANSLATIONS_PER_REQUEST / Math.max(localeCount, 1)),
    ),
  );
  const maxCharacters = Math.max(
    1,
    Math.floor(MAX_SOURCE_CHARACTERS_PER_REQUEST / Math.max(localeCount, 1)),
  );

  const result: TranslationEntry[][] = [];
  let current: TranslationEntry[] = [];
  let characters = 0;
  for (const entry of entries) {
    const size = entry.key.length + entry.sourceText.length;
    if (
      current.length &&
      (current.length >= maxStrings || characters + size > maxCharacters)
    ) {
      result.push(current);
      current = [];
      characters = 0;
    }
    current.push(entry);
    characters += size;
  }
  if (current.length) result.push(current);
  return result;
}

function syncConcurrency(): number {
  const configured = Number.parseInt(
    process.env.UI_TRANSLATION_SYNC_CONCURRENCY ?? "",
    10,
  );
  if (!Number.isFinite(configured)) return DEFAULT_SYNC_CONCURRENCY;
  return Math.min(Math.max(configured, 1), 4);
}

function isPermanentTranslationApiFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /credit balance|billing|quota|rate.?limit|429|ANTHROPIC_API_KEY is not configured|GOOGLE_API_KEY is not configured/i.test(
    message,
  );
}

function shouldUseGeminiFallback(error: unknown): boolean {
  if (!process.env.GOOGLE_API_KEY) return false;
  const message = error instanceof Error ? error.message : String(error);
  return /credit balance|billing|quota|rate.?limit|429|ANTHROPIC_API_KEY is not configured|529|503|502/i.test(
    message,
  );
}

/** Runs `task` over `items` with bounded concurrency, isolating failures: a rejected
 * task is recorded and the remaining work continues, so one bad batch can't discard
 * batches that already committed. Returns the per-item failures. */
async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<void>,
): Promise<{ item: T; error: unknown }[]> {
  let nextIndex = 0;
  const failures: { item: T; error: unknown }[] = [];
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      try {
        await task(items[index], index);
      } catch (error) {
        failures.push({ item: items[index], error });
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return failures;
}

/** Syncs the build-generated, AST-validated catalog into the database. Missing keys
 * are marked inactive instead of being deleted, so an extractor/deployment mistake
 * cannot destroy reviewed translations. */
export async function scanUiStrings(): Promise<{
  found: number;
  pruned: number;
}> {
  if (UI_CATALOG.length === 0)
    throw new Error("The generated UI translation catalog is empty.");
  const now = new Date();
  const foundKeys = UI_CATALOG.map((entry) => entry.key);
  await db.$transaction([
    ...UI_CATALOG.map(({ key, sourceText, filePath }) =>
      db.uiString.upsert({
        where: { key },
        create: { key, sourceText, filePath, isActive: true, lastSeenAt: now },
        update: { sourceText, filePath, isActive: true, lastSeenAt: now },
      }),
    ),
  ]);
  const deactivated = await db.uiString.updateMany({
    where: { key: { notIn: foundKeys }, isActive: true },
    data: { isActive: false },
  });
  await applyCuratedTranslationOverrides();
  return { found: UI_CATALOG.length, pruned: deactivated.count };
}

async function applyCuratedTranslationOverrides(): Promise<void> {
  const keys = Object.keys(CURATED_TRANSLATION_OVERRIDES);
  const catalogByKey = new Map(
    UI_CATALOG.map((entry) => [entry.key, entry.sourceText]),
  );
  const locales = [
    ...new Set(
      Object.values(CURATED_TRANSLATION_OVERRIDES).flatMap(Object.keys),
    ),
  ];
  const [languages, manualRows] = await Promise.all([
    db.language.findMany({
      where: { code: { in: locales } },
      select: { code: true },
    }),
    db.uiTranslation.findMany({
      where: { key: { in: keys }, isManuallyEdited: true },
      select: { locale: true, key: true },
    }),
  ]);
  const availableLocales = new Set(languages.map((language) => language.code));
  const manuallyEdited = new Set(
    manualRows.map((row) => `${row.locale}\u0000${row.key}`),
  );
  const operations = Object.entries(CURATED_TRANSLATION_OVERRIDES).flatMap(
    ([key, translations]) => {
      const sourceText = catalogByKey.get(key);
      if (!sourceText)
        throw new Error(
          `Curated translation key "${key}" is not in the generated catalog.`,
        );
      return Object.entries(translations).flatMap(([locale, value]) => {
        if (
          !availableLocales.has(locale) ||
          manuallyEdited.has(`${locale}\u0000${key}`)
        )
          return [];
        return [
          db.uiTranslation.upsert({
            where: { locale_key: { locale, key } },
            create: {
              locale,
              key,
              value,
              sourceTextSnapshot: sourceText,
              isManuallyEdited: false,
            },
            update: { value, sourceTextSnapshot: sourceText },
          }),
        ];
      });
    },
  );
  if (operations.length) await db.$transaction(operations);
}

export interface SyncResult {
  locale: string;
  /** Strings actually written to the database by this run. */
  translated: number;
  /** Strings that were already current and needed no work. */
  skipped: number;
  /** Strings that could not be written because their batch failed. */
  failed: number;
  /** One message per failed batch, for operator diagnosis. */
  errors: string[];
}

/** For every enabled language with useAiTranslation on, translates whatever
 * UiStrings are missing or stale. Languages that need the same keys — the normal
 * case, since a copy change lands in every locale at once — are translated by a
 * single grouped request per batch, which keeps a routine sync to one or two
 * provider calls instead of one per language.
 *
 * Batches are independent: a batch that fails validation is recorded in the result
 * while the successful batches stay committed, so a single bad model response can't
 * throw away an otherwise complete run. Callers must check `failed`/`errors` — a
 * partial failure is never reported as a clean success. */
export async function syncTranslations(): Promise<SyncResult[]> {
  const lockOwner = await acquireSyncLock();
  if (!lockOwner) throw new TranslationSyncLockedError();
  try {
    const [languages, uiStrings] = await Promise.all([
      db.language.findMany({
        where: { useAiTranslation: true, isDefault: false, isEnabled: true },
        orderBy: { sortOrder: "asc" },
      }),
      db.uiString.findMany({ where: { isActive: true } }),
    ]);

    const plans = await Promise.all(
      languages.map(async (language) => {
        const existing = await db.uiTranslation.findMany({
          where: { locale: language.code },
        });
        const existingByKey = new Map(existing.map((row) => [row.key, row]));
        const needsTranslation = uiStrings.filter((entry) => {
          const row = existingByKey.get(entry.key);
          return (
            !row ||
            !row.value.trim() ||
            row.sourceTextSnapshot !== entry.sourceText
          );
        });
        return { language, needsTranslation };
      }),
    );

    // Languages needing exactly the same keys share one request: the source copy is
    // sent once and the model returns every locale, instead of repeating the same
    // batch per language and spending one provider request on each.
    const groups = new Map<
      string,
      { languages: TranslationTarget[]; entries: TranslationEntry[] }
    >();
    for (const { language, needsTranslation } of plans) {
      if (needsTranslation.length === 0) continue;
      const signature = needsTranslation
        .map((entry) => entry.key)
        .join(" ");
      const target = { code: language.code, name: language.name };
      const group = groups.get(signature);
      if (group) group.languages.push(target);
      else
        groups.set(signature, {
          languages: [target],
          entries: needsTranslation,
        });
    }

    const tasks = [...groups.values()].flatMap(({ languages, entries }) => {
      const batches = chunks(entries, languages.length);
      return batches.map((batch, batchIndex) => ({
        languages,
        batch,
        batchIndex,
        batchCount: batches.length,
      }));
    });

    if (tasks.length && !process.env.ANTHROPIC_API_KEY && !process.env.GOOGLE_API_KEY) {
      throw new Error(
        "ANTHROPIC_API_KEY is not configured and no GOOGLE_API_KEY fallback is available.",
      );
    }

    // Anthropic failures here are provider-wide (billing, quota, missing key), so
    // once one batch proves it unusable the rest of the run goes straight to Gemini
    // rather than paying the same failing round trip for every remaining batch.
    let anthropicUnavailable = !process.env.ANTHROPIC_API_KEY;

    const translateTask = async ({
      languages,
      batch,
      batchIndex,
      batchCount,
    }: (typeof tasks)[number]) => {
      const texts = Object.fromEntries(
        batch.map((entry) => [entry.key, entry.sourceText]),
      );
      const locales = languages.map((language) => language.code).join(", ");

      let translated: Record<string, Record<string, string>> | null = null;
      if (!anthropicUnavailable) {
        try {
          translated = await translateBatchToLocales(texts, languages);
        } catch (error) {
          if (!shouldUseGeminiFallback(error)) throw error;
          anthropicUnavailable = true;
          console.warn(
            `[i18n] Anthropic unavailable; using Gemini for the rest of this run — ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      if (!translated) {
        translated = await translateBatchToLocalesWithGemini(texts, languages);
      }

      for (const language of languages) {
        const values = translated[language.code];
        await db.$transaction(
          batch.map((entry) =>
            db.uiTranslation.upsert({
              where: { locale_key: { locale: language.code, key: entry.key } },
              create: {
                locale: language.code,
                key: entry.key,
                value: values[entry.key],
                sourceTextSnapshot: entry.sourceText,
                isManuallyEdited: false,
              },
              update: {
                value: values[entry.key],
                sourceTextSnapshot: entry.sourceText,
                isManuallyEdited: false,
              },
            }),
          ),
        );
      }
      console.info(
        `[i18n] completed batch ${batchIndex + 1}/${batchCount} — ${batch.length} strings × ${languages.length} locale(s) (${locales})`,
      );
    };

    // Probe with one batch before opening the bounded worker pool. The probe also
    // settles which provider this run uses, so the pool never races several batches
    // into the same billing/quota failure. A probe that still fails has exhausted
    // both providers, and the remaining batches would only repeat that error.
    const failures: { item: (typeof tasks)[number]; error: unknown }[] = [];
    if (tasks.length) {
      const [probe, ...remaining] = tasks;
      const probeFailures = await runWithConcurrency([probe], 1, translateTask);
      failures.push(...probeFailures);

      const permanentFailure = probeFailures.find(({ error }) =>
        isPermanentTranslationApiFailure(error),
      );
      if (permanentFailure) {
        const message =
          permanentFailure.error instanceof Error
            ? permanentFailure.error.message
            : String(permanentFailure.error);
        failures.push(
          ...remaining.map((item) => ({
            item,
            error: new Error(
              `Skipped after provider configuration failure: ${message}`,
            ),
          })),
        );
      } else {
        failures.push(
          ...(await runWithConcurrency(
            remaining,
            syncConcurrency(),
            translateTask,
          )),
        );
      }
    }

    const failedByLocale = new Map<
      string,
      { count: number; errors: string[] }
    >();
    for (const { item, error } of failures) {
      const message = error instanceof Error ? error.message : String(error);
      // A grouped batch covers several locales, so one failure has to be charged to
      // every locale it would have written.
      for (const language of item.languages) {
        const entry = failedByLocale.get(language.code) ?? {
          count: 0,
          errors: [],
        };
        entry.count += item.batch.length;
        entry.errors.push(
          `batch ${item.batchIndex + 1}/${item.batchCount}: ${message}`,
        );
        failedByLocale.set(language.code, entry);
      }
      console.error(
        `[i18n] batch ${item.batchIndex + 1}/${item.batchCount} failed for ${item.languages
          .map((language) => language.code)
          .join(", ")} —`,
        error,
      );
    }

    return plans.map(({ language, needsTranslation }) => {
      const failure = failedByLocale.get(language.code);
      const failed = failure?.count ?? 0;
      return {
        locale: language.code,
        translated: needsTranslation.length - failed,
        skipped: uiStrings.length - needsTranslation.length,
        failed,
        errors: failure?.errors ?? [],
      };
    });
  } finally {
    await releaseSyncLock(lockOwner);
  }
}

export interface TranslationStatus {
  code: string;
  name: string;
  useAiTranslation: boolean;
  selectionCount: number;
  total: number;
  translated: number;
  stale: number;
  missing: number;
  manuallyEdited: number;
}

/** Per-language completeness for the admin Translation status panel. Covers every
 *  non-default language, including ones without AI translation enabled (so the admin
 *  can see selection counts and decide whether to turn it on). */
export async function getTranslationStatus(): Promise<TranslationStatus[]> {
  const [languages, uiStrings, translations] = await Promise.all([
    db.language.findMany({
      where: { isDefault: false },
      orderBy: { sortOrder: "asc" },
    }),
    db.uiString.findMany({ where: { isActive: true } }),
    db.uiTranslation.findMany(),
  ]);

  const total = uiStrings.length;
  const sourceByKey = new Map(
    uiStrings.map((entry) => [entry.key, entry.sourceText]),
  );

  return languages.map((language) => {
    let translated = 0;
    let stale = 0;
    let manuallyEdited = 0;
    for (const row of translations) {
      if (row.locale !== language.code) continue;
      const currentSource = sourceByKey.get(row.key);
      if (currentSource === undefined) continue; // key no longer used in the code
      if (row.sourceTextSnapshot === currentSource) {
        translated++;
        if (row.isManuallyEdited) manuallyEdited++;
      } else stale++;
    }

    return {
      code: language.code,
      name: language.name,
      useAiTranslation: language.useAiTranslation,
      selectionCount: language.selectionCount,
      total,
      translated,
      stale,
      missing: total - translated - stale,
      manuallyEdited,
    };
  });
}

export async function getTranslationEntriesForLocale(locale: string) {
  const strings = await db.uiString.findMany({
    where: { isActive: true },
    orderBy: { key: "asc" },
    include: { translations: { where: { locale }, take: 1 } },
  });
  return strings.map((entry) => {
    const translation = entry.translations[0];
    return {
      key: entry.key,
      sourceText: entry.sourceText,
      filePath: entry.filePath,
      value: translation?.value ?? "",
      stale: Boolean(
        translation && translation.sourceTextSnapshot !== entry.sourceText,
      ),
      isManuallyEdited: translation?.isManuallyEdited ?? false,
    };
  });
}
