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
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local tooling scratch / generated output — not part of the app (see .gitignore).
    ".codex-backups/**",
    ".tmp.driveupload/**",
    "Listing-Explorer/**",
    "src/generated/**",
  ]),
]);

export default eslintConfig;
