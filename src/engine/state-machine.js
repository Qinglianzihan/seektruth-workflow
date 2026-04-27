import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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
  };
}

export function startSession(rootDir) {
  const data = {
    phase: 1,
    startedAt: new Date().toISOString(),
    completedPhases: [],
  };
  writeProgress(rootDir, data);
  return getCurrentPhase(rootDir);
}

function deliverableExists(rootDir, deliverable) {
  if (deliverable === "任务聚焦声明") {
    // Check for actual ATTACK_ZONE declarations (not template example)
    const wsPath = join(rootDir, ".stw", "STW-Workspace.md");
    if (!existsSync(wsPath)) return false;
    const content = readFileSync(wsPath, "utf-8");
    // Match <!-- ATTACK_ZONE: <path> --> not inside a code block
    const lines = content.split("\n");
    let inCodeBlock = false;
    for (const line of lines) {
      if (line.trimStart().startsWith("```")) { inCodeBlock = !inCodeBlock; continue; }
      if (inCodeBlock) continue;
      if (/<!--\s*ATTACK_ZONE\s*:/.test(line)) return true;
    }
    return false;
  }
  if (deliverable === "测试通过") {
    // Check for test-results.json (AI-generated test evidence)
    const resultsPath = join(rootDir, ".stw", "test-results.json");
    if (existsSync(resultsPath)) {
      try {
        const data = JSON.parse(readFileSync(resultsPath, "utf-8"));
        return data.passed === true;
      } catch {
        return false;
      }
    }
    // Check for legacy marker file
    const markerPath = join(rootDir, ".stw", "test-passed");
    return existsSync(markerPath);
  }
  // File-based deliverable
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

  // Check if this is the last phase
  if (progress.phase >= PHASES.length) {
    // Mark session as complete
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
