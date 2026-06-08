import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components"];
const EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mdx"]);
const FORBIDDEN_TERMS = [
  "Short",
  "Long",
  "CrossExchange",
  "SpotPerp",
  "Funding Markets",
  "Spot Markets",
  "Price direction",
  "Price Direction",
  "Exchange Count",
  "Latest",
  "Quality",
  "Volatility",
  "Decay",
  "Survival"
];
const INTERNAL_VALUES = new Set(["CrossExchange", "SpotPerp"]);

const findings = [];

for (const dir of SCAN_DIRS) {
  walk(join(ROOT, dir));
}

if (findings.length > 0) {
  console.error("i18n lint failed: forbidden English trading terms remain in visible UI text.");
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line}: ${finding.term} -> ${finding.text.trim()}`);
  }
  process.exit(1);
}

console.log("i18n lint passed: no forbidden UI terms found.");

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
      walk(fullPath);
      continue;
    }

    if (!EXTENSIONS.has(getExtension(entry))) continue;
    scanFile(fullPath);
  }
}

function scanFile(file) {
  const content = readFileSync(file, "utf8");
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    for (const text of getVisibleTextCandidates(line)) {
      for (const term of FORBIDDEN_TERMS) {
        if (text.includes(term) && !isAllowedInternalText(text, term)) {
          findings.push({
            file: relative(ROOT, file),
            line: index + 1,
            term,
            text
          });
        }
      }
    }
  });
}

function getVisibleTextCandidates(line) {
  const candidates = [];
  const stringPattern = /(["'`])((?:\\.|(?!\1).)*?)\1/g;
  let stringMatch;
  while ((stringMatch = stringPattern.exec(line)) !== null) {
    candidates.push(stringMatch[2]);
  }

  const jsxPattern = />\s*([^<>{}][^<>]*?)\s*</g;
  let jsxMatch;
  while ((jsxMatch = jsxPattern.exec(line)) !== null) {
    candidates.push(jsxMatch[1]);
  }

  return candidates;
}

function isAllowedInternalText(text, term) {
  const trimmed = text.trim();
  if (INTERNAL_VALUES.has(trimmed)) {
    return true;
  }

  return /^[A-Za-z][A-Za-z0-9_]*$/.test(trimmed) && trimmed !== term;
}

function getExtension(fileName) {
  const match = fileName.match(/(\.[^.]+)$/);
  return match?.[1] ?? "";
}
