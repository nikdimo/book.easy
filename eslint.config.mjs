import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // Deployment builds beside the live output and may leave these generated trees
    // behind after local verification or a failed release. They are never source.
    ".next-build/**",
    ".next-previous/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local tooling scratch / generated output — not part of the app (see .gitignore).
    ".codex-backups/**",
    ".tmp.driveupload/**",
    "Listing-Explorer/**",
    "replit/**",
    "replit-ui-export-*/**",
    "src/generated/**",
    // Expo owns generated output; its source is checked with `npm run mobile:typecheck`
    // and `npm --prefix mobile run lint`.
    "mobile/.expo/**",
    "mobile/dist/**",
    "mobile/node_modules/**",
    "mobile/scripts/**",
  ]),
]);

export default eslintConfig;
