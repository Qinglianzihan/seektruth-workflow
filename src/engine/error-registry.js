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
