import { existsSync, readFileSync, writeFileSync, mkdirSync, createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { homedir } from "node:os";
import { join } from "node:path";
import { getErrorInsights } from "./error-registry.js";

const HISTORY_PATH = join(homedir(), ".claude", "history.jsonl");
const STATS_FILE = ".stw/stats.json";
const GATE_HISTORY_FILE = ".stw/gate-history.json";
const MAX_HISTORY_LINES = 50_000;
const MAX_GATE_ENTRIES = 200;

function readStats(rootDir) {
  const path = join(rootDir, STATS_FILE);
  if (!existsSync(path)) {
    return { sessions: 0, totalTokens: 0, tokenLogs: [], projects: {} };
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return { sessions: 0, totalTokens: 0, tokenLogs: [], projects: {} };
  }
}

function writeStats(rootDir, stats) {
  const path = join(rootDir, STATS_FILE);
  mkdirSync(join(rootDir, ".stw"), { recursive: true });
  writeFileSync(path, JSON.stringify(stats, null, 2));
}

/**
 * Count sessions from Claude Code history log (streaming, memory-safe).
 */
export async function countSessionsFromHistory() {
  if (!existsSync(HISTORY_PATH)) {
    return { total: 0, byProject: {} };
  }

  const sessions = new Map();
  let lineCount = 0;

  const rl = createInterface({
    input: createReadStream(HISTORY_PATH, { encoding: "utf-8", highWaterMark: 64 * 1024 }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (++lineCount > MAX_HISTORY_LINES) break;
    if (!line) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.sessionId && entry.project) {
        const existing = sessions.get(entry.sessionId);
        if (!existing) {
          sessions.set(entry.sessionId, { project: entry.project, messages: 1 });
        } else {
          existing.messages++;
        }
      }
    } catch {
      // skip malformed lines
    }
  }

  const byProject = {};
  let total = 0;
  for (const [, session] of sessions) {
    const proj = session.project;
    if (!byProject[proj]) byProject[proj] = { sessions: 0, messages: 0 };
    byProject[proj].sessions++;
    byProject[proj].messages += session.messages;
    total++;
  }

  return { total, byProject, truncated: lineCount > MAX_HISTORY_LINES };
}

/**
 * Log a manual token entry.
 */
export function logTokens(rootDir, tokens, note) {
  const stats = readStats(rootDir);
  stats.totalTokens += tokens;
  stats.tokenLogs.push({
    amount: tokens,
    note: note || "",
    timestamp: new Date().toISOString(),
  });
  writeStats(rootDir, stats);
  return stats;
}

export async function getStats(rootDir) {
  const manual = readStats(rootDir);
  const history = await countSessionsFromHistory();
  return { manual, history };
}

/**
 * Read phase timing data from progress.json.
 */
export function getPhaseTiming(rootDir) {
  const progressPath = join(rootDir, ".stw", ".progress.json");
  if (!existsSync(progressPath)) return null;

  try {
    const progress = JSON.parse(readFileSync(progressPath, "utf-8"));
    if (!progress.phaseTimings || progress.phaseTimings.length === 0) return null;

    const totalMs = progress.phaseTimings.reduce((sum, t) => sum + (t.durationMs || 0), 0);
    const phases = progress.phaseTimings.map((t) => ({
      phase: t.phase,
      name: ["", "调查研究", "抓住主要矛盾", "集中优势兵力", "实践检验", "总结与转化"][t.phase] || `阶段${t.phase}`,
      durationMs: t.durationMs || 0,
      startedAt: t.startedAt,
    }));

    return { phases, totalMs, count: phases.length };
  } catch {
    return null;
  }
}

/**
 * Log a gate check result to .stw/gate-history.json.
 */
export function logGateResult(rootDir, results, allPassed) {
  const gatePath = join(rootDir, GATE_HISTORY_FILE);
  let history = [];
  if (existsSync(gatePath)) {
    try {
      history = JSON.parse(readFileSync(gatePath, "utf-8"));
    } catch {
      history = [];
    }
  }

  const entry = {
    timestamp: new Date().toISOString(),
    results: {},
    allPassed,
  };
  for (const [gate, r] of Object.entries(results)) {
    entry.results[gate] = r.passed;
  }

  history.push(entry);
  if (history.length > MAX_GATE_ENTRIES) {
    history = history.slice(-MAX_GATE_ENTRIES);
  }

  mkdirSync(join(rootDir, ".stw"), { recursive: true });
  writeFileSync(gatePath, JSON.stringify(history, null, 2));
}

/**
 * Read gate history and compute trends.
 */
export function getGateTrends(rootDir) {
  const gatePath = join(rootDir, GATE_HISTORY_FILE);
  if (!existsSync(gatePath)) return null;

  try {
    const history = JSON.parse(readFileSync(gatePath, "utf-8"));
    if (history.length === 0) return null;

    const total = history.length;
    const passed = history.filter((e) => e.allPassed).length;
    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;

    // Per-gate stats
    const gateStats = {};
    for (const entry of history) {
      for (const [gate, gatePassed] of Object.entries(entry.results)) {
        if (!gateStats[gate]) gateStats[gate] = { total: 0, passed: 0 };
        gateStats[gate].total++;
        if (gatePassed) gateStats[gate].passed++;
      }
    }

    // Recent trend (last 10)
    const recent = history.slice(-10);
    const recentPassed = recent.filter((e) => e.allPassed).length;

    // Last run
    const last = history[history.length - 1];

    return {
      total,
      passed,
      passRate,
      recentPassed,
      recentTotal: recent.length,
      gateStats,
      last,
    };
  } catch {
    return null;
  }
}

export async function generateStatsReport(rootDir) {
  const stats = await getStats(rootDir);
  const lines = [];

  lines.push(`\n📊 求是工作流 — 统计报告\n`);

  // Phase timing
  const timing = getPhaseTiming(rootDir);
  if (timing) {
    lines.push(`  阶段耗时:`);
    for (const p of timing.phases) {
      const mins = Math.round(p.durationMs / 60000);
      const display = mins > 0 ? `${mins}分钟` : `${Math.round(p.durationMs / 1000)}秒`;
      lines.push(`    · 阶段${p.phase} ${p.name}: ${display}`);
    }
    const totalMins = Math.round(timing.totalMs / 60000);
    lines.push(`    总计: ${totalMins}分钟`);
    lines.push("");
  }

  // Gate trends
  const trends = getGateTrends(rootDir);
  if (trends) {
    lines.push(`  门禁趋势 (最近 ${trends.total} 次):`);
    lines.push(`    全门禁通过率: ${trends.passRate}% (${trends.passed}/${trends.total})`);
    lines.push(`    最近 ${trends.recentTotal} 次: ${trends.recentPassed}/${trends.recentTotal} 全部通过`);
    if (trends.gateStats && Object.keys(trends.gateStats).length > 0) {
      lines.push(`    各门禁单独通过率:`);
      const gateOrder = ["lint", "import-linter", "ratchet", "test"];
      for (const gate of gateOrder) {
        const gs = trends.gateStats[gate];
        if (gs) {
          const rate = Math.round((gs.passed / gs.total) * 100);
          lines.push(`      · ${gate}: ${rate}% (${gs.passed}/${gs.total})`);
        }
      }
      // Any gates not in the predefined order
      for (const [gate, gs] of Object.entries(trends.gateStats)) {
        if (!gateOrder.includes(gate)) {
          const rate = Math.round((gs.passed / gs.total) * 100);
          lines.push(`      · ${gate}: ${rate}% (${gs.passed}/${gs.total})`);
        }
      }
    }
    if (trends.last) {
      const lastDate = new Date(trends.last.timestamp).toLocaleString();
      const status = trends.last.allPassed ? "✅" : "❌";
      lines.push(`    最近一次 (${lastDate}): ${status}`);
    }
    lines.push("");
  }

  // History stats
  const h = stats.history;
  lines.push(`  Claude Code 会话历史:`);
  lines.push(`    总会话数: ${h.total}${h.truncated ? " (截断至前50k行)" : ""}`);
  const projNames = Object.entries(h.byProject)
    .sort((a, b) => b[1].sessions - a[1].sessions);
  for (const [proj, data] of projNames) {
    const short = proj.length > 50 ? "..." + proj.slice(-47) : proj;
    lines.push(`    · ${short}: ${data.sessions} 会话, ${data.messages} 消息`);
  }
  lines.push("");

  // Manual token tracking
  const m = stats.manual;
  lines.push(`  Token 追踪 (手动记录):`);
  lines.push(`    总消耗: ${m.totalTokens}`);
  if (m.tokenLogs.length > 0) {
    const lastLogs = m.tokenLogs.slice(-5).reverse();
    for (const log of lastLogs) {
      const date = new Date(log.timestamp).toLocaleDateString();
      lines.push(`    · ${date}: ${log.amount} tokens${log.note ? ` (${log.note})` : ""}`);
    }
  } else {
    lines.push("    暂无记录。使用 stw stats --log-tokens <数量> [备注] 添加。");
  }

  // Error insights
  const insights = getErrorInsights(rootDir);
  if (insights.total > 0) {
    lines.push("  错误病例统计:");
    lines.push(`    总计: ${insights.total} 条`);
    const phases = Object.entries(insights.byPhase)
      .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
      .map(([p, c]) => `阶段${p}(${c})`)
      .join(", ");
    if (phases) lines.push(`    按阶段: ${phases}`);
    if (insights.topTags.length > 0) {
      lines.push(`    常见类型: ${insights.topTags.join(", ")}`);
    }
    lines.push("");
  }

  lines.push("");
  return lines.join("\n");
}
