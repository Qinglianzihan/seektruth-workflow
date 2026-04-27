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
  const data = {
    phase: 1,
    startedAt: new Date().toISOString(),
    completedPhases: [],
    iterations: [],
    taskDescription,
  };
  writeProgress(rootDir, data);
  return getCurrentPhase(rootDir);
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
        return data.passed === true;
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

  // Check if this is the last phase
  if (progress.phase >= PHASES.length) {
    progress.completedPhases.push(progress.phase);
    writeProgress(rootDir, { ...progress, phase: "complete" });
    return { ok: true, done: true, phase: "complete" };
  }

  // Advance
  progress.completedPhases.push(progress.phase);
  progress.phase += 1;
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
