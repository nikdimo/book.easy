import { db } from "../src/lib/db";
import { getTranslationStatus } from "../src/lib/services/ui-translation.service";

async function main() {
  const status = await getTranslationStatus();
  console.table(
    status.map(({ code, name, total, translated, stale, missing, manuallyEdited, useAiTranslation }) => ({
      code,
      name,
      AI: useAiTranslation,
      total,
      translated,
      stale,
      missing,
      manual: manuallyEdited,
    }))
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
