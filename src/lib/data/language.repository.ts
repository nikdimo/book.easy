import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export interface LanguageRecord {
  code: string;
  name: string;
  isDefault: boolean;
  isEnabled: boolean;
  sortOrder: number;
}

const DEFAULT_LANGUAGES: readonly LanguageRecord[] = [
  { code: "en", name: "English", isDefault: true, isEnabled: true, sortOrder: 0 },
  { code: "mk", name: "Македонски", isDefault: false, isEnabled: true, sortOrder: 1 },
];

type LanguageDelegate = {
  findMany: (args?: unknown) => Promise<LanguageRecord[]>;
  findUnique: (args: unknown) => Promise<LanguageRecord | null>;
  count: (args?: unknown) => Promise<number>;
  create: (args: unknown) => Promise<LanguageRecord>;
  createMany: (args: unknown) => Promise<unknown>;
  update: (args: unknown) => Promise<LanguageRecord>;
  delete: (args: unknown) => Promise<LanguageRecord>;
};

function getLanguageDelegate(): LanguageDelegate | null {
  const language = (db as typeof db & { language?: LanguageDelegate }).language;
  if (!language || typeof language.findMany !== "function") {
    return null;
  }
  return language;
}

async function seedDefaultsWithDelegate(language: LanguageDelegate) {
  const count = await language.count();
  if (count > 0) return;

  await language.createMany({
    data: DEFAULT_LANGUAGES,
  });
}

async function seedDefaultsWithSql() {
  const [{ count }] = await db.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS "count"
    FROM "Language"
  `;

  if (Number(count) > 0) return;

  await db.$executeRaw`
    INSERT INTO "Language" ("code", "name", "isDefault", "isEnabled", "sortOrder")
    VALUES
      ('en', 'English', true, true, 0),
      ('mk', 'Македонски', false, true, 1)
  `;
}

async function normalizeSourceLanguageWithDelegate(language: LanguageDelegate) {
  const english = await language.findUnique({ where: { code: "en" } });
  if (!english) return;
  if (english.isDefault && english.isEnabled) return;

  const languages = await language.findMany();
  await Promise.all(
    languages.map((entry) =>
      language.update({
        where: { code: entry.code },
        data: {
          isDefault: entry.code === "en",
          ...(entry.code === "en" ? { isEnabled: true } : {}),
        },
      })
    )
  );
}

async function normalizeSourceLanguageWithSql() {
  const rows = await db.$queryRaw<LanguageRecord[]>`
    SELECT "code", "name", "isDefault", "isEnabled", "sortOrder"
    FROM "Language"
  `;

  const english = rows.find((row) => row.code === "en");
  if (!english) return;
  if (english.isDefault && english.isEnabled) return;

  await db.$executeRaw`
    UPDATE "Language"
    SET
      "isDefault" = CASE WHEN "code" = 'en' THEN true ELSE false END,
      "isEnabled" = CASE WHEN "code" = 'en' THEN true ELSE "isEnabled" END
  `;
}

async function ensureDefaults() {
  const language = getLanguageDelegate();
  if (language) {
    await seedDefaultsWithDelegate(language);
    await normalizeSourceLanguageWithDelegate(language);
    return;
  }

  await seedDefaultsWithSql();
  await normalizeSourceLanguageWithSql();
}

export async function getLanguages(enabledOnly = false): Promise<LanguageRecord[]> {
  await ensureDefaults();

  const language = getLanguageDelegate();
  if (language) {
    return language.findMany({
      ...(enabledOnly ? { where: { isEnabled: true } } : {}),
      orderBy: { sortOrder: "asc" },
    });
  }

  const where = enabledOnly
    ? Prisma.sql`WHERE "isEnabled" = true`
    : Prisma.empty;

  return db.$queryRaw<LanguageRecord[]>`
    SELECT "code", "name", "isDefault", "isEnabled", "sortOrder"
    FROM "Language"
    ${where}
    ORDER BY "sortOrder" ASC
  `;
}

export async function getLanguageByCode(code: string): Promise<LanguageRecord | null> {
  const language = getLanguageDelegate();
  if (language) {
    return language.findUnique({ where: { code } });
  }

  const rows = await db.$queryRaw<LanguageRecord[]>`
    SELECT "code", "name", "isDefault", "isEnabled", "sortOrder"
    FROM "Language"
    WHERE "code" = ${code}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function countLanguages(): Promise<number> {
  const language = getLanguageDelegate();
  if (language) {
    return language.count();
  }

  const [{ count }] = await db.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS "count"
    FROM "Language"
  `;

  return Number(count);
}

export async function addLanguageRecord(code: string, name: string, sortOrder: number) {
  const language = getLanguageDelegate();
  if (language) {
    return language.create({
      data: { code, name, sortOrder },
    });
  }

  await db.$executeRaw`
    INSERT INTO "Language" ("code", "name", "isDefault", "isEnabled", "sortOrder")
    VALUES (${code}, ${name}, false, true, ${sortOrder})
  `;
}

export async function updateLanguageEnabled(code: string, isEnabled: boolean) {
  const language = getLanguageDelegate();
  if (language) {
    return language.update({
      where: { code },
      data: { isEnabled },
    });
  }

  await db.$executeRaw`
    UPDATE "Language"
    SET "isEnabled" = ${isEnabled}
    WHERE "code" = ${code}
  `;
}

export async function deleteLanguageByCode(code: string) {
  const language = getLanguageDelegate();
  if (language) {
    return language.delete({ where: { code } });
  }

  await db.$executeRaw`
    DELETE FROM "Language"
    WHERE "code" = ${code}
  `;
}

export async function reorderLanguages(codesInOrder: string[]) {
  const language = getLanguageDelegate();
  if (language) {
    await db.$transaction(async (tx) => {
      await Promise.all(
        codesInOrder.map((code, index) =>
          tx.language.update({
            where: { code },
            data: { sortOrder: index },
          })
        )
      );
    });
    return;
  }

  await db.$transaction(
    codesInOrder.map((code, index) =>
      db.$executeRaw`
        UPDATE "Language"
        SET "sortOrder" = ${index}
        WHERE "code" = ${code}
      `
    )
  );
}
