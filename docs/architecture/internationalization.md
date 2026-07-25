# Internationalization

The public marketplace uses English source copy and database-backed translations. The root layout applies the effective `lang` and `dir`, and locale-sensitive dates, numbers, prices, and plural categories use `Intl`.

## Locale resolution

Book Easy keeps two synchronized cookies with separate responsibilities:

- **`bookeasy_locale`** is the application's explicit language preference and the source of truth for server rendering.
- **`googtrans`** activates Google's client-side page translation in `/auto/{target}` format. It remains active even for English (`/auto/en`) because host-authored content may have been written in another language.

`src/proxy.ts` resolves a first request before React renders. Precedence is:

1. A valid explicit `bookeasy_locale` choice.
2. A legacy `googtrans` target, which migrates existing visitors.
3. An unambiguous Cloudflare `CF-IPCountry` mapping to a reviewed language.
4. English.

An explicit choice is persisted for one year and always overrides country detection. Country defaults come from the canonical reviewed-language manifest; countries without a reviewed, unambiguous mapping start in English. The proxy also injects the resolved cookies into the current upstream request so first-page server rendering and the response cookies agree.

`getLocale()` reads the explicit application cookie with the legacy Google cookie as a migration fallback. `getT()` then validates whether the locale has an enabled reviewed database catalog. A missing, disabled, or unknown reviewed catalog falls back to English source copy, which Google may translate after load for an automatically selected Google-only language.

Both request translation functions are wrapped in React `cache()`, so repeated calls within one request reuse their work.

Google Translate remains the fallback for dynamic host-authored content such as listing titles and descriptions. Fixed application copy must use the translation helpers below; it must not rely on Google Translate.

The public language selector has two searchable groups:

- **AI-translated system text** contains English plus every enabled language whose fixed UI catalog has been reviewed and exported.
- **Automatic Google translation** is populated from the languages exposed by Google's translation widget at runtime. These choices translate the rendered page, including host-authored listing content, but they do not become reviewed application catalogs.

Reviewed languages also keep Google's translation cookie active because Google is responsible for user-authored content. Resolved fixed UI copy is marked `notranslate`, so Google does not translate that reviewed copy a second time.

The selector indexes reviewed languages by native name, English name, common Latin spellings, and code. Google-only languages are indexed by Google's label plus localized, English, and native names from `Intl.DisplayNames`.

Long-form Terms, Privacy, and Cookie Policy documents are treated as page
content rather than fixed interface copy. Their body text remains in source
HTML for Google's page translation layer and is intentionally excluded from
the reviewed UI-string catalog. Shared navigation, consent controls, buttons,
and other interface copy around those documents remain catalog-controlled.

## Adding public UI copy

Server Components:

```tsx
const { resolve, plural } = await getT();
return <h1>{resolve("home.heading", "Find your next stay")}</h1>;
```

Client Components:

```tsx
const { resolve, plural } = useI18n();
return <button>{resolve("search.submit", "Search")}</button>;
```

Static client markup may use `<Tx k="search.submit" source="Search" />`; the Server Component equivalent is `<T t={t} k="..." source="..." />`. Both take the key and the English source as props — the extractor reads those two attributes, so neither may be a variable.

When reviewed fixed copy contains dynamic database or user-authored values, use
`<TWithValues>` instead of interpolating the string and wrapping the entire result
in `notranslate`. It protects only the reviewed grammar fragments and leaves values
such as property types and listing content available to Google's page translator.

Plural copy must provide all CLDR forms through `pluralForms(...)`; selection is performed with `Intl.PluralRules`, not `count === 1`. This distinction matters: the CLDR category named `one` is not "the number 1". In Macedonian, 21 and 31 also select `one`, so an equality check would pick the wrong grammatical form.

The helpers have deliberately separate server and client responsibilities — `pluralForms()` resolves every category server-side, `tPlural()` selects and interpolates one server-side result, `useI18n().plural()` performs client-side selection, `ti()` interpolates server-side, and `interpolate()` substitutes placeholders into already-resolved data on the client. Server-only code must not be pulled into client bundles to reduce that list.

Translation keys are stable identifiers. Do not reuse a key for unrelated copy. Placeholders such as `{count}` must appear unchanged in every translation.

`npm run lint` runs the AST catalog check first. It fails when guest-facing JSX contains untranslated static text or a translatable static attribute. Use `translate="no"` only for brands, codes, or deliberately untranslated values.

## Catalog and synchronization

`src/lib/i18n/reviewed-languages.ts` is the canonical static manifest for reviewed fixed-copy languages. It defines codes, names, search aliases, editorial guidance, and unambiguous primary-country mappings. Gemini generation, Anthropic guidance, snapshot tests, import/export validation, language search, and geolocation derive from this manifest. Database flags remain the runtime enablement layer.

- `npm run i18n:extract` parses the supported translation APIs and writes `src/lib/i18n/generated-ui-strings.json`.
- `npm run i18n:check` verifies that the committed catalog is current and guest-facing copy is marked.
- `npm run i18n:sync` scans the catalog into PostgreSQL and translates missing or stale entries for enabled AI languages.
- `npm run i18n:status` prints completeness, stale, missing, and manually reviewed counts.
- `npm run i18n:generate-reviewed` creates or resumes the complete local reviewed catalog using Gemini. It requires `GOOGLE_API_KEY`, consumes the same language-specific editorial guidance and shared response validation as the maintenance path, and writes only missing or stale batches.
- `npm run i18n:review -- --apply` runs a native-language editorial pass over current AI translations. Use `--locale=mk` and `--batch=3` to resume a specific failed batch without spending credit on completed work again.
- `npm run i18n:audit` checks active AI translations for empty values, placeholder damage, and unexpected Latin-script prose in Cyrillic locales.
- `npm run i18n:normalize-serbian` converts non-manual Serbian AI output to the site's chosen Cyrillic script while preserving placeholders and protected product tokens.
- `npm run i18n:export-reviewed` writes the complete, current local AI translation set to the version-controlled reviewed snapshot. It refuses incomplete or stale languages.
- `npm run i18n:import-reviewed` validates and imports every language in that snapshot. The snapshot is authoritative for reviewed fixed-copy languages: missing language rows are created, existing rows are enabled, and AI fixed-copy is enabled. Current manual translation overrides are preserved, and unrelated application data is never touched.

Use `npm run i18n:import-reviewed -- --dry-run` to validate the snapshot and report the target languages/manual overrides without writing to the database.

Removed keys are marked inactive rather than deleted, preserving reviewed translations. The local reviewed generator and the legacy synchronization workflow both validate keys and placeholders before committing a batch. The synchronization workflow uses bounded concurrency; `UI_TRANSLATION_SYNC_CONCURRENCY` accepts `1` through `4` and defaults to `3`.

Batches are independent. A batch that fails validation is recorded with its locale and batch number while the batches that already committed stay committed, so one bad model response cannot discard a run. `syncTranslations()` reports `translated`, `skipped`, and `failed` per locale; the admin action and the CLI both surface a partial failure as a failure (the CLI exits non-zero) rather than a clean success. Re-running the sync is idempotent and retries only what is still missing or stale.

Synchronization holds a cross-process lock so an administrator-triggered sync cannot overlap a deployment sync. The lock is a row in `TranslationSyncLock` with an owner token and a 30-minute expiry, not a PostgreSQL advisory lock: the job spans minutes of external API calls, and Prisma pools connections, so a session-scoped advisory lock could be released on a different connection than the one that took it, while a transaction-scoped lock cannot span the job at all. Release is owner-checked, and an expired lock left behind by a crashed process is reclaimed automatically. A blocked caller receives an explicit "already running" result.

High-visibility wording that must remain consistent across regenerations lives in `src/lib/i18n/curated-overrides.ts`. These reviewed defaults are applied during catalog scans, but an administrator's manual edit always takes precedence.

Gemini is an optional bulk generation/recovery provider. Anthropic is the incremental maintenance and editorial-review provider used by Control Panel option 6. Both share the canonical language guidance and exact-key/placeholder validation; curated overrides are reapplied before the snapshot is exported.

Control Panel option 6 first attempts to export the existing reviewed snapshot
without spending API credit. If enabled AI languages contain missing, empty, or
stale fixed copy, it runs the local Anthropic synchronization, reports missing
credentials or exhausted credit/quota, and revalidates and audits the completed
snapshot before it creates a version or deploys. A failed or partial API run never
deploys; completed batches remain saved, so running option 6 again resumes only the
remaining work.

The remote deployment script applies Prisma migrations, builds the exact catalog,
imports the reviewed snapshot, synchronizes only genuinely new or changed copy, and
only then restarts the application. A complete reviewed snapshot therefore deploys
without an Anthropic request on the VPS. The local option-6 preflight is the preferred
place to complete new fixed UI copy.

## Editorial review

Admins can open **Settings → Languages → Review translations** for an AI-enabled language. Overrides are validated, marked as manually edited, and remain in effect until the English source copy for that key changes. A changed source marks the row stale; the next sync regenerates it so obsolete manual text is never served as current.

English is always a safe runtime fallback. A missing, stale, disabled-locale, or invalid translation never renders an empty string.

## Rendering and caching

Locale selection makes the application request-dependent. The root layout calls `getT()`, which reads the locale cookies through `cookies()` — a request-time API — so every route beneath it renders dynamically. That is correct rather than unfortunate: the wrong cached locale would be a visible bug, and this app is request-dependent anyway (session on admin/host/account routes, `searchParams` on search).

Because of that, a `revalidate` value on the root layout would have no effect and is deliberately absent. Do not add one back expecting application-wide ISR, and do not reach for Cache Components or `'use cache'` to force static rendering here without first confirming the behavior against the bundled Next.js documentation — correctness of the served locale takes priority.

## Scope for future development

The fixed interface is covered. Dynamic database content is a separate content-localization concern. If translated listing content becomes a product requirement, add locale-specific content records with host/admin review and explicit fallback rules; do not put arbitrary listing content into `UiString`.

The root provider currently receives the full catalog for the active locale on every page (a few hundred strings, well within a reasonable payload). If the catalog grows substantially, route-level segmentation of the message set is the natural next step — but it must not break extraction, English fallbacks, modal routes, or deeply nested client components, so it is intentionally deferred until the size justifies the complexity.
