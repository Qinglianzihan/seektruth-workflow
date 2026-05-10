import { existsSync, readFileSync, appendFileSync, mkdirSync, renameSync, statSync, createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";

export const EVENTS_FILE = ".stw/events.jsonl";
export const EVENTS_ROTATED = ".stw/events.jsonl.1";
export const MAX_EVENTS_LINES = 10_000;

function eventsPath(rootDir) {
  return join(rootDir, EVENTS_FILE);
}

function rotatedPath(rootDir) {
  return join(rootDir, EVENTS_ROTATED);
}

function defaultClock() {
  return new Date().toISOString();
}

function defaultIdGen() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readProgressSnapshot(rootDir) {
  const path = join(rootDir, ".stw", ".progress.json");
  if (!existsSync(path)) return { task: "", phase: null };
  try {
    const progress = JSON.parse(readFileSync(path, "utf-8"));
    const rawTask = typeof progress.taskDescription === "string" ? progress.taskDescription : "";
    const task = Array.from(rawTask).slice(0, 80).join("");
    const phase = progress.phase ?? null;
    return { task, phase };
  } catch {
    return { task: "", phase: null };
  }
}

/**
 * UTF-8 safe truncation. Uses Array.from to honor surrogate pairs so CJK /
 * emoji characters never get split mid-codepoint. Never throws.
 */
export function truncateForEvent(value, maxLen = 2000) {
  if (value == null) return value;
  if (typeof value !== "string") return value;
  const chars = Array.from(value);
  if (chars.length <= maxLen) return value;
  return chars.slice(0, maxLen).join("") + `…(+${chars.length - maxLen})`;
}

/**
 * Append a structured event. Never throws, never blocks the caller: logging
 * must not poison the workflow. Returns { ok, error? } for tests only.
 */
export function appendEvent(rootDir, type, data = {}, deps = {}) {
  const { clock = defaultClock, idGen = defaultIdGen } = deps;
  try {
    if (!rootDir || typeof type !== "string" || !type) {
      return { ok: false, error: "invalid arguments" };
    }
    const stwDir = join(rootDir, ".stw");
    if (!existsSync(stwDir)) {
      mkdirSync(stwDir, { recursive: true });
    }
    const { task, phase } = readProgressSnapshot(rootDir);
    const record = {
      ts: clock(),
      id: idGen(),
      type,
      task,
      phase,
      data: data ?? {},
    };
    const line = JSON.stringify(record) + "\n";
    appendFileSync(eventsPath(rootDir), line);
    rotateIfLarge(rootDir);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Rotate the events file when it grows past the line budget. Keeps exactly one
 * archive (events.jsonl.1). Idempotent and tolerant of concurrent callers —
 * ENOENT on rename is swallowed.
 */
export function rotateIfLarge(rootDir, max = MAX_EVENTS_LINES) {
  const path = eventsPath(rootDir);
  try {
    if (!existsSync(path)) return { ok: true, rotated: false };
    const size = statSync(path).size;
    // Cheap prefilter: minimum realistic event JSON is ~55 bytes, so 10 bytes
    // per line is a safe lower bound that skips the line count on tiny files
    // without under-counting in the rotation threshold.
    if (size < max * 10) return { ok: true, rotated: false };

    let lineCount = 0;
    const content = readFileSync(path, "utf-8");
    for (let i = 0; i < content.length; i++) {
      if (content.charCodeAt(i) === 10) lineCount++;
    }
    if (lineCount < max) return { ok: true, rotated: false };

    renameSync(path, rotatedPath(rootDir));
    return { ok: true, rotated: true };
  } catch (err) {
    if (err.code === "ENOENT") return { ok: true, rotated: false };
    return { ok: false, error: err.message };
  }
}

function matchesType(eventType, pattern) {
  if (!pattern) return true;
  if (pattern === eventType) return true;
  if (pattern.endsWith(".*")) {
    const prefix = pattern.slice(0, -1);
    return eventType.startsWith(prefix);
  }
  if (pattern.endsWith("*")) {
    return eventType.startsWith(pattern.slice(0, -1));
  }
  return eventType === pattern;
}

/**
 * Read events from .stw/events.jsonl. Streaming line reader + optional
 * post-filter. Malformed lines are skipped silently. Returns newest-last.
 */
export async function readEvents(rootDir, { limit, typeFilter, taskFilter } = {}) {
  const path = eventsPath(rootDir);
  if (!existsSync(path)) return [];

  const events = [];
  const rl = createInterface({
    input: createReadStream(path, { encoding: "utf-8", highWaterMark: 64 * 1024 }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeFilter && !matchesType(entry.type || "", typeFilter)) continue;
    if (taskFilter && !(entry.task || "").includes(taskFilter)) continue;
    events.push(entry);
  }

  if (typeof limit === "number" && limit > 0 && events.length > limit) {
    return events.slice(-limit);
  }
  return events;
}
