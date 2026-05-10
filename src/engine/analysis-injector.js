import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ANALYSIS_FILE = ".stw/Analysis-Template.md";
const BEGIN_MARKER = "<!-- AUTO-INJECTED:similar-cases:BEGIN -->";
const END_MARKER = "<!-- AUTO-INJECTED:similar-cases:END -->";

function analysisPath(rootDir) {
  return join(rootDir, ANALYSIS_FILE);
}

function stripExistingBlock(content) {
  const startIdx = content.indexOf(BEGIN_MARKER);
  if (startIdx === -1) return content;
  const endIdx = content.indexOf(END_MARKER, startIdx);
  if (endIdx === -1) return content;
  const after = endIdx + END_MARKER.length;
  const trailingNewlines = content.slice(after).match(/^\n+/)?.[0].length || 0;
  return content.slice(0, startIdx) + content.slice(after + trailingNewlines);
}

function formatBlock(cases) {
  const lines = [BEGIN_MARKER];
  lines.push("## 🏥 相似病例（自动加载，仅供参考）");
  lines.push("");
  lines.push("> 以下由 `stw start` 根据当前任务描述从 `.stw/error-registry.json` 检索注入。");
  lines.push("> 阅读后请在本节下方的 `## 0.5 需求澄清` 等章节正常填写；不要直接编辑本块——下次 `stw start` 会覆盖。");
  lines.push("");
  for (const c of cases) {
    const phase = c.phase != null ? `阶段 ${c.phase}` : "";
    const title = c.description || "(未描述)";
    lines.push(`- **${title}**${phase ? `  · ${phase}` : ""}`);
    if (c.rootCause) lines.push(`  - 根因：${c.rootCause}`);
    if (c.resolution) lines.push(`  - 解决：${c.resolution}`);
    if (Array.isArray(c.tags) && c.tags.length > 0) {
      lines.push(`  - 标签：${c.tags.join(", ")}`);
    }
  }
  lines.push("");
  lines.push(END_MARKER);
  return lines.join("\n");
}

/**
 * 在 Analysis-Template.md 顶部标题下方注入相似病例块。
 * 幂等：已存在 AUTO-INJECTED 围栏时先删再插。
 * 空 cases：移除旧块（若存在），不插入新块。
 */
export function injectSimilarCases(rootDir, cases) {
  const path = analysisPath(rootDir);
  if (!existsSync(path)) {
    return { ok: false, error: "Analysis-Template.md 不存在" };
  }

  let content = readFileSync(path, "utf-8");
  const stripped = stripExistingBlock(content);

  if (!Array.isArray(cases) || cases.length === 0) {
    if (stripped !== content) {
      writeFileSync(path, stripped);
      return { ok: true, injected: 0, cleared: true };
    }
    return { ok: true, injected: 0, cleared: false };
  }

  const block = formatBlock(cases);
  const headingRegex = /^(#\s+.*\n(?:>\s+.*\n)*)/;
  const match = stripped.match(headingRegex);
  let next;
  if (match) {
    const insertAt = match[0].length;
    next = stripped.slice(0, insertAt) + "\n" + block + "\n" + stripped.slice(insertAt);
  } else {
    next = block + "\n\n" + stripped;
  }

  writeFileSync(path, next);
  return { ok: true, injected: cases.length, cleared: false };
}
