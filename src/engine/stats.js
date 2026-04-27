import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HISTORY_PATH = join(homedir(), ".claude", "history.jsonl");
const STATS_FILE = ".stw/stats.json";

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
 * Count sessions from Claude Code history log.
 */
export function countSessionsFromHistory() {
  if (!existsSync(HISTORY_PATH)) {
    return { total: 0, byProject: {} };
  }

  const content = readFileSync(HISTORY_PATH, "utf-8");
  const lines = content.trim().split("\n").filter(Boolean);
  const sessions = new Map();

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.sessionId && entry.project) {
        const existing = sessions.get(entry.sessionId);
        if (!existing) {
          sessions.set(entry.sessionId, {
            project: entry.project,
            messages: 1,
          });
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

  return { total, byProject };
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

export function getStats(rootDir) {
  const manual = readStats(rootDir);
  const history = countSessionsFromHistory();
  return { manual, history };
}

export function generateStatsReport(rootDir) {
  const stats = getStats(rootDir);
  const lines = [];

  lines.push(`\n📊 求是工作流 — 统计报告\n`);

  // History stats
  const h = stats.history;
  lines.push(`  Claude Code 会话历史:`);
  lines.push(`    总会话数: ${h.total}`);
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

  lines.push("");
  return lines.join("\n");
}
