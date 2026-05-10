import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const REGISTRY_FILE = ".stw/error-registry.json";

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
 * Log an error entry to the registry.
 */
export function logError(rootDir, entry) {
  const registry = readRegistry(rootDir);
  const error = {
    id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    description: entry.description || "",
    rootCause: entry.rootCause || "",
    resolution: entry.resolution || "",
    tags: entry.tags || [],
    relatedFiles: entry.relatedFiles || [],
    phase: entry.phase || 0,
    timestamp: new Date().toISOString(),
  };
  registry.push(error);
  writeRegistry(rootDir, registry);
  return { ok: true, id: error.id };
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
  // Return a copy to prevent mutation
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
 */
export function findRelatedErrorsByTask(rootDir, taskDescription, limit = 3) {
  const keywords = extractKeywords(taskDescription);
  if (keywords.length === 0) return [];
  return getRelatedErrors(rootDir, keywords, limit);
}

/**
 * Produce summary insights: count, top tags, recent entries.
 */
export function getErrorInsights(rootDir) {
  const registry = readRegistry(rootDir);
  if (registry.length === 0) return { total: 0, byPhase: {}, topTags: [], recent: [] };

  const byPhase = {};
  const byTag = {};
  for (const e of registry) {
    const pKey = String(e.phase);
    byPhase[pKey] = (byPhase[pKey] || 0) + 1;
    for (const tag of e.tags) {
      byTag[tag] = (byTag[tag] || 0) + 1;
    }
  }

  const topTags = Object.entries(byTag)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag);

  const recent = registry.slice(-3).reverse().map((e) => ({
    desc: e.description,
    resolution: e.resolution,
    phase: e.phase,
  }));

  return { total: registry.length, byPhase, topTags, recent };
}
