import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getCurrentPhase } from "./state-machine.js";
import { runCheck } from "./check.js";
import { checkFileBounds } from "./lockdown.js";
import { appendEvent, truncateForEvent } from "./events.js";
import {
  DEFAULT_THRESHOLD,
  DEFAULT_WINDOW,
  extractFilePath,
  detectLoop,
  readHookRunEventsSync,
} from "./loop-detector.js";

function readCurrentTask(rootDir) {
  const path = join(rootDir, ".stw", ".progress.json");
  if (!existsSync(path)) return "";
  try {
    const p = JSON.parse(readFileSync(path, "utf-8"));
    const raw = typeof p.taskDescription === "string" ? p.taskDescription : "";
    return Array.from(raw).slice(0, 80).join("");
  } catch {
    return "";
  }
}

/**
 * Run the STW hook for a given event. Designed to be invoked by Claude Code
 * PostToolUse hook after Edit/Write tool calls.
 *
 * Silent success protocol: exit 0 with empty stderr → Claude Code ignores.
 * Failure injection protocol: exit 2 + stderr text → Claude Code feeds stderr
 * back to the agent in its next turn.
 *
 * Scope (lightweight, phase-aware):
 *   - no .stw/.progress.json → exit 0 (not in an STW task)
 *   - always run lint gate (Gate A)
 *   - phase ≥ 3 → also run attack-zone file bounds check
 *   - stdinPayload carries PostToolUse JSON → T16 loop detection (per-file
 *     consecutive edit counter; threshold 3)
 *
 * Returns { exitCode, stderr } instead of calling process.exit, so tests can
 * assert on the result. The CLI wrapper translates the return value into a
 * real exit.
 *
 * `deps` is for testability — production callers pass nothing.
 */
export function runHook({ rootDir, event = "PostToolUse", stdinPayload = "" } = {}, deps = {}) {
  const {
    lintRunner = (dir) => runCheck(dir, ["lint"]),
    boundsRunner = checkFileBounds,
    phaseReader = getCurrentPhase,
    eventsReader = (dir) => readHookRunEventsSync(dir, DEFAULT_WINDOW),
    loopThreshold = DEFAULT_THRESHOLD,
  } = deps;

  const progressPath = join(rootDir, ".stw", ".progress.json");
  if (!existsSync(progressPath)) {
    return { exitCode: 0, stderr: "" };
  }

  const failures = [];

  try {
    const lintResult = lintRunner(rootDir);
    if (!lintResult.ok) {
      const out = lintResult.results?.lint?.output?.trim() || "lint failed";
      failures.push(`[stw hook] lint 未通过：\n${out}`);
    }
  } catch (err) {
    failures.push(`[stw hook] lint 执行出错：${err.message}`);
  }

  const current = phaseReader(rootDir);
  if (current && typeof current.phase === "number" && current.phase >= 3) {
    try {
      const bounds = boundsRunner(rootDir);
      if (!bounds.ok) {
        if (bounds.error) {
          failures.push(`[stw hook] 范围检查：${bounds.error}`);
        } else if (bounds.violations.length > 0) {
          const list = bounds.violations.map((f) => `  · ${f}`).join("\n");
          failures.push(
            `[stw hook] 检测到 ${bounds.violations.length} 个文件越界（ATTACK_ZONE: ${bounds.zones.join(", ")}）：\n${list}\n请回滚越界修改，或在 STW-Workspace.md 中补充 ATTACK_ZONE 声明。`
          );
        }
      }
    } catch (err) {
      failures.push(`[stw hook] 范围检查执行出错：${err.message}`);
    }
  }

  // T16 loop detection: PostToolUse carries tool_name + tool_input.file_path.
  // Order: append hook.run FIRST (with filePath) so "this edit" is counted,
  // then read events back and judge. Resets on file change / task change.
  // Emits a single hook.run per call (with filePath when detectable);
  // hook.loop-detected is a separate diagnostic event if threshold is hit.
  const filePath = extractFilePath(stdinPayload);
  const hookData = {
    event,
    exitCode: failures.length > 0 ? 2 : 0,
    failureCount: failures.length,
  };
  if (filePath) hookData.filePath = filePath;
  if (failures.length > 0) {
    hookData.failures = failures.map((f) => truncateForEvent(f, 500));
  }
  appendEvent(rootDir, "hook.run", hookData);

  if (filePath) {
    try {
      const events = eventsReader(rootDir);
      if (Array.isArray(events)) {
        const r = detectLoop(events, filePath, {
          threshold: loopThreshold,
          currentTask: readCurrentTask(rootDir),
        });
        if (r.shouldWarn) {
          appendEvent(rootDir, "hook.loop-detected", {
            filePath,
            count: r.count,
            threshold: r.threshold,
          });
          failures.push(
            `[stw hook] 检测到连续 ${r.count} 次编辑同一文件 ${filePath} —— 考虑重新审视方案（《实践论》：打转就是停在感性阶段；《矛盾论》：主要矛盾未解决不要反复调整症状）。建议：回到 Analysis §3 核对主要矛盾，或让独立规划师重审路径。`
          );
        }
      }
    } catch {
      // loop detection is advisory; failures here must not poison the hook
    }
  }

  if (failures.length === 0) {
    return { exitCode: 0, stderr: "" };
  }
  return {
    exitCode: 2,
    stderr: failures.join("\n\n") + `\n\n(event: ${event})`,
  };
}
