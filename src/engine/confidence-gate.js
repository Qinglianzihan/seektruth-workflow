import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// 本地停用词表（不复用 error-registry.extractKeywords，因其 2-4 字 CJK 滑窗稀释命中率）。
// 规划师审查要求：系统/机制/工具/模块/方法/逻辑 不列入——STW 语境常作领域关键词。
const STOPWORDS_ZH = new Set([
  "完善", "优化", "实现", "添加", "增加", "修改", "改进", "需要", "能够",
  "支持", "提供", "使用", "一个", "这个", "那个", "进行", "做到", "要求",
  "引入", "重构", "调整", "下面", "上面", "以上", "以下", "通过", "关于",
  "对于", "使得", "并且", "以及", "或者", "比如", "例如", "目前", "现在",
]);
const STOPWORDS_EN = new Set([
  "the", "and", "for", "with", "should", "can", "will", "make", "add",
  "use", "support", "implement", "improve", "into", "from", "this", "that",
  "need", "want", "require", "provide", "enable", "via", "when", "where",
]);

const TABLE_SEPARATOR_RE = /^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/;

function findNextSection(content, from) {
  const m = content.slice(from).match(/\n## /);
  return m ? from + m.index : content.length;
}

function sectionBody(fullContent, sectionMarker) {
  const idx = fullContent.indexOf(sectionMarker);
  if (idx === -1) return null;
  const endIdx = findNextSection(fullContent, idx + sectionMarker.length);
  return fullContent.slice(idx + sectionMarker.length, endIdx);
}

function sectionHasContent(fullContent, sectionMarker) {
  const body = sectionBody(fullContent, sectionMarker);
  if (body === null) return false;
  const meaningful = body
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/[\s|:\-–—]+/g, "")
    .trim();
  return meaningful.length > 20;
}

/**
 * 反本本主义：章节必须有"真数据行"（至少 minCols 列非空），而非只有表头。
 * 找不到 markdown 分隔符（`| --- | --- |`）直接判 false，封死"省略分隔符绕过"。
 */
function tableHasFilledRow(fullContent, sectionMarker, minCols) {
  const body = sectionBody(fullContent, sectionMarker);
  if (body === null) return false;
  const lines = body.split("\n");
  let sepIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (TABLE_SEPARATOR_RE.test(lines[i])) {
      sepIdx = i;
      break;
    }
  }
  if (sepIdx === -1) return false;
  for (let i = sepIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === "") break;
    if (trimmed.startsWith("## ")) break;
    if (!trimmed.startsWith("|")) break;
    if (TABLE_SEPARATOR_RE.test(line)) continue;
    const cells = trimmed
      .slice(1, trimmed.endsWith("|") ? -1 : undefined)
      .split("|")
      .map((c) => c.replace(/<!--[\s\S]*?-->/g, "").trim());
    const nonEmpty = cells.filter((c) => c.length > 0).length;
    if (nonEmpty >= minCols) return true;
  }
  return false;
}

/**
 * 有的放矢：从任务描述抽关键词——中文抽最长连续片段（非滑窗），英文抽 ≥ 3 字母。
 * 过滤本地停用词表，去重保序。
 */
function extractTaskKeywords(taskDescription) {
  if (!taskDescription || typeof taskDescription !== "string") return [];
  const seen = new Set();
  const out = [];
  const english = taskDescription.match(/[a-zA-Z][a-zA-Z0-9_-]{2,}/g) || [];
  for (const w of english) {
    const k = w.toLowerCase();
    if (seen.has(k)) continue;
    if (STOPWORDS_EN.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  const cjk = taskDescription.match(/[一-鿿]{2,}/g) || [];
  for (const seg of cjk) {
    if (seen.has(seg)) continue;
    if (STOPWORDS_ZH.has(seg)) continue;
    seen.add(seg);
    out.push(seg);
  }
  return out;
}

function readTaskDescription(rootDir) {
  const path = join(rootDir, ".stw", ".progress.json");
  if (!existsSync(path)) return "";
  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    return typeof data.taskDescription === "string" ? data.taskDescription : "";
  } catch {
    return "";
  }
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

  const sectionSteps = [
    { label: "需求澄清 — 向用户提问", marker: "## 0.5 需求澄清" },
    { label: "表层需求 → 深层需求 — 透过现象看本质", marker: "## 1.0 表层需求" },
    { label: "项目风格侦察 — 从群众中来", marker: "## 1.5 项目风格侦察" },
    { label: "外部调研 — 最佳实践与前人成果", marker: "## 1.6 外部调研" },
    { label: "去粗 — 过滤噪音", marker: "## 2.1 去粗" },
    { label: "取精 — 提取精华", marker: "## 2.2 取精" },
    { label: "去伪 — 消除假象", marker: "## 2.3 去伪" },
    { label: "存真 — 保留真相", marker: "## 2.4 存真" },
    { label: "由此及彼 — 追溯关联", marker: "## 2.5 由此及彼" },
    { label: "由表及里 — 直达根因 + 隐含约束", marker: "## 2.6 由表及里" },
    { label: "初步方案", marker: "## 4. 初步方案" },
    { label: "变更计划声明", marker: "## 4.5 变更计划声明" },
  ];
  for (const step of sectionSteps) {
    if (!sectionHasContent(content, step.marker)) {
      gaps.push(`${step.label} — 尚未填写`);
    }
  }

  // 调查方法自审 — 拆 2 步（§0.5 + §1.6）。反本本主义：不做正确的调查同样没有发言权。
  if (!tableHasFilledRow(content, "## 0.5 需求澄清", 3)) {
    gaps.push(
      "调查方法自审 — §0.5 至少需要一行『# + 问题 + 用户回答』三列均非空（反对本本主义）"
    );
  }
  if (!tableHasFilledRow(content, "## 1.6 外部调研", 3)) {
    gaps.push(
      "调查方法自审 — §1.6 至少需要一行『方向 + 搜索结果 + 可借鉴的点』三列均非空（反对本本主义）"
    );
  }

  // 有的放矢 — 任务关键词命中率 ≥ 50%。《改造我们的学习》："的"就是箭靶子。
  const taskDescription = readTaskDescription(rootDir);
  const keywords = extractTaskKeywords(taskDescription);
  let targetedSkipped = true;
  if (keywords.length >= 2) {
    targetedSkipped = false;
    const bgBody = sectionBody(content, "## 1. 任务背景") || "";
    const planBody = sectionBody(content, "## 4. 初步方案") || "";
    const haystack = (bgBody + "\n" + planBody).toLowerCase();
    const missed = keywords.filter((k) => !haystack.includes(k));
    const hit = keywords.length - missed.length;
    if (hit / keywords.length < 0.5) {
      gaps.push(
        `有的放矢 — 任务关键词命中 ${hit}/${keywords.length}，未命中: [${missed.join(", ")}]（改造我们的学习）`
      );
    }
  }

  // 反主观主义：源码引用 ≥ 2 条。citation gap 是"额外罚分"——计入 gaps 但不占 step 分母。
  const citationPattern = /\([^)]*\.[a-z]{1,8}:\d+\)/g;
  const citations = content.match(citationPattern) || [];
  const citationGap =
    citations.length < 2
      ? "源码引用 — 至少需要 2 条 (file:line) 格式引用，禁止主观臆断"
      : null;
  if (citationGap) gaps.push(citationGap);

  // 分母：12 既有章节 + 2 自审 + (targeted skip ? 0 : 1)；citation gap 不占分母位。
  const baseSteps = sectionSteps.length + 2;
  const effectiveSteps = baseSteps + (targetedSkipped ? 0 : 1);
  const nonCitationGapCount = gaps.length - (citationGap ? 1 : 0);
  const filled = effectiveSteps - nonCitationGapCount;
  const score = Math.round((filled / effectiveSteps) * 10);

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
