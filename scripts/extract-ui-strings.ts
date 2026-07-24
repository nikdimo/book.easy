import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

interface ExtractedUiString {
  key: string;
  sourceText: string;
  filePath: string;
}

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src");
const outputPath = path.join(sourceRoot, "lib", "i18n", "generated-ui-strings.json");
const checkOnly = process.argv.includes("--check");
const rawUiErrors: string[] = [];
const UI_SCOPES = [
  "src/app/(public)/",
  "src/components/marketplace/",
  "src/components/public/",
];
const UI_FILES = new Set([
  "src/components/shared/header.tsx",
  "src/components/shared/footer.tsx",
]);
const TRANSLATABLE_ATTRIBUTES = new Set(["aria-label", "placeholder", "title", "alt"]);

function sourceString(node: ts.Node | undefined): string | null {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : null;
}

function jsxAttribute(element: ts.JsxOpeningLikeElement, name: string): string | null {
  const attribute = element.attributes.properties.find(
    (candidate): candidate is ts.JsxAttribute =>
      ts.isJsxAttribute(candidate) && candidate.name.getText() === name
  );
  if (!attribute?.initializer) return null;
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text;
  if (
    ts.isJsxExpression(attribute.initializer) &&
    attribute.initializer.expression
  ) {
    return sourceString(attribute.initializer.expression);
  }
  return null;
}

function walkFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkFiles(absolute);
    return /\.(ts|tsx)$/.test(entry.name) ? [absolute] : [];
  });
}

function relativePath(filePath: string): string {
  return path.relative(projectRoot, filePath).split(path.sep).join("/");
}

function isGuestUiFile(filePath: string): boolean {
  const relative = relativePath(filePath);
  return UI_FILES.has(relative) || UI_SCOPES.some((scope) => relative.startsWith(scope));
}

function isOptedOut(node: ts.Node): boolean {
  for (let current: ts.Node | undefined = node; current; current = current.parent) {
    if (!ts.isJsxElement(current)) continue;
    const attributes = current.openingElement.attributes.properties;
    for (const attribute of attributes) {
      if (!ts.isJsxAttribute(attribute) || !attribute.initializer) continue;
      const name = attribute.name.getText();
      if (name === "translate" && ts.isStringLiteral(attribute.initializer) && attribute.initializer.text === "no") {
        return true;
      }
      if (name === "className" && ts.isStringLiteral(attribute.initializer) && attribute.initializer.text.split(/\s+/).includes("notranslate")) {
        return true;
      }
    }
  }
  return false;
}

function reportRawUi(filePath: string, sourceFile: ts.SourceFile, node: ts.Node, text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!/[A-Za-z]{2}/.test(normalized) || isOptedOut(node)) return;
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  rawUiErrors.push(
    `${relativePath(filePath)}:${line + 1}:${character + 1} raw UI text ${JSON.stringify(normalized)}`
  );
}

function extract(): ExtractedUiString[] {
  const byKey = new Map<string, ExtractedUiString>();

  const add = (key: string, sourceText: string, filePath: string) => {
    const next = { key, sourceText, filePath: relativePath(filePath) };
    const existing = byKey.get(key);
    if (existing && existing.sourceText !== sourceText) {
      throw new Error(
        `Translation key "${key}" has conflicting source text:\n` +
          `  ${existing.filePath}: ${JSON.stringify(existing.sourceText)}\n` +
          `  ${next.filePath}: ${JSON.stringify(sourceText)}`
      );
    }
    if (!existing) byKey.set(key, next);
  };

  for (const filePath of walkFiles(sourceRoot)) {
    if (filePath === outputPath) continue;
    const source = fs.readFileSync(filePath, "utf8");
    const sourceFile = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      filePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );

    const visit = (node: ts.Node): void => {
      if (isGuestUiFile(filePath) && ts.isJsxText(node)) {
        reportRawUi(filePath, sourceFile, node, node.text);
      }

      if (isGuestUiFile(filePath) && ts.isJsxAttribute(node)) {
        const attributeName = node.name.getText();
        const tagName = ts.isJsxOpeningElement(node.parent.parent) || ts.isJsxSelfClosingElement(node.parent.parent)
          ? node.parent.parent.tagName.getText()
          : "";
        if (
          TRANSLATABLE_ATTRIBUTES.has(attributeName) &&
          !(attributeName === "source" && (tagName === "T" || tagName === "Tx")) &&
          node.initializer &&
          ts.isStringLiteral(node.initializer)
        ) {
          reportRawUi(filePath, sourceFile, node, node.initializer.text);
        }
      }

      if (ts.isCallExpression(node)) {
        const expression = node.expression;
        const args = node.arguments;

        if (
          ts.isPropertyAccessExpression(expression) &&
          expression.name.text === "resolve"
        ) {
          const key = sourceString(args[0]);
          const sourceText = sourceString(args[1]);
          if (key !== null && sourceText !== null) add(key, sourceText, filePath);
        } else if (
          ts.isPropertyAccessExpression(expression) &&
          expression.name.text === "plural"
        ) {
          const keyBase = sourceString(args[0]);
          const singular = sourceString(args[2]);
          const plural = sourceString(args[3]);
          if (keyBase !== null && singular !== null && plural !== null) {
            for (const category of ["zero", "one", "two", "few", "many", "other"] as const) {
              add(`${keyBase}.${category}`, category === "one" ? singular : plural, filePath);
            }
          }
        } else if (ts.isIdentifier(expression)) {
          const name = expression.text;
          if (name === "t" || name === "ti") {
            const key = sourceString(args[1]);
            const sourceText = sourceString(args[2]);
            if (key !== null && sourceText !== null) add(key, sourceText, filePath);
          } else if (name === "tPlural") {
            const keyBase = sourceString(args[1]);
            const singular = sourceString(args[3]);
            const plural = sourceString(args[4]);
            if (keyBase !== null && singular !== null && plural !== null) {
              for (const category of ["zero", "one", "two", "few", "many", "other"] as const) {
                add(`${keyBase}.${category}`, category === "one" ? singular : plural, filePath);
              }
            }
          } else if (name === "pluralForms") {
            const keyBase = sourceString(args[1]);
            const singular = sourceString(args[2]);
            const plural = sourceString(args[3]);
            if (keyBase !== null && singular !== null && plural !== null) {
              for (const category of ["zero", "one", "two", "few", "many", "other"] as const) {
                add(`${keyBase}.${category}`, category === "one" ? singular : plural, filePath);
              }
            }
          }
        }
      }

      if (
        (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
        (node.tagName.getText() === "T" || node.tagName.getText() === "Tx")
      ) {
        const key = jsxAttribute(node, "k");
        const sourceText = jsxAttribute(node, "source");
        if (key !== null && sourceText !== null) add(key, sourceText, filePath);
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

const extracted = extract();
const serialized = `${JSON.stringify(extracted, null, 2)}\n`;

if (rawUiErrors.length) {
  console.error(
    `Untranslated guest-facing UI text was found:\n${rawUiErrors.map((error) => `  ${error}`).join("\n")}\n` +
      "Wrap visible copy in <T>/<Tx> or resolve attributes through the translator. Use translate=\"no\" only for proper names."
  );
  process.exit(1);
}

if (checkOnly) {
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
  if (current !== serialized) {
    console.error(
      "The generated UI translation catalog is stale. Run `npm run i18n:extract` and commit the result."
    );
    process.exit(1);
  }
  console.log(`UI translation catalog is current (${extracted.length} strings).`);
} else {
  fs.writeFileSync(outputPath, serialized, "utf8");
  console.log(`Extracted ${extracted.length} UI strings to ${relativePath(outputPath)}.`);
}
