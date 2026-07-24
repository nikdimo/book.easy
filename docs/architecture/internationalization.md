# Internationalization

The public marketplace uses English source copy and database-backed translations. The root layout applies the effective `lang` and `dir`, and locale-sensitive dates, numbers, prices, and plural categories use `Intl`.

## Locale resolution

The locale lives in the **`googtrans`** cookie — the same cookie the Google Translate widget owns — in Google's `/{source}/{target}` format (for example `/en/mk`). Reusing that one cookie is deliberate: the language switcher and Google's DOM translation must never disagree about the active language, and a second application cookie would create two competing sources of truth.

Two functions split the work:

- `getLocale()` (in `src/lib/i18n/t.tsx`) only **parses** the raw cookie value and returns the requested language code, defaulting to `en`.
- `getT()` **validates** it before it becomes the effective application locale: the language must exist, be enabled, and have AI translations enabled. A missing, disabled, or unknown language falls back to English source copy; a language that exists and is enabled but has AI translation off keeps its locale (so `lang`/`dir`/`Intl` stay correct) while all copy resolves to English and Google Translate handles the page.

Both are wrapped in React `cache()`, so repeated calls within one request hit the database once.

Changing the cookie name would require explicit synchronization with the Google Translate widget, migration of existing visitors' cookies, and validation rules to prevent two conflicting locale sources. Do not introduce a separate application cookie without designing that first.

Google Translate remains the fallback for dynamic host-authored content such as listing titles and descriptions. Fixed application copy must use the translation helpers below; it must not rely on Google Translate.

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

Plural copy must provide all CLDR forms through `pluralForms(...)`; selection is performed with `Intl.PluralRules`, not `count === 1`. This distinction matters: the CLDR category named `one` is not "the number 1". In Macedonian, 21 and 31 also select `one`, so an equality check would pick the wrong grammatical form.

The helpers have deliberately separate server and client responsibilities — `pluralForms()` resolves every category server-side, `tPlural()` selects and interpolates one server-side result, `useI18n().plural()` performs client-side selection, `ti()` interpolates server-side, and `interpolate()` substitutes placeholders into already-resolved data on the client. Server-only code must not be pulled into client bundles to reduce that list.

Translation keys are stable identifiers. Do not reuse a key for unrelated copy. Placeholders such as `{count}` must appear unchanged in every translation.

`npm run lint` runs the AST catalog check first. It fails when guest-facing JSX contains untranslated static text or a translatable static attribute. Use `translate="no"` only for brands, codes, or deliberately untranslated values.

## Catalog and synchronization

- `npm run i18n:extract` parses the supported translation APIs and writes `src/lib/i18n/generated-ui-strings.json`.
- `npm run i18n:check` verifies that the committed catalog is current and guest-facing copy is marked.
- `npm run i18n:sync` scans the catalog into PostgreSQL and translates missing or stale entries for enabled AI languages.
- `npm run i18n:status` prints completeness, stale, missing, and manually reviewed counts.
- `npm run i18n:review -- --apply` runs a native-language editorial pass over current AI translations. Use `--locale=mk` and `--batch=3` to resume a specific failed batch without spending credit on completed work again.
- `npm run i18n:audit` checks active AI translations for empty values, placeholder damage, and unexpected Latin-script prose in Cyrillic locales.
- `npm run i18n:normalize-serbian` converts non-manual Serbian AI output to the site's chosen Cyrillic script while preserving placeholders and protected product tokens.

Removed keys are marked inactive rather than deleted, preserving reviewed translations. Sync requests are chunked, strictly validated for keys and placeholders, retried by the Anthropic client, and run with bounded concurrency. `UI_TRANSLATION_SYNC_CONCURRENCY` accepts `1` through `4` and defaults to `3`.

Batches are independent. A batch that fails validation is recorded with its locale and batch number while the batches that already committed stay committed, so one bad model response cannot discard a run. `syncTranslations()` reports `translated`, `skipped`, and `failed` per locale; the admin action and the CLI both surface a partial failure as a failure (the CLI exits non-zero) rather than a clean success. Re-running the sync is idempotent and retries only what is still missing or stale.

Synchronization holds a cross-process lock so an administrator-triggered sync cannot overlap a deployment sync. The lock is a row in `TranslationSyncLock` with an owner token and a 30-minute expiry, not a PostgreSQL advisory lock: the job spans minutes of external API calls, and Prisma pools connections, so a session-scoped advisory lock could be released on a different connection than the one that took it, while a transaction-scoped lock cannot span the job at all. Release is owner-checked, and an expired lock left behind by a crashed process is reclaimed automatically. A blocked caller receives an explicit "already running" result.

High-visibility wording that must remain consistent across regenerations lives in `src/lib/i18n/curated-overrides.ts`. These reviewed defaults are applied during catalog scans, but an administrator's manual edit always takes precedence.

The deployment script applies Prisma migrations, builds the exact catalog, synchronizes translations, and only then restarts the application. Set `ANTHROPIC_API_KEY` and pin `ANTHROPIC_TRANSLATION_MODEL` in production.

## Editorial review

Admins can open **Settings → Languages → Review translations** for an AI-enabled language. Overrides are validated, marked as manually edited, and remain in effect until the English source copy for that key changes. A changed source marks the row stale; the next sync regenerates it so obsolete manual text is never served as current.

English is always a safe runtime fallback. A missing, stale, disabled-locale, or invalid translation never renders an empty string.

## Rendering and caching

Locale selection makes the application request-dependent. The root layout calls `getT()`, which reads the `googtrans` cookie through `cookies()` — a request-time API — so every route beneath it renders dynamically. That is correct rather than unfortunate: the wrong cached locale would be a visible bug, and this app is request-dependent anyway (session on admin/host/account routes, `searchParams` on search).

Because of that, a `revalidate` value on the root layout would have no effect and is deliberately absent. Do not add one back expecting application-wide ISR, and do not reach for Cache Components or `'use cache'` to force static rendering here without first confirming the behavior against the bundled Next.js documentation — correctness of the served locale takes priority.

## Scope for future development

The fixed interface is covered. Dynamic database content is a separate content-localization concern. If translated listing content becomes a product requirement, add locale-specific content records with host/admin review and explicit fallback rules; do not put arbitrary listing content into `UiString`.

The root provider currently receives the full catalog for the active locale on every page (around 322 strings, well within a reasonable payload). If the catalog grows substantially, route-level segmentation of the message set is the natural next step — but it must not break extraction, English fallbacks, modal routes, or deeply nested client components, so it is intentionally deferred until the size justifies the complexity.
