import { db } from "../src/lib/db";
import {
  scanUiStrings,
  syncTranslations,
  TranslationSyncLockedError,
} from "../src/lib/services/ui-translation.service";

async function main() {
  const scan = await scanUiStrings();
  const results = await syncTranslations();
  const translated = results.reduce((total, result) => total + result.translated, 0);
  const failed = results.reduce((total, result) => total + result.failed, 0);

  console.log(
    `Translation sync: ${scan.found} active strings, ${scan.pruned} deactivated, ${translated} translated, ${failed} failed.`
  );

  // Independent batches mean the run can partly succeed. Successful batches stay
  // committed, but exit non-zero so a deployment doesn't treat a partial run as
  // complete — re-running the sync is idempotent and picks up only what's missing.
  if (failed > 0) {
    const errorText = results
      .flatMap((result) => result.errors)
      .join(" ");
    if (/credit balance|billing|quota|rate.?limit|status.?429/i.test(errorText)) {
      console.error(
        "AI PROVIDER CREDIT/QUOTA ERROR: Translation could not finish because the active provider has no usable credit or quota. Resolve the Anthropic or Gemini billing/quota issue, then run option 6 again."
      );
    } else if (/\b401\b|authentication(?:_error|\s+error)?|invalid (?:api )?key|incorrect (?:api )?key|unauthori[sz]ed/i.test(errorText)) {
      console.error(
        "AI PROVIDER AUTHENTICATION ERROR: Translation could not finish because a configured provider rejected its API key. Replace the invalid key, then run the translation sync again."
      );
    } else if (/ANTHROPIC_API_KEY is not configured/i.test(errorText)) {
      console.error(
        "ANTHROPIC API KEY ERROR: ANTHROPIC_API_KEY is not configured locally. Add it to the local environment, then run option 6 again."
      );
    }
    for (const result of results.filter((entry) => entry.failed > 0)) {
      console.error(`  ${result.locale}: ${result.failed} failed — ${result.errors.join("; ")}`);
    }
    console.error("Translation sync completed with failures. Re-run to retry the failed batches.");
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    if (error instanceof TranslationSyncLockedError) {
      console.error(
        "A translation sync is already running in another process. Skipping this run."
      );
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
