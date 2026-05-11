import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sectionBody } from "./markdown-anchor.js";

// 规划师 A1 建议：标题必须严格字面匹配，不能前缀匹配。
// 历史归档存在 `## 7. 对 Roadmap 的再认识` 节，若用 `## 7` 前缀会把错误章节解析成 ledger。
const CHANGE_PLAN_MARKER = "## 4.5 变更计划声明";
const EVIDENCE_LEDGER_MARKER = "## 7. 证据账本";
const CONFIRMED_WORDS = new Set(["兑现", "confirmed"]);
const MISMATCH_WORDS = new Set(["不兑现", "未兑现", "mismatch"]);

function parseTableRows(sectionText, minCols) {
  const out = [];
  if (!sectionText) return out;
  let pastSeparator = false;
  for (const rawLine of sectionText.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("|") || !line.endsWith("|")) continue;
    if (/^\|[\s:|-]+\|$/.test(line)) {
      pastSeparator = true;
      continue;
    }
    if (!pastSeparator) continue;
    const cells = line.slice(1, -1).split("|").map((c) => c.trim());
    if (cells.length < minCols) continue;
    if (cells.every((c) => c === "")) continue;
    out.push(cells);
  }
  return out;
}

function isHeaderOrPlaceholder(file) {
  if (!file) return true;
  if (file === "文件") return true;
  if (file.startsWith("<!--")) return true;
  if (/^-+$/.test(file)) return true;
  return false;
}

function looksLikeFilePath(file) {
  return file.includes(".") || file.includes("/");
}

/**
 * 解析 Analysis-Template.md §4.5 变更计划声明。兼容三列老表（predicted="")。
 * Returns [{ file, type, reason, predicted }]
 */
export function parseChangePlanPredictions(rootDir) {
  const analysisPath = join(rootDir, ".stw", "Analysis-Template.md");
  if (!existsSync(analysisPath)) return [];
  const content = readFileSync(analysisPath, "utf-8");
  return parseChangePlanPredictionsFromContent(content);
}

export function parseChangePlanPredictionsFromContent(content) {
  if (!content || typeof content !== "string") return [];
  const body = sectionBody(content, CHANGE_PLAN_MARKER);
  if (body === null) return [];
  const rows = parseTableRows(body, 3);
  const entries = [];
  for (const cells of rows) {
    const file = cells[0];
    if (isHeaderOrPlaceholder(file)) continue;
    if (!looksLikeFilePath(file)) continue;
    entries.push({
      file,
      type: cells[1] || "",
      reason: cells[2] || "",
      predicted: cells[3] ? cells[3] : "",
    });
  }
  return entries;
}

/**
 * 解析 Summary-Template.md §7 证据账本表。老 Summary 无此节 → 返回 []。
 * Returns [{ file, predicted, actual, verdict }]
 */
export function parseEvidenceLedger(content) {
  if (!content || typeof content !== "string") return [];
  const body = sectionBody(content, EVIDENCE_LEDGER_MARKER);
  if (body === null) return [];
  const rows = parseTableRows(body, 4);
  const entries = [];
  for (const cells of rows) {
    const file = cells[0];
    if (isHeaderOrPlaceholder(file)) continue;
    entries.push({
      file,
      predicted: cells[1] || "",
      actual: cells[2] || "",
      verdict: cells[3] || "",
    });
  }
  return entries;
}

/**
 * phase 3→4 非阻断 gate。对齐 checkDepsChange/checkDocDrift 模式，ok 恒 true。
 * Returns { ok:true, total, filled, missing, coverage, warning }
 */
export function checkEvidence(rootDir) {
  const entries = parseChangePlanPredictions(rootDir);
  const total = entries.length;
  const filled = entries.filter((e) => e.predicted && e.predicted.length > 0).length;
  const missing = entries
    .filter((e) => !e.predicted || e.predicted.length === 0)
    .map((e) => e.file);
  const coverage = total > 0 ? `${filled}/${total}` : "0/0";
  const warning = total > 0 && missing.length > 0
    ? `证据链 ${coverage}: ${missing.length} 条变更未声明预测（非阻断）— ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? " ..." : ""}`
    : null;
  return { ok: true, total, filled, missing, coverage, warning };
}

/**
 * 归档时对账 Summary §7 证据账本。
 * Returns { total, confirmed, mismatches:[{file, predicted, actual, reason}], skipped }
 */
export function checkEvidenceLedger(rootDir) {
  const summaryPath = join(rootDir, ".stw", "Summary-Template.md");
  const summaryContent = existsSync(summaryPath)
    ? readFileSync(summaryPath, "utf-8")
    : "";
  const ledger = parseEvidenceLedger(summaryContent);

  const mismatches = [];
  let confirmed = 0;
  let skipped = 0;

  for (const row of ledger) {
    const verdict = row.verdict.toLowerCase();
    if ([...CONFIRMED_WORDS].some((w) => verdict === w.toLowerCase())) {
      confirmed += 1;
      continue;
    }
    if ([...MISMATCH_WORDS].some((w) => verdict === w.toLowerCase())) {
      mismatches.push({
        file: row.file,
        predicted: row.predicted,
        actual: row.actual,
        reason: "verdict=不兑现",
      });
      continue;
    }
    skipped += 1;
  }

  return { total: ledger.length, confirmed, mismatches, skipped };
}
