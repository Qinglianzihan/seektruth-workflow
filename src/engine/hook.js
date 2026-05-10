import { existsSync } from "node:fs";
import { join } from "node:path";
import { getCurrentPhase } from "./state-machine.js";
import { runCheck } from "./check.js";
import { checkFileBounds } from "./lockdown.js";
import { appendEvent, truncateForEvent } from "./events.js";

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
 *
 * Returns { exitCode, stderr } instead of calling process.exit, so tests can
 * assert on the result. The CLI wrapper translates the return value into a
 * real exit.
 *
 * `deps` is for testability — production callers pass nothing.
 */
export function runHook({ rootDir, event = "PostToolUse" } = {}, deps = {}) {
  const {
    lintRunner = (dir) => runCheck(dir, ["lint"]),
    boundsRunner = checkFileBounds,
    phaseReader = getCurrentPhase,
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

  if (failures.length === 0) {
    appendEvent(rootDir, "hook.run", { event, exitCode: 0, failureCount: 0 });
    return { exitCode: 0, stderr: "" };
  }
  appendEvent(rootDir, "hook.run", {
    event,
    exitCode: 2,
    failureCount: failures.length,
    failures: failures.map((f) => truncateForEvent(f, 500)),
  });
  return {
    exitCode: 2,
    stderr: failures.join("\n\n") + `\n\n(event: ${event})`,
  };
}
