import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { logError } from "./error-registry.js";
import { detectDocDrift, formatDocDriftOutput } from "./doc-drift.js";
import { bumpAuditCounter } from "./audit.js";
import { checkEvidenceLedger } from "./evidence.js";

const REPORTS_DIR = ".stw/reports";

/**
 * Archive the current Summary-Template.md as a timestamped report.
 */
export function archiveReport(rootDir) {
  const summaryPath = join(rootDir, ".stw", "Summary-Template.md");
  if (!existsSync(summaryPath)) {
    return { ok: false, error: "Summary-Template.md 不存在。请先填写总结报告。" };
  }

  const content = readFileSync(summaryPath, "utf-8");
  // Check if user has filled in any actual content beyond the empty template
  const hasUnfilledComment = /<!--\s*(本次任务|最终采用的方案|哪些做法)\s*-->/.test(content);
  const hasEmptyTaskRow = content.includes("| **任务** | |");
  if (hasEmptyTaskRow && hasUnfilledComment) {
    return { ok: false, error: "总结报告尚未填写。请先在 .stw/Summary-Template.md 中完成总结。" };
  }

  const reportsDir = join(rootDir, REPORTS_DIR);
  mkdirSync(reportsDir, { recursive: true });

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  let reportName = `summary-${timestamp}.md`;
  let reportPath = join(reportsDir, reportName);
  let i = 1;
  while (existsSync(reportPath)) {
    reportName = `summary-${timestamp}-${i++}.md`;
    reportPath = join(reportsDir, reportName);
  }

  copyFileSync(summaryPath, reportPath);

  const cases = parseSummaryErrorCases(content);
  let ingested = 0;
  for (const c of cases) {
    logError(rootDir, c);
    ingested += 1;
  }

  let predictionVerdict;
  try {
    const v = checkEvidenceLedger(rootDir);
    predictionVerdict = {
      total: v.total,
      confirmed: v.confirmed,
      mismatchCount: v.mismatches.length,
      skipped: v.skipped,
    };
    for (const m of v.mismatches) {
      logError(rootDir, {
        description: `预测未兑现: ${m.file} — 预测 "${m.predicted}" / 实际 "${m.actual}"`,
        rootCause: m.reason || "predicted ≠ actual",
        resolution: "复盘当时的变更计划，更新后续 Analysis §4.5 的预测颗粒度",
        tags: ["falsifiable", "mismatch", "t12"],
        phase: 5,
      });
      ingested += 1;
    }
  } catch {
    predictionVerdict = undefined;
  }

  let docDrift;
  try {
    const d = detectDocDrift(rootDir);
    docDrift = {
      driftCount: d.issues.length,
      ok: d.ok,
      output: formatDocDriftOutput(d),
    };
  } catch {
    docDrift = undefined;
  }

  let auditPrompt;
  try {
    const bumped = bumpAuditCounter(rootDir);
    auditPrompt = bumped.prompt || undefined;
  } catch {
    auditPrompt = undefined;
  }

  return {
    ok: true,
    path: reportPath,
    name: reportName,
    ingested,
    docDrift,
    auditPrompt,
    predictionVerdict,
  };
}

/**
 * 解析 Summary-Template.md 第 6 节"错误病例"表格。
 * 表头：| 阶段 | 错误描述 | 根因 | 解决方案 | 标签 |
 * 返回可直接喂给 logError 的数组；空行/占位符自动跳过。
 */
export function parseSummaryErrorCases(content) {
  if (!content) return [];
  const headingMatch = content.match(/(^|\n)## 6\. 错误病例(\n|$)/);
  if (!headingMatch) return [];
  const sectionIdx = headingMatch.index + (headingMatch[1] ? 1 : 0);
  const nextSection = content.indexOf("\n## ", sectionIdx + 2);
  const section = content.slice(
    sectionIdx,
    nextSection !== -1 ? nextSection : content.length,
  );

  const cases = [];
  let headerSkipped = false;
  for (const rawLine of section.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("|") || !line.endsWith("|")) continue;
    // Skip the first header row (heuristic: contains both column names)
    if (!headerSkipped && line.includes("阶段") && line.includes("错误描述")) {
      headerSkipped = true;
      continue;
    }
    // Skip separator rows (e.g. | :--- | :--- | ...)
    if (/^\|[\s:|-]+\|$/.test(line)) continue;

    const cells = line.slice(1, -1).split("|").map((c) => c.trim());
    if (cells.length < 5) continue;
    const [phaseCell, desc, rootCause, resolution, tagsCell] = cells;
    if (!desc) continue;

    const phaseMatch = phaseCell.match(/\d+/);
    const tags = tagsCell
      ? tagsCell.split(/[,，、\s]+/).map((t) => t.trim()).filter(Boolean)
      : [];

    cases.push({
      phase: phaseMatch ? parseInt(phaseMatch[0], 10) : 0,
      description: desc,
      rootCause: rootCause || "",
      resolution: resolution || "",
      tags,
    });
  }
  return cases;
}

/**
 * List all archived reports, sorted newest first.
 */
export function listReports(rootDir) {
  const reportsDir = join(rootDir, REPORTS_DIR);
  if (!existsSync(reportsDir)) return [];

  const files = readdirSync(reportsDir)
    .filter((f) => f.startsWith("summary-") && f.endsWith(".md"))
    .sort()
    .reverse();

  return files.map((f) => ({
    name: f,
    path: join(reportsDir, f),
  }));
}

/** Extract first 2 meaningful lines of a markdown section. */
function extractSection(content, sectionMarker) {
  const idx = content.indexOf(sectionMarker);
  if (idx === -1) return "";
  const nextSection = content.indexOf("\n## ", idx + 2);
  const endIdx = nextSection !== -1 ? nextSection : content.length;
  const body = content.slice(idx + sectionMarker.length, endIdx);
  return body
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("|") && !l.startsWith("---"))
    .slice(0, 2)
    .join("; ")
    .trim();
}

/**
 * Get summaries from the most recent N reports.
 */
export function getRecentSummaries(rootDir, count = 3) {
  const reports = listReports(rootDir);
  const recent = reports.slice(0, count);

  return recent.map((r) => {
    const content = readFileSync(r.path, "utf-8");
    const lines = content.split("\n");
    const title = lines.find((l) => l.startsWith("# "))?.replace("# ", "") || r.name;
    const overviewStart = content.indexOf("## 1. 战役概述");
    let snippet;
    if (overviewStart !== -1) {
      const snippetEnd = content.indexOf("## ", overviewStart + 2);
      snippet = content.slice(overviewStart, snippetEnd !== -1 ? snippetEnd : undefined)
        .split("\n").slice(1, 5).join("; ").trim();
    } else {
      snippet = "";
    }
    const lessons = extractSection(content, "## 4. 经验教训");
    const cognitiveInsights = extractSection(content, "## 2. 认知迭代");
    return { name: r.name, title, snippet, lessons, cognitiveInsights };
  });
}
