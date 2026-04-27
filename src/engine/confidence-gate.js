import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function findNextSection(content, from) {
  const m = content.slice(from).match(/\n## /);
  return m ? from + m.index : content.length;
}

function sectionHasContent(fullContent, sectionMarker) {
  const idx = fullContent.indexOf(sectionMarker);
  if (idx === -1) return false;

  const endIdx = findNextSection(fullContent, idx + sectionMarker.length);
  const sectionBody = fullContent.slice(idx + sectionMarker.length, endIdx);
  // Strip HTML comments and whitespace, check for meaningful text
  const meaningful = sectionBody
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/[\s|:\-–—]+/g, "")
    .trim();
  return meaningful.length > 20;
}

/**
 * 评估阶段 1 的调研是否充分。
 * Returns { ready, score, gaps }
 */
export function assessConfidence(rootDir) {
  const analysisPath = join(rootDir, ".stw", "Analysis-Template.md");
  if (!existsSync(analysisPath)) {
    return { ready: false, score: 0, gaps: ["Analysis-Template.md 不存在"] };
  }

  const content = readFileSync(analysisPath, "utf-8");
  const gaps = [];

  const steps = [
    { label: "项目风格侦察 — 从群众中来", marker: "## 1.5 项目风格侦察" },
    { label: "去粗 — 过滤噪音", marker: "## 2.1 去粗" },
    { label: "取精 — 提取精华", marker: "## 2.2 取精" },
    { label: "去伪 — 消除假象", marker: "## 2.3 去伪" },
    { label: "存真 — 保留真相", marker: "## 2.4 存真" },
    { label: "由此及彼 — 追溯关联", marker: "## 2.5 由此及彼" },
    { label: "由表及里 — 直达根因", marker: "## 2.6 由表及里" },
    { label: "初步方案", marker: "## 4. 初步方案" },
  ];

  for (const step of steps) {
    if (!sectionHasContent(content, step.marker)) {
      gaps.push(`${step.label} — 尚未填写`);
    }
  }

  // Source citation check (反对主观主义)
  const citationPattern = /\([^)]*\.[a-z]{1,8}:\d+\)/g;
  const citations = content.match(citationPattern) || [];
  if (citations.length < 2) {
    gaps.push("源码引用 — 至少需要 2 条 (file:line) 格式引用，禁止主观臆断");
  }

  const filled = steps.length - gaps.length;
  const score = Math.round((filled / steps.length) * 10);

  return { ready: score >= 5, score, gaps };
}

/**
 * 读取置信度自评分（从 "## 0. 战前评估" 中解析 "x/10" 格式）
 */
export function readSelfRating(rootDir) {
  const analysisPath = join(rootDir, ".stw", "Analysis-Template.md");
  if (!existsSync(analysisPath)) return null;

  const content = readFileSync(analysisPath, "utf-8");
  const sectionIdx = content.indexOf("## 0. 战前评估");
  if (sectionIdx === -1) return null;

  const endIdx = findNextSection(content, sectionIdx);
  const section = content.slice(sectionIdx, endIdx);
  const match = section.match(/(\d+)\s*\/\s*10/);
  if (match) return parseInt(match[1], 10);

  return null;
}
