/**
 * Auto-translation script — MyMemory API, free, no key needed.
 * Usage: npm run translate (auto-runs via npm run dev)
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC        = join(__dirname, "../src/config/i18n");
const CACHE_FILE = join(__dirname, ".translate-cache");
const SOURCE     = "fr";
const TARGETS    = ["en","de","sr","el","nl","ru","uk","it","fi","pt","sk","es","cs"];

// ── Hash cache ────────────────────────────────────────
const getHash = (s) => createHash("md5").update(s).digest("hex");

function isFrChanged(content) {
  if (!existsSync(CACHE_FILE)) return true;
  return readFileSync(CACHE_FILE, "utf8").trim() !== getHash(content);
}

// ── Concurrency pool (no nesting — only wraps leaf API calls) ──
function createPool(max) {
  let active = 0;
  const queue = [];
  return (fn) => new Promise((res, rej) => {
    const run = async () => {
      active++;
      try { res(await fn()); }
      catch (e) { rej(e); }
      finally { active--; if (queue.length) queue.shift()(); }
    };
    active < max ? run() : queue.push(run);
  });
}
const pool = createPool(10);

// ── MyMemory API ──────────────────────────────────────
async function translateText(text, toLang) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${SOURCE}|${toLang}`;
  const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const json = await res.json();
  if (json.responseStatus !== 200) throw new Error(json.responseDetails);
  return json.responseData.translatedText.replace(/<[^>]+>/g, "").trim();
}

// ── File helpers ──────────────────────────────────────
function parseLangFile(lang) {
  const path = join(SRC, `${lang}.ts`);
  if (!existsSync(path)) return {};
  const content = readFileSync(path, "utf8");
  const match   = content.match(/export const \w+ = \{([\s\S]*?)\};/);
  if (!match) return {};
  const out = {};
  const re  = /(\w+):\s*"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(match[1])) !== null) out[m[1]] = m[2].replace(/\\n/g, "\n");
  return out;
}

function writeLangFile(lang, ordered) {
  const lines = Object.entries(ordered)
    .map(([k, v]) => `  ${k}: "${v.replace(/\n/g, "\\n").replace(/"/g, '\\"')}",`);
  writeFileSync(join(SRC, `${lang}.ts`), `export const ${lang} = {\n${lines.join("\n")}\n};\n`);
}

// ── Translate one language ────────────────────────────
// Keys run in parallel; pool only on leaf translateText calls (no nesting)
async function translateLang(lang, frEntries, keys) {
  const existing = parseLangFile(lang);
  const missing  = keys.filter((k) => !(k in existing));

  if (missing.length === 0) {
    process.stdout.write(`  ✓ ${lang}\n`);
    return { ...existing };
  }

  const pairs = await Promise.all(
    missing.map(async (key) => {
      const text  = frEntries[key];
      const lines = text.split("\n");
      try {
        // Each line goes directly into pool — no outer pool wrapping
        const translated = await Promise.all(
          lines.map((line) =>
            line.trim() ? pool(() => translateText(line, lang)) : Promise.resolve(line)
          )
        );
        return [key, translated.join("\n")];
      } catch {
        return [key, text]; // fallback to French
      }
    })
  );

  const merged = { ...existing };
  for (const [k, v] of pairs) merged[k] = v;

  const ordered = Object.fromEntries(keys.map((k) => [k, merged[k] ?? frEntries[k]]));
  writeLangFile(lang, ordered);
  process.stdout.write(`  ✓ ${lang}\n`);
  return ordered;
}

// ── Generate index.ts (only for langs that have a file) ─
function generateIndex() {
  const present = [SOURCE, ...TARGETS].filter((l) => existsSync(join(SRC, `${l}.ts`)));
  const imports = present.map((l) => `import { ${l} } from "./${l}";`).join("\n");
  const record  = present.map((l) => `  ${l},`).join("\n");
  writeFileSync(join(SRC, "index.ts"), `
${imports}

export type TranslationKey = keyof typeof fr;
export type Translations   = typeof fr;

export const I18N: Record<string, Translations> = {
${record}
};

export function t(langCode: string, key: TranslationKey): string {
  return I18N[langCode]?.[key] ?? I18N.en?.[key] ?? I18N.fr[key];
}
`);
}

// ── Main ──────────────────────────────────────────────
async function main() {
  const frContent = readFileSync(join(SRC, "fr.ts"), "utf8");

  // Always regenerate index.ts if it's missing (even without translating)
  if (!existsSync(join(SRC, "index.ts"))) generateIndex();

  if (!isFrChanged(frContent)) {
    console.log("⚡ fr.ts unchanged — skipping.");
    return;
  }

  const match = frContent.match(/export const fr = \{([\s\S]*?)\};/);
  if (!match) { console.error("Could not parse fr.ts"); process.exit(1); }

  const frEntries = {};
  const re = /(\w+):\s*"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(match[1])) !== null) frEntries[m[1]] = m[2].replace(/\\n/g, "\n");
  const keys = Object.keys(frEntries);

  console.log(` Translating ${keys.length} keys → ${TARGETS.length} languages in parallel…`);
  const t0 = Date.now();

  await Promise.all(TARGETS.map((lang) => translateLang(lang, frEntries, keys)));

  generateIndex();
  writeFileSync(CACHE_FILE, getHash(frContent));
  console.log(`\n Done in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
