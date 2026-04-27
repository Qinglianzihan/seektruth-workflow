import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";

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
  const reportName = `summary-${timestamp}.md`;
  const reportPath = join(reportsDir, reportName);

  copyFileSync(summaryPath, reportPath);

  return { ok: true, path: reportPath, name: reportName };
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
