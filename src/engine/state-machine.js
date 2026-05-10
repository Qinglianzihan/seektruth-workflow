import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { parseAttackZones, checkFileBounds, checkChangePlan, checkDepsChange } from "./lockdown.js";
import { assessConfidence } from "./confidence-gate.js";

export const PHASES = [
  { id: 1, name: "调查研究", nameEn: "Investigate", deliverable: ".stw/Analysis-Template.md" },
  { id: 2, name: "抓住主要矛盾", nameEn: "Focus", deliverable: "任务聚焦声明" },
  { id: 3, name: "集中优势兵力", nameEn: "Concentrate", deliverable: ".stw/lockdown.json" },
  { id: 4, name: "实践检验", nameEn: "Test", deliverable: "测试通过" },
  { id: 5, name: "总结与转化", nameEn: "Summarize", deliverable: ".stw/Summary-Template.md" },
];

const PROGRESS_FILE = ".stw/.progress.json";

function progressPath(rootDir) {
  return join(rootDir, PROGRESS_FILE);
}

function readProgress(rootDir) {
  const path = progressPath(rootDir);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function writeProgress(rootDir, data) {
  writeFileSync(progressPath(rootDir), JSON.stringify(data, null, 2));
}

export function getCurrentPhase(rootDir) {
  const progress = readProgress(rootDir);
  if (!progress) return null;
  return {
    phase: progress.phase,
    phaseInfo: PHASES.find((p) => p.id === progress.phase) || null,
    startedAt: progress.startedAt,
    completedPhases: progress.completedPhases || [],
    iterations: progress.iterations || [],
    taskDescription: progress.taskDescription || "",
  };
}

export function startSession(rootDir, taskDescription = "") {
  const now = new Date().toISOString();
  const data = {
    phase: 1,
    startedAt: now,
    completedPhases: [],
    iterations: [],
    taskDescription,
    phaseStartedAt: now,
    phaseTimings: [],
  };
  writeProgress(rootDir, data);
  return getCurrentPhase(rootDir);
}

function recordPhaseTiming(progress) {
  if (!progress.phaseTimings) progress.phaseTimings = [];
  const startedAt = progress.phaseStartedAt || progress.startedAt;
  const now = new Date().toISOString();
  progress.phaseTimings.push({
    phase: progress.phase,
    startedAt,
    completedAt: now,
    durationMs: Date.now() - new Date(startedAt).getTime(),
  });
}

function deliverableExists(rootDir, deliverable) {
  if (deliverable === "任务聚焦声明") {
    return parseAttackZones(rootDir).length > 0;
  }
  if (deliverable === "测试通过") {
    const resultsPath = join(rootDir, ".stw", "test-results.json");
    if (existsSync(resultsPath)) {
      try {
        const data = JSON.parse(readFileSync(resultsPath, "utf-8"));
        if (data.passed === true) return true;
        if (typeof data.passed === "number" && data.passed > 0) return true;
        return false;
      } catch {
        return false;
      }
    }
    const markerPath = join(rootDir, ".stw", "test-passed");
    return existsSync(markerPath);
  }
  const filePath = join(rootDir, deliverable);
  return existsSync(filePath);
}

/**
 * Extract the 结论 (conclusion) line from a planner/reviewer report.
 * Strips HTML comments first so that placeholder comments don't leak into the match.
 * Returns the verdict phrase (trimmed) or null when no non-comment conclusion exists.
 */
function readConclusion(rootDir, fileName) {
  const path = join(rootDir, ".stw", fileName);
  if (!existsSync(path)) return { exists: false, conclusion: null };
  const raw = readFileSync(path, "utf-8");
  const stripped = raw.replace(/<!--[\s\S]*?-->/g, "");
  const match = stripped.match(/\*\*结论\*\*[ \t]*[:：][ \t]*([^\n]*)/);
  if (!match) return { exists: true, conclusion: null };
  const conclusion = match[1].trim();
  return { exists: true, conclusion: conclusion.length > 0 ? conclusion : null };
}

export function checkPlannerReport(rootDir) {
  const { exists, conclusion } = readConclusion(rootDir, "planner-report.md");
  if (!exists) {
    return { ok: false, missing: true, error: "规划师报告 .stw/planner-report.md 尚未生成" };
  }
  if (!conclusion) {
    return { ok: false, error: '规划师报告的 "**结论**" 行为空或只有占位注释——请填入 "可以推进" 或 "需要调整"' };
  }
  if (conclusion.includes("可以推进")) return { ok: true, conclusion };
  if (conclusion.includes("需要调整")) {
    return { ok: false, conclusion, error: '规划师判定 "需要调整"——请先回阶段 1 修订调研后重新规划' };
  }
  return { ok: false, conclusion, error: `规划师结论 "${conclusion}" 不在允许集合（可以推进 / 需要调整）内` };
}

export function checkReviewerReport(rootDir) {
  const { exists, conclusion } = readConclusion(rootDir, "reviewer-report.md");
  if (!exists) {
    return { ok: false, missing: true, error: "审查员报告 .stw/reviewer-report.md 尚未生成" };
  }
  if (!conclusion) {
    return { ok: false, error: '审查员报告的 "**结论**" 行为空或只有占位注释——请填入 "通过" / "有条件通过" / "不通过"' };
  }
  if (conclusion.includes("不通过")) {
    return { ok: false, conclusion, error: '审查员判定 "不通过"——请修复问题后重新审查' };
  }
  if (conclusion.includes("通过")) return { ok: true, conclusion };
  return { ok: false, conclusion, error: `审查员结论 "${conclusion}" 不在允许集合（通过 / 有条件通过 / 不通过）内` };
}

function plannerReviewerEnabled(rootDir) {
  const configPath = join(rootDir, ".stw", "config.json");
  if (!existsSync(configPath)) return true;
  try {
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    return config.plannerReviewer?.enabled !== false;
  } catch {
    return true;
  }
}

export function advancePhase(rootDir) {
  const progress = readProgress(rootDir);
  if (!progress) {
    return { ok: false, error: "当前没有活跃的任务。请先运行 stw start。" };
  }

  const currentPhase = PHASES.find((p) => p.id === progress.phase);
  if (!currentPhase) {
    return { ok: false, error: "无效的阶段。" };
  }

  // Check deliverable
  if (!deliverableExists(rootDir, currentPhase.deliverable)) {
    return {
      ok: false,
      error: `阶段 ${currentPhase.id} (${currentPhase.name}) 的交付物未完成。`,
      required: currentPhase.deliverable,
    };
  }

  // Confidence gate: phase 1→2
  if (progress.phase === 1) {
    const configPath = join(rootDir, ".stw", "config.json");
    let gateEnabled = true;
    let threshold = 6;
    if (existsSync(configPath)) {
      try {
        const config = JSON.parse(readFileSync(configPath, "utf-8"));
        if (config.confidenceGate) {
          gateEnabled = config.confidenceGate.enabled !== false;
          threshold = config.confidenceGate.threshold ?? 6;
        }
      } catch { /* use defaults */ }
    }

    if (gateEnabled) {
      const { ready, score, gaps } = assessConfidence(rootDir);
      if (!ready || score < threshold) {
        const gapList = gaps.length > 0 ? `\n${gaps.map((g) => `  · ${g}`).join("\n")}` : "";
        return {
          ok: false,
          error: `战前评估不充分 (${score}/10，需要 ≥ ${threshold}) — 不打无把握之仗`,
          required: `补充以下章节:${gapList}`,
        };
      }
    }
  }

  // Planner gate: phase 2→3 — require independent 规划师 report (Anthropic: Planner ≠ Generator)
  if (progress.phase === 2 && plannerReviewerEnabled(rootDir)) {
    const planner = checkPlannerReport(rootDir);
    if (!planner.ok) {
      return {
        ok: false,
        error: planner.error,
        required: '由独立的「规划师」Agent 填写 .stw/planner-report.md，并在 "**结论**:" 行写入 "可以推进"。',
      };
    }
  }

  // File bounds + change plan + deps: phase 3→4
  if (progress.phase === 3) {
    const bounds = checkFileBounds(rootDir);
    if (!bounds.ok) {
      if (bounds.error) {
        return { ok: false, error: bounds.error };
      }
      const violationList = bounds.violations.map((f) => `  · ${f}`).join("\n");
      return {
        ok: false,
        error: `检测到 ${bounds.violations.length} 个文件越界修改（共 ${bounds.totalFiles} 个变更文件）：\n${violationList}`,
        required: `仅允许修改以下区域: ${bounds.zones.join(", ")}。将越界文件回滚后重试。`,
      };
    }

    const changePlan = checkChangePlan(rootDir);
    if (!changePlan.ok) {
      if (changePlan.error) {
        return { ok: false, error: changePlan.error };
      }
      const unplannedList = changePlan.unplanned.map((f) => `  · ${f}`).join("\n");
      return {
        ok: false,
        error: `${changePlan.unplanned.length} 个文件未在变更计划中声明：\n${unplannedList}`,
        required: "请在 Analysis-Template.md 的变更计划声明中补充改动类型和理由。",
      };
    }

    const deps = checkDepsChange(rootDir);
    if (deps.warning) {
      console.log(`\n  ⚠️  ${deps.warning}`);
    }
  }

  // Reviewer gate: phase 4→5 — require independent 审查员 report (Anthropic: Evaluator ≠ Generator)
  if (progress.phase === 4 && plannerReviewerEnabled(rootDir)) {
    const reviewer = checkReviewerReport(rootDir);
    if (!reviewer.ok) {
      return {
        ok: false,
        error: reviewer.error,
        required: '由独立的「审查员」Agent 填写 .stw/reviewer-report.md，并在 "**结论**:" 行写入 "通过" 或 "有条件通过"。',
      };
    }
  }

  // Check if this is the last phase
  if (progress.phase >= PHASES.length) {
    progress.completedPhases.push(progress.phase);
    recordPhaseTiming(progress);
    writeProgress(rootDir, { ...progress, phase: "complete" });
    return { ok: true, done: true, phase: "complete" };
  }

  // Advance
  progress.completedPhases.push(progress.phase);
  recordPhaseTiming(progress);
  progress.phase += 1;
  progress.phaseStartedAt = new Date().toISOString();
  writeProgress(rootDir, progress);

  const nextPhase = PHASES.find((p) => p.id === progress.phase);
  return { ok: true, done: false, phase: nextPhase };
}

export function rollbackSession(rootDir, reason) {
  const progress = readProgress(rootDir);
  if (!progress) {
    return { ok: false, error: "当前没有活跃的任务。" };
  }
  if (progress.phase <= 1) {
    return { ok: false, error: "已在阶段 1，无法继续回退。运行 stw abort 中止任务。" };
  }

  if (!progress.iterations) progress.iterations = [];
  progress.iterations.push({
    phase: progress.phase,
    reason: reason || "未说明原因",
    timestamp: new Date().toISOString(),
  });

  progress.phase = 1;
  writeProgress(rootDir, progress);

  return {
    ok: true,
    phase: 1,
    iterations: progress.iterations.length,
    history: progress.iterations,
  };
}

export function getSessionConfig(rootDir) {
  const configPath = join(rootDir, ".stw", "config.json");
  if (!existsSync(configPath)) return { maxIterations: 0 };
  try {
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    return {
      maxIterations: config.session?.maxIterations ?? 0,
    };
  } catch {
    return { maxIterations: 0 };
  }
}

export function readTestResults(rootDir) {
  const resultsPath = join(rootDir, ".stw", "test-results.json");
  if (!existsSync(resultsPath)) return null;
  try {
    return JSON.parse(readFileSync(resultsPath, "utf-8"));
  } catch {
    return null;
  }
}

export function abortSession(rootDir) {
  const progress = readProgress(rootDir);
  if (!progress) {
    return { ok: false, error: "没有活跃的任务可中止。" };
  }
  const path = progressPath(rootDir);
  try {
    rmSync(path);
  } catch {
    return { ok: false, error: "无法删除进度文件。" };
  }
  return { ok: true };
}
