import { db } from "@/lib/db";
import { getEnabledLanguages } from "@/lib/services/language.service";
import {
  isAllowedMobileOrigin,
  mobileJson,
  mobileOptions,
} from "@/lib/mobile-api";
import { normalizeLocaleCode } from "@/lib/i18n/locale-preference";

export async function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function GET(request: Request) {
  if (!isAllowedMobileOrigin(request)) {
    return mobileJson(request, { error: "Origin not allowed" }, { status: 403 });
  }

  const languages = await getEnabledLanguages();
  const requested = normalizeLocaleCode(new URL(request.url).searchParams.get("locale"));
  const locale = languages.some((language) => language.code === requested)
    ? requested!
    : languages.find((language) => language.isDefault)?.code ?? "en";

  const rows =
    locale === "en"
      ? []
      : await db.uiTranslation.findMany({
          where: {
            locale,
            uiString: { isActive: true },
          },
          select: {
            value: true,
            sourceTextSnapshot: true,
            uiString: { select: { sourceText: true } },
          },
        });

  return mobileJson(request, {
    locale,
    languages,
    messages: Object.fromEntries(
      rows.flatMap((row) =>
        row.sourceTextSnapshot === row.uiString.sourceText
          ? [[row.uiString.sourceText, row.value]]
          : []
      )
    ),
  });
}

export async function POST(request: Request) {
  if (!isAllowedMobileOrigin(request)) {
    return mobileJson(request, { error: "Origin not allowed" }, { status: 403 });
  }

  let input: { locale?: string };
  try {
    input = await request.json();
  } catch {
    return mobileJson(request, { error: "Invalid JSON body" }, { status: 400 });
  }
  const locale = normalizeLocaleCode(input.locale);
  if (!locale) {
    return mobileJson(request, { error: "Invalid language" }, { status: 400 });
  }
  const language = await db.language.findFirst({
    where: { code: locale, isEnabled: true },
    select: { code: true },
  });
  if (!language) {
    return mobileJson(request, { error: "Language not available" }, { status: 404 });
  }

  await db.language.update({
    where: { code: locale },
    data: { selectionCount: { increment: 1 }, lastSelectedAt: new Date() },
  });
  return mobileJson(request, { success: true });
}
