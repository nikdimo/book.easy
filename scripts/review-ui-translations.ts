import { db } from "../src/lib/db";
import { reviewTranslationBatch } from "../src/lib/ai/anthropic";

const BATCH_SIZE = 36;
const APPLY = process.argv.includes("--apply");
const localeFilter = process.argv.find((argument) => argument.startsWith("--locale="))?.split("=")[1];
const batchFilterRaw = process.argv.find((argument) => argument.startsWith("--batch="))?.split("=")[1];
const batchFilter = batchFilterRaw ? Number.parseInt(batchFilterRaw, 10) : undefined;
const configuredConcurrency = Number.parseInt(process.env.UI_TRANSLATION_REVIEW_CONCURRENCY ?? "", 10);
const CONCURRENCY = Number.isFinite(configuredConcurrency)
  ? Math.min(Math.max(configuredConcurrency, 1), 4)
  : 3;

interface ReviewTask {
  locale: string;
  languageName: string;
  batchNumber: number;
  batchCount: number;
  rows: Array<{
    key: string;
    sourceText: string;
    current: string;
  }>;
}

function chunk<T>(values: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size)
  );
}

async function runWithConcurrency<T>(
  values: T[],
  concurrency: number,
  task: (value: T) => Promise<void>
) {
  let next = 0;
  async function worker() {
    while (next < values.length) {
      const index = next++;
      await task(values[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker())
  );
}

async function reviewWithValidationRetries(task: ReviewTask) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await reviewTranslationBatch(
        Object.fromEntries(
          task.rows.map((row) => [row.key, { source: row.sourceText, current: row.current }])
        ),
        { code: task.locale, name: task.languageName }
      );
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[i18n review] ${task.locale} ${task.batchNumber}/${task.batchCount}: validation attempt ${attempt}/3 failed: ${message}`
      );
      if (/credit balance is too low|invalid api key|authentication/i.test(message)) break;
    }
  }
  throw lastError;
}

async function main() {
  const languages = await db.language.findMany({
    where: {
      isEnabled: true,
      isDefault: false,
      useAiTranslation: true,
      ...(localeFilter ? { code: localeFilter } : {}),
    },
    orderBy: { sortOrder: "asc" },
  });
  const strings = await db.uiString.findMany({
    where: { isActive: true },
    orderBy: { key: "asc" },
  });

  const tasks: ReviewTask[] = [];
  for (const language of languages) {
    const translations = await db.uiTranslation.findMany({
      where: {
        locale: language.code,
        isManuallyEdited: false,
      },
    });
    const byKey = new Map(translations.map((translation) => [translation.key, translation]));
    const currentRows = strings.flatMap((uiString) => {
      const translation = byKey.get(uiString.key);
      if (!translation || translation.sourceTextSnapshot !== uiString.sourceText) return [];
      return [{
        key: uiString.key,
        sourceText: uiString.sourceText,
        current: translation.value,
      }];
    });
    const batches = chunk(currentRows, BATCH_SIZE);
    batches.forEach((rows, index) => {
      if (batchFilter !== undefined && index + 1 !== batchFilter) return;
      tasks.push({
        locale: language.code,
        languageName: language.name,
        batchNumber: index + 1,
        batchCount: batches.length,
        rows,
      });
    });
  }

  const changedByLocale = new Map<string, number>();
  const reviewedByLocale = new Map<string, number>();
  const failures: string[] = [];
  await runWithConcurrency(tasks, CONCURRENCY, async (task) => {
    let reviewed: Record<string, string>;
    try {
      reviewed = await reviewWithValidationRetries(task);
    } catch (error) {
      const message = `${task.locale} ${task.batchNumber}/${task.batchCount}: ${error instanceof Error ? error.message : String(error)}`;
      failures.push(message);
      console.error(`[i18n review] FAILED ${message}`);
      return;
    }
    const changed = task.rows.filter((row) => reviewed[row.key] !== row.current);
    changedByLocale.set(task.locale, (changedByLocale.get(task.locale) ?? 0) + changed.length);
    reviewedByLocale.set(task.locale, (reviewedByLocale.get(task.locale) ?? 0) + task.rows.length);

    if (APPLY && changed.length) {
      await db.$transaction(
        changed.map((row) =>
          db.uiTranslation.update({
            where: { locale_key: { locale: task.locale, key: row.key } },
            data: { value: reviewed[row.key] },
          })
        )
      );
    }
    console.info(
      `[i18n review] ${task.locale} ${task.batchNumber}/${task.batchCount}: ${changed.length} improved${APPLY ? " and applied" : " (dry run)"}`
    );
  });

  console.table(
    languages.map((language) => ({
      locale: language.code,
      reviewed: reviewedByLocale.get(language.code) ?? 0,
      improved: changedByLocale.get(language.code) ?? 0,
      applied: APPLY,
    }))
  );
  if (failures.length) {
    throw new Error(`Translation review finished with ${failures.length} failed batches:\n${failures.join("\n")}`);
  }
  if (!APPLY) console.info("Dry run only. Re-run with --apply to persist improvements.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
