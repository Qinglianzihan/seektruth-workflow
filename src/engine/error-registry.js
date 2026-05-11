import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";

const REGISTRY_FILE = ".stw/error-registry.json";

/**
 * T17 Skill Issue 归因 —— 四类 category.
 *   - model:       模型侧问题（幻觉/遗忘/工具参数误用/记忆坑）
 *   - harness:     harness 自造的问题（parser bug / 正则边界 / indexOf 锚点 / DRY 违反 / 预测不兑现）
 *   - description: 描述/口径问题（任务描述模糊 / 文档一致性 / 指令歧义）
 *   - unknown:     启发式无法判定或证据不足
 *
 * 一手源：Osmani ② §The "skill issue" reframe（`HARNESS_ENGINEERING.md:156`）
 * 毛选：《反对本本主义》"不做正确的调查同样没有发言权" —— 先查自己 harness。
 */
export const CATEGORY_VALUES = ["model", "harness", "description", "unknown"];

// 关键词 → category 启发式映射（保守：至少 2 个 keyword 匹配才归类，1 个 → unknown）
const HEURISTIC_KEYWORDS = {
  harness: [
    "parser", "parse", "regex", "正则", "indexOf", "锚点", "anchor",
    "findsection", "findnextsection", "sectionbody",
    "dry", "重复实现", "同型", "同类 bug", "harness-self",
    "attack-zone", "attack_zone", "boundary", "越界",
    "预测", "不兑现", "mismatch", "falsifiable",
    "回归", "回归风险", "自愈", "硬编码阈值", "参数化",
    "残留", "尾截断", "就近归属", "全局正则", "状态泄漏",
    "template", "residue", "lint",
  ],
  model: [
    "幻觉", "hallucination", "记忆幻觉", "遗忘", "串味",
    "工具参数", "tool-input", "tool_input", "wrong-tool", "工具误用",
    "自审必自夸", "主观臆断",
  ],
  description: [
    "口径", "口径不一致", "文案一致性", "一手源挂错", "一手源挂羊头",
    "描述", "任务描述", "指令", "歧义", "表格口径",
    "本本主义", "记忆坑",
  ],
};

function registryPath(rootDir) {
  return join(rootDir, REGISTRY_FILE);
}

function readRegistry(rootDir) {
  const path = registryPath(rootDir);
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return [];
  }
}

function writeRegistry(rootDir, data) {
  const path = registryPath(rootDir);
  mkdirSync(join(rootDir, ".stw"), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}

/**
 * T17: 分隔 tags 字符串的新规则。在原 split 基础上加入 `/` 与 `·` 当分隔符；
 * 过滤纯标点 / 含换行 / 含反引号 / 纯数字+点 / 表格残片。
 * 输入字符串或数组都能吃，输出去重保序的合法 tags。
 */
export function splitTags(input) {
  if (input == null) return [];
  const parts = [];
  if (Array.isArray(input)) {
    for (const item of input) {
      if (item == null) continue;
      for (const seg of String(item).split(/[,，、\s/·]+/)) parts.push(seg);
    }
  } else {
    for (const seg of String(input).split(/[,，、\s/·]+/)) parts.push(seg);
  }
  const out = [];
  const seen = new Set();
  for (const raw of parts) {
    const t = cleanupOneTag(raw);
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function cleanupOneTag(raw) {
  if (raw == null) return "";
  let t = String(raw).trim();
  if (!t) return "";
  if (/[\n\r]/.test(t)) return "";
  if (/`/.test(t)) return "";
  // Strip wrapper brackets / parens / quotes first (common in hand-written tags)
  t = t.replace(/^[[(（「『《]+/, "").replace(/[\])）」』》]+$/, "").trim();
  if (!t) return "";
  // Reject if any *remaining* structural / markdown chars (unbalanced paren, hash, backslash)
  if (/[\\#)(（）「」『』《》]/.test(t)) return "";
  // Reject if no letter or number at all (Unicode-aware; CJK letters count as \p{L})
  if (!/[\p{L}\p{N}]/u.test(t)) return "";
  if (/^\d+\.?$/.test(t)) return ""; // numbered list residue
  if (t.length > 40) return "";
  if (t.length < 2) return "";
  return t;
}

/**
 * T17: 清洗 tags —— 把数组里每项再跑一次 splitTags（拆 `/` 分隔的合并 tag）+ 过滤。
 */
export function cleanupTags(tags) {
  if (!Array.isArray(tags)) return [];
  const expanded = [];
  for (const t of tags) {
    if (typeof t !== "string") continue;
    for (const piece of splitTags(t)) expanded.push(piece);
  }
  // final dedupe preserving order
  const seen = new Set();
  const out = [];
  for (const t of expanded) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * T17: 启发式归类。纯函数；不读文件、不调用外部。
 * 规则：description / rootCause / tags / resolution 拼接成小写文本，按类别关键词计分；
 * 得分最高类胜出；所有类 score < 2 则归 unknown；平票归 unknown。
 */
export function categorize(entry = {}) {
  const text = [
    entry.description || "",
    entry.rootCause || "",
    entry.resolution || "",
    ...(entry.tags || []),
  ].join(" ").toLowerCase();

  const scores = { harness: 0, model: 0, description: 0 };
  for (const [cat, keywords] of Object.entries(HEURISTIC_KEYWORDS)) {
    for (const kw of keywords) {
      if (text.includes(kw.toLowerCase())) scores[cat]++;
    }
  }

  const entries = Object.entries(scores);
  entries.sort((a, b) => b[1] - a[1]);
  const [topCat, topScore] = entries[0];
  const [, secondScore] = entries[1];
  if (topScore < 2) return "unknown";
  if (topScore === secondScore) return "unknown"; // tie → unknown (conservative)
  return topCat;
}

/**
 * Log an error entry to the registry.
 * T17: 入库前自动 cleanupTags + categorize（若调用方未显式提供）。
 */
export function logError(rootDir, entry) {
  const registry = readRegistry(rootDir);
  const cleanedTags = cleanupTags(entry.tags || []);
  const error = {
    id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    description: entry.description || "",
    rootCause: entry.rootCause || "",
    resolution: entry.resolution || "",
    tags: cleanedTags,
    category: entry.category && CATEGORY_VALUES.includes(entry.category)
      ? entry.category
      : categorize({
          description: entry.description,
          rootCause: entry.rootCause,
          resolution: entry.resolution,
          tags: cleanedTags,
        }),
    relatedFiles: entry.relatedFiles || [],
    phase: entry.phase || 0,
    timestamp: new Date().toISOString(),
  };
  registry.push(error);
  writeRegistry(rootDir, registry);
  return { ok: true, id: error.id };
}

/**
 * T17: One-shot migrate —— 把既有 registry 里每条的 tags 清洗一次 + 补 category。
 * 幂等：多次运行结果字节完全相同。dryRun 时不写文件，仅返回 diff 概要。
 * 写入前自动备份 `error-registry.json.backup-<ts>`。
 */
export function cleanRegistry(rootDir, { dryRun = false } = {}) {
  const path = registryPath(rootDir);
  if (!existsSync(path)) {
    return { ok: true, total: 0, cleanedTagCount: 0, backfilledCategory: 0, backupPath: null };
  }
  const registry = readRegistry(rootDir);
  let cleanedTagCount = 0;
  let backfilledCategory = 0;
  const next = registry.map((e) => {
    const before = Array.isArray(e.tags) ? e.tags.slice() : [];
    const after = cleanupTags(before);
    if (before.join("|") !== after.join("|")) cleanedTagCount++;
    const hasValidCategory = e.category && CATEGORY_VALUES.includes(e.category);
    const category = hasValidCategory
      ? e.category
      : categorize({ description: e.description, rootCause: e.rootCause, resolution: e.resolution, tags: after });
    if (!hasValidCategory) backfilledCategory++;
    return { ...e, tags: after, category };
  });

  if (dryRun) {
    return {
      ok: true,
      total: registry.length,
      cleanedTagCount,
      backfilledCategory,
      backupPath: null,
      dryRun: true,
    };
  }

  // backup
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupPath = `${path}.backup-${ts}`;
  try {
    copyFileSync(path, backupPath);
  } catch {
    // swallow backup failure — don't block cleanup itself
  }
  writeRegistry(rootDir, next);
  return {
    ok: true,
    total: registry.length,
    cleanedTagCount,
    backfilledCategory,
    backupPath,
  };
}

/**
 * Search for errors matching given keywords.
 * Returns empty results and sorts by recency when keywords are empty.
 */
export function getRelatedErrors(rootDir, keywords = [], limit = 5) {
  const registry = readRegistry(rootDir);
  if (registry.length === 0) return [];

  if (keywords.length === 0) {
    return registry.slice(-Math.min(limit, registry.length)).reverse();
  }

  const lowerKeywords = keywords.map((k) => k.toLowerCase());
  const scored = registry.map((entry) => {
    const searchText = [
      entry.description || "",
      entry.rootCause || "",
      entry.resolution || "",
      ...(entry.tags || []),
    ].join(" ").toLowerCase();
    const score = lowerKeywords.reduce((sum, kw) => sum + (searchText.includes(kw) ? 1 : 0), 0);
    return { entry, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.entry.timestamp.localeCompare(a.entry.timestamp))
    .slice(0, limit)
    .map((s) => s.entry);
}

/**
 * Return all errors in the registry.
 */
export function getAllErrors(rootDir) {
  return [...readRegistry(rootDir)];
}

/**
 * 从任务描述中提取用于检索的关键词。
 * 策略：抽取英文单词 (≥2 字符) + 中文按标点/空格分段后的 2-4 字片段。
 * 去重、小写化、长度筛选。
 */
export function extractKeywords(text) {
  if (!text || typeof text !== "string") return [];
  const seen = new Set();
  const out = [];

  const englishWords = text.match(/[A-Za-z][A-Za-z0-9_-]{1,}/g) || [];
  for (const w of englishWords) {
    const k = w.toLowerCase();
    if (k.length >= 2 && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }

  const cjkSegments = text.match(/[一-鿿]{2,}/g) || [];
  for (const seg of cjkSegments) {
    for (let len = 2; len <= 4; len++) {
      for (let i = 0; i + len <= seg.length; i++) {
        const k = seg.slice(i, i + len);
        if (!seen.has(k)) {
          seen.add(k);
          out.push(k);
        }
      }
    }
  }

  return out;
}

/**
 * 基于任务描述检索相关病例（治病救人闭环的"查找相似病例"入口）。
 * T17: opts.groupByCategory=true → 返回按 category 分组的对象而非 flat array。
 */
export function findRelatedErrorsByTask(rootDir, taskDescription, limit = 3, opts = {}) {
  const keywords = extractKeywords(taskDescription);
  if (keywords.length === 0) {
    return opts.groupByCategory ? { model: [], harness: [], description: [], unknown: [] } : [];
  }
  const hits = getRelatedErrors(rootDir, keywords, limit);
  if (!opts.groupByCategory) return hits;
  const grouped = { model: [], harness: [], description: [], unknown: [] };
  for (const h of hits) {
    const cat = CATEGORY_VALUES.includes(h.category) ? h.category : "unknown";
    grouped[cat].push(h);
  }
  return grouped;
}

/**
 * Produce summary insights: count, top tags, recent entries.
 * T17: 增 byCategory 聚合。
 */
export function getErrorInsights(rootDir) {
  const registry = readRegistry(rootDir);
  if (registry.length === 0) {
    return { total: 0, byPhase: {}, topTags: [], recent: [] };
  }

  const byPhase = {};
  const byTag = {};
  const byCategory = { model: 0, harness: 0, description: 0, unknown: 0 };
  for (const e of registry) {
    const pKey = String(e.phase);
    byPhase[pKey] = (byPhase[pKey] || 0) + 1;
    for (const tag of e.tags || []) {
      byTag[tag] = (byTag[tag] || 0) + 1;
    }
    const cat = CATEGORY_VALUES.includes(e.category) ? e.category : "unknown";
    byCategory[cat]++;
  }

  const topTags = Object.entries(byTag)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag);

  const recent = registry.slice(-3).reverse().map((e) => ({
    desc: e.description,
    resolution: e.resolution,
    phase: e.phase,
    category: e.category,
  }));

  return { total: registry.length, byPhase, byCategory, topTags, recent };
}
