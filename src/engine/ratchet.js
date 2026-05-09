import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const RATCHET_FILE = ".stw/ratchet.json";

function ratchetPath(rootDir) {
  return join(rootDir, RATCHET_FILE);
}

function readRatchet(rootDir) {
  const path = ratchetPath(rootDir);
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return [];
  }
}

function writeRatchet(rootDir, data) {
  const path = ratchetPath(rootDir);
  mkdirSync(join(rootDir, ".stw"), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}

/**
 * Promote a logged error (from error-registry.json) into a permanent ratchet rule.
 * The rule encodes the failure so `stw check` can prevent recurrence.
 */
export function ratchetError(rootDir, errorEntry) {
  const rules = readRatchet(rootDir);
  const rule = {
    id: `ratch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    description: errorEntry.description || "",
    sourceErrorId: errorEntry.id || null,
    check: errorEntry.check || { type: "grep", pattern: "" },
    message: errorEntry.resolution || errorEntry.description || "",
    tags: errorEntry.tags || [],
    createdAt: new Date().toISOString(),
  };
  rules.push(rule);
  writeRatchet(rootDir, rules);
  return { ok: true, id: rule.id };
}

/**
 * Return all ratcheted rules.
 */
export function getRatchetRules(rootDir) {
  return readRatchet(rootDir);
}

/**
 * Run a single ratchet rule check.
 * Supported check types:
 *   - "grep": run grep for `pattern` in `files` (defaults to src/ bin/), fails if pattern IS found
 */
function runRuleCheck(rootDir, rule) {
  const check = rule.check || {};

  if (check.type === "grep" && check.pattern) {
    const files = check.files || ["src/", "bin/"];
    const args = ["-rn", check.pattern, ...files];
    try {
      const result = spawnSync("grep", args, {
        cwd: rootDir,
        encoding: "utf-8",
        timeout: 15000,
      });
      if (result.status === 0) {
        return {
          passed: false,
          output: `发现违规模式:\n${result.stdout.trim().split("\n").slice(0, 10).join("\n")}`,
        };
      }
      return { passed: true, output: "" };
    } catch {
      return { passed: true, output: "" };
    }
  }

  if (check.type === "file-contains" && check.file && check.pattern) {
    try {
      const content = readFileSync(join(rootDir, check.file), "utf-8");
      if (content.includes(check.pattern)) {
        return {
          passed: false,
          output: `${check.file} 包含禁止内容: ${check.pattern}`,
        };
      }
      return { passed: true, output: "" };
    } catch {
      return { passed: true, output: "" };
    }
  }

  return { passed: true, output: `(无检查逻辑: ${check.type})` };
}

/**
 * Run all ratchet rules as a gate check.
 * Returns { passed, output } compatible with check.js gate format.
 */
export function runRatchetCheck(rootDir) {
  const rules = readRatchet(rootDir);
  if (rules.length === 0) {
    return { passed: true, output: "(无已注册的 Ratchet 规则)" };
  }

  const results = [];
  let allPassed = true;

  for (const rule of rules) {
    const r = runRuleCheck(rootDir, rule);
    results.push({ rule: rule.description, ...r });
    if (!r.passed) allPassed = false;
  }

  const output = results
    .map((r) => `${r.passed ? "✅" : "❌"} ${r.rule}${r.output ? "\n   " + r.output : ""}`)
    .join("\n");

  return { passed: allPassed, output };
}

/**
 * Remove a ratchet rule by id.
 */
export function removeRatchetRule(rootDir, ruleId) {
  const rules = readRatchet(rootDir);
  const idx = rules.findIndex((r) => r.id === ruleId);
  if (idx === -1) return { ok: false, error: `未找到规则: ${ruleId}` };
  rules.splice(idx, 1);
  writeRatchet(rootDir, rules);
  return { ok: true };
}
