import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getCurrentPhase, PHASES } from "./state-machine.js";
import { appendEvent } from "./events.js";

/**
 * T11 Ralph Loop Stop hook — 补 T2 未做的另一半（intercept-exit）.
 *
 * 协议：沿用 T2 的 exit-2+stderr 模式（而非 JSON decision:block），返回
 * { exitCode, stderr } 供 CLI wrapper 翻译成真实 exit。
 *
 * 判据（白名单式，防御未来新 phase）：
 *   - .stw/.progress.json 不存在 → exit 0（不是 STW 任务）
 *   - stop_hook_active === true → exit 0（官方硬约束：防无限循环）
 *   - typeof phase === "number" && phase ∈ {1,2,3,4} → exit 2 + 阻断文案
 *   - 其它一律 exit 0（phase === 5 / "complete" / 异常值）
 *
 * 一手源：
 *   - Osmani §Long-horizon "intercepts the model's attempt to exit and re-injects the original prompt"
 *   - Anthropic #1 Ralph Wiggum method
 *   - LangChain PreCompletionChecklistMiddleware
 *   - OpenAI #1 Ralph Wiggum loop
 *
 * 毛选依据：
 *   《中国革命战争的战略问题》"伤其十指不如断其一指"（不准半途而废）
 *   《矛盾论》主要矛盾没解决前不可退
 *
 * deps 用于可测性（production 调用传空即可）。
 */
export function runStopHook({ rootDir, stdinPayload = "" } = {}, deps = {}) {
  const {
    phaseReader = getCurrentPhase,
  } = deps;

  const progressPath = join(rootDir, ".stw", ".progress.json");
  if (!existsSync(progressPath)) {
    return { exitCode: 0, stderr: "" };
  }

  const stopHookActive = parseStopHookActive(stdinPayload);

  if (stopHookActive) {
    // T11 硬约束：stop_hook_active 分支不读 phase（防循环时最小 I/O）。
    // T11.bis R5 诉求"埋 phase"在此约束下落实为 `phase: null` 显式字段，
    // 让 replay 能区分"字段缺失"与"字段存在但设计上不读"。
    appendEvent(rootDir, "stop-hook.run", {
      exitCode: 0,
      phase: null,
      reason: "stop_hook_active",
    });
    return { exitCode: 0, stderr: "" };
  }

  const current = phaseReader(rootDir);
  const phase = current?.phase;

  const BLOCKABLE_PHASES = [1, 2, 3, 4];
  const shouldBlock =
    typeof phase === "number" && BLOCKABLE_PHASES.includes(phase);

  if (!shouldBlock) {
    const reason =
      phase === 5 || phase === "complete"
        ? "phase-complete"
        : "phase-unknown";
    appendEvent(rootDir, "stop-hook.run", {
      exitCode: 0,
      phase: typeof phase === "number" || typeof phase === "string" ? phase : null,
      reason,
    });
    return { exitCode: 0, stderr: "" };
  }

  const phaseInfo = PHASES.find((p) => p.id === phase);
  const phaseName = phaseInfo?.name || `阶段 ${phase}`;
  const nextGuidance = buildNextGuidance(phase, current?.taskDescription);
  const firstLine =
    phase === 4
      ? `[stw stop-hook] 任务尚未完成 —— 当前处于阶段 ${phase} (${phaseName})，仍需独立审查员签字，不要直接 Stop。`
      : `[stw stop-hook] 任务尚未完成 —— 当前处于阶段 ${phase} (${phaseName})，五阶段门禁未全部通过。`;
  const lines = [
    firstLine,
    `不准半途而废（《中国革命战争的战略问题》"伤其十指不如断其一指"）。`,
    ``,
    nextGuidance,
  ];
  const stderr = lines.join("\n") + `\n\n(event: Stop)`;

  appendEvent(rootDir, "stop-hook.run", {
    exitCode: 2,
    phase,
    taskDescription: truncate(current?.taskDescription || "", 200),
  });

  return { exitCode: 2, stderr };
}

function parseStopHookActive(payload) {
  if (!payload) return false;
  try {
    const parsed = JSON.parse(payload);
    return parsed?.stop_hook_active === true;
  } catch {
    return false;
  }
}

function buildNextGuidance(phase, taskDescription) {
  const task = taskDescription ? `任务："${truncate(taskDescription, 80)}"\n` : "";
  switch (phase) {
    case 1:
      return (
        task +
        `回到阶段 1：继续调研，填完 .stw/Analysis-Template.md 的 12 个章节（≥ 2 条 file:line 引用），然后运行 stw next。`
      );
    case 2:
      return (
        task +
        `回到阶段 2：让独立「规划师」Agent 填 .stw/planner-report.md（结论需"可以推进"），在 STW-Workspace.md 声明 ATTACK_ZONE，然后运行 stw next。`
      );
    case 3:
      return (
        task +
        `回到阶段 3：按变更计划修改代码，仅限 ATTACK_ZONE 内文件；全部测试通过后运行 stw next。`
      );
    case 4:
      return (
        task +
        `回到阶段 4：写 .stw/test-results.json 并让独立「审查员」Agent 填 .stw/reviewer-report.md（结论需"通过"或"有条件通过"），然后运行 stw next。`
      );
    default:
      return task + `运行 stw status 查看当前阶段，继续推进。`;
  }
}

function truncate(s, max) {
  if (!s) return "";
  return s.length <= max ? s : s.slice(0, max) + "…";
}

/**
 * Helper for the CLI wrapper — reads stdin in a way that does not hang on TTY.
 * Returns "" when no stdin is piped.
 */
export function readStdinSafe() {
  try {
    if (process.stdin.isTTY) return "";
    return readFileSync(0, "utf-8");
  } catch {
    return "";
  }
}
