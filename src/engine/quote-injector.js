import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pickQuote } from "./mao-quotes.js";

const HISTORY_FILE = ".stw/.quote-history.json";
const MAX_HISTORY = 15;

function readHistory(rootDir) {
  const path = join(rootDir, HISTORY_FILE);
  if (!existsSync(path)) return [];
  try { return JSON.parse(readFileSync(path, "utf-8")); }
  catch { return []; }
}

function writeHistory(rootDir, ids) {
  const path = join(rootDir, HISTORY_FILE);
  mkdirSync(join(rootDir, ".stw"), { recursive: true });
  writeFileSync(path, JSON.stringify(ids.slice(-MAX_HISTORY), null, 2));
}

/**
 * Pick and record a quote. Returns the formatted quote string or empty if no .stw.
 */
export function injectQuote(rootDir) {
  try {
    const recent = readHistory(rootDir);
    const quote = pickQuote(recent);
    recent.push(quote.id);
    writeHistory(rootDir, recent);
    return `\n  📖 ${quote.source}\n  "${quote.text}"`;
  } catch {
    return "";
  }
}
