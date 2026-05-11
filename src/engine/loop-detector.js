import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * T16 Loop detection middleware — PostToolUse hook 扩展：跟踪每文件连续编辑次数，
 * 到阈值即 stderr 注入重审提示。
 *
 * 一手源：
 *   - LangChain ⑤（HARNESS_ENGINEERING.md:166）"LoopDetectionMiddleware tracks
 *     per-file edit counts via tool call hooks"（明写）
 *   - Osmani ② "Agent kept 'finishing' broken code"（隐含）
 *   - OpenAI ① "10+ times in some traces"（隐含）
 *
 * 毛选依据：
 *   《实践论》"感觉只解决现象问题，理论才解决本质问题" —— 打转即停在感性阶段
 *   《矛盾论》"主要矛盾不解决不可退" —— 反复改同一文件常是主矛盾未明
 *
 * 设计要点：
 *   1. 纯函数 + DI —— 计数器不持久化到磁盘（events.jsonl 是唯一事实源）
 *   2. "连续"语义 —— 遇到不同文件或不同 task 立即重置
 *   3. 阈值命中 stderr + exit 2（与 hook.js 既有失败协议一致）但本质是提示，
 *      不阻断任务进度（AI 第 4/5 次仍继续提示）
 *   4. 自带 sync tail reader —— PostToolUse 热路径需 sync IO；events.js 的
 *      readEvents 是 async streaming 不适合在这里调；本模块是 ATTACK_ZONE 内文件
 */

export const DEFAULT_THRESHOLD = 3;
export const DEFAULT_WINDOW = 30;

const EDIT_TOOL_NAMES = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

/**
 * 解析 Claude Code PostToolUse hook 通过 stdin 传入的 JSON payload，返回编辑类
 * 工具作用的 file_path。非编辑类 / 无 file_path / 非法 JSON / 空串 → null。
 */
export function extractFilePath(stdinPayload) {
  if (!stdinPayload || typeof stdinPayload !== "string") return null;
  let parsed;
  try {
    parsed = JSON.parse(stdinPayload);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const toolName = parsed.tool_name;
  if (!toolName || !EDIT_TOOL_NAMES.has(toolName)) return null;
  const toolInput = parsed.tool_input;
  if (!toolInput || typeof toolInput !== "object") return null;
  const filePath = toolInput.file_path;
  return typeof filePath === "string" && filePath.length > 0 ? filePath : null;
}

/**
 * Sync tail reader for events.jsonl. Only used on the PostToolUse hot path
 * where async streaming is overkill. Returns last `limit` hook.run events.
 * Silent on errors — loop detection is advisory, must not poison the hook.
 */
export function readHookRunEventsSync(rootDir, limit = DEFAULT_WINDOW) {
  const path = join(rootDir, ".stw", "events.jsonl");
  if (!existsSync(path)) return [];
  let content;
  try {
    content = readFileSync(path, "utf-8");
  } catch {
    return [];
  }
  const lines = content.split("\n");
  const out = [];
  for (const line of lines) {
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry && entry.type === "hook.run") out.push(entry);
  }
  if (limit > 0 && out.length > limit) return out.slice(-limit);
  return out;
}

/**
 * 从末尾向前扫 events，统计当前 task 下针对 filePath 的连续 hook.run 次数。
 *   - 事件 type 非 hook.run 一律跳过（gate.* / check.* / analyze.run 等都不计数）
 *   - 事件 task !== currentTask → break（跨任务不累加）
 *   - 事件 data.filePath !== filePath → break（不同文件即打断连续）
 *
 * 返回值含义：已计入 events 的连续次数（调用者应确保本次 hook.run 已 append）。
 */
export function countConsecutiveEdits(events, filePath, { currentTask = "" } = {}) {
  if (!Array.isArray(events) || !filePath) return 0;
  let count = 0;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (!e || e.type !== "hook.run") continue;
    if ((e.task || "") !== (currentTask || "")) break;
    const efile = e.data?.filePath;
    if (!efile) break;
    if (efile !== filePath) break;
    count++;
  }
  return count;
}

/**
 * 判定是否应触发 loop 警告。opts.threshold 覆盖默认值。
 * 阈值命中后 count 继续增长仍 shouldWarn=true（设计承诺：提示但不阻断）。
 */
export function detectLoop(events, filePath, opts = {}) {
  const { threshold = DEFAULT_THRESHOLD, currentTask = "" } = opts;
  const count = countConsecutiveEdits(events, filePath, { currentTask });
  return {
    shouldWarn: count >= threshold,
    count,
    threshold,
  };
}

/**
 * Facade: read events (bounded window) + detect. Sync IO path for the hook.
 */
export function detectLoopFromDisk(rootDir, filePath, opts = {}) {
  const { window = DEFAULT_WINDOW, threshold = DEFAULT_THRESHOLD, currentTask = "" } = opts;
  const events = readHookRunEventsSync(rootDir, window);
  return detectLoop(events, filePath, { threshold, currentTask });
}

