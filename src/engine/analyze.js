import { readFileSync } from "node:fs";
import { readEvents } from "./events.js";
import { getAllErrors } from "./error-registry.js";
import { listReports } from "./report.js";
import { parseEvidenceLedger } from "./evidence.js";
import { splitIntoSessions, truncateTask } from "./audit.js";

/**
 * T15 Trace analyzer —— 把 events + error-registry + predictionVerdict 三类
 * traceable 数据聚合成「失败模式归类 + 热点 Top-N + 趋势」五类 findings。
 *
 * 哲学依据：
 * - LangChain Trace Analyzer Skill（🟢 具体方案）fetch → analyze → synthesize 三步
 * - Osmani §Viv "agents that analyze their own traces to identify and fix harness-level failure modes"
 * - AHE §3.2 Agent Debugger 按 task 分析 failure 根因
 * - OpenAI doom loops "10+ times in some traces"
 * - 《党委会》第 7 条「胸中有数」
 *
 * 诊断工具（diagnose），不是门禁（gate）。不改 events schema，不写状态文件，不接 phase gate。
 */

const DEFAULT_LIMIT = 10;
const TOP_N = 5;
const TREND_HALF_WINDOW = 5;

function topN(counter, k = TOP_N) {
  return Object.entries(counter)
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([key, count]) => ({ key, count }));
}

function analyzeGateDenied(window) {
  const byGate = {};
  let totalDenied = 0;
  const perSession = [];
  for (const s of window) {
    let sessionDenied = 0;
    for (const e of s.events) {
      if (e.type === "phase.advance.denied") {
        const g = e.data?.gate || "(unknown)";
        byGate[g] = (byGate[g] || 0) + 1;
        totalDenied += 1;
        sessionDenied += 1;
      }
    }
    if (sessionDenied > 0) perSession.push({ key: truncateTask(s.task) || "(无描述)", count: sessionDenied });
  }
  const top = topN(byGate);
  const detail = totalDenied === 0
    ? "窗口内无 phase.advance.denied 事件"
    : `${totalDenied} 次 phase.advance.denied 跨 ${Object.keys(byGate).length} 种 sub-gate`;
  return {
    id: "gate-denied-hotspots",
    label: "Phase gate denied 热点",
    detail,
    topItems: top,
    perSession: perSession.sort((a, b) => b.count - a.count).slice(0, TOP_N),
    rationale: "LangChain Trace Analyzer + Osmani §Viv 'identify failure modes'",
    empty: totalDenied === 0,
  };
}

function analyzeCheckFailures(window) {
  const byGate = {};
  let totalFailures = 0;
  const perSession = [];
  for (const s of window) {
    let sessionFailures = 0;
    for (const e of s.events) {
      if (e.type !== "check.summary") continue;
      if (e.data?.ok !== false) continue;
      const failedGates = Array.isArray(e.data.failed) ? e.data.failed : [];
      for (const g of failedGates) {
        const key = g || "(unknown)";
        byGate[key] = (byGate[key] || 0) + 1;
        totalFailures += 1;
        sessionFailures += 1;
      }
    }
    if (sessionFailures > 0) perSession.push({ key: truncateTask(s.task) || "(无描述)", count: sessionFailures });
  }
  const top = topN(byGate);
  const detail = totalFailures === 0
    ? "窗口内所有 check.summary 均 ok:true（或无事件）"
    : `${totalFailures} 次 check 失败跨 ${Object.keys(byGate).length} 种 gate`;
  return {
    id: "check-failures",
    label: "check 失败热点（lint / test / ratchet / import-linter / doc-drift）",
    detail,
    topItems: top,
    perSession: perSession.sort((a, b) => b.count - a.count).slice(0, TOP_N),
    rationale: "OpenAI doom loops + AHE §3.2 per-task failure root cause",
    empty: totalFailures === 0,
  };
}

function analyzeErrorRegistry(rootDir, window) {
  let entries;
  try {
    entries = getAllErrors(rootDir);
  } catch {
    entries = [];
  }
  if (entries.length === 0) {
    return {
      id: "error-registry-hotspots",
      label: "error-registry 病例热点",
      detail: "registry 为空（treating 0 cases as no hotspots）",
      topItems: [],
      recent: [],
      rationale: "《整顿党的作风》惩前毖后、治病救人",
      empty: true,
    };
  }
  const byTag = {};
  const byPhase = {};
  for (const e of entries) {
    const tags = Array.isArray(e.tags) ? e.tags : [];
    for (const t of tags) byTag[t] = (byTag[t] || 0) + 1;
    const p = String(e.phase || 0);
    byPhase[p] = (byPhase[p] || 0) + 1;
  }
  const top = topN(byTag);
  const windowFirstTs = window.length > 0 ? window[0].startedAt : null;
  const inWindowCount = windowFirstTs
    ? entries.filter(
        (e) => typeof e.timestamp === "string" && e.timestamp >= windowFirstTs,
      ).length
    : 0;
  const recent = entries
    .filter((e) => typeof e.timestamp === "string")
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 3)
    .map((e) => ({
      desc: (e.description || "").slice(0, 120),
      phase: e.phase || 0,
      tags: Array.isArray(e.tags) ? e.tags.slice(0, 3) : [],
    }));
  const detail = `总病例 ${entries.length} 条；窗口内新增 ${inWindowCount} 条；跨 ${Object.keys(byTag).length} 种 tag、${Object.keys(byPhase).length} 个 phase`;
  return {
    id: "error-registry-hotspots",
    label: "error-registry 病例热点",
    detail,
    topItems: top,
    recent,
    byPhase,
    rationale: "《整顿党的作风》惩前毖后、治病救人",
    empty: entries.length === 0,
  };
}

function readSummarySafe(path) {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

function analyzeEvidenceTrend(rootDir, opts = {}) {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  let reports;
  try {
    reports = listReports(rootDir);
  } catch {
    reports = [];
  }
  const recent = reports.slice(0, limit);
  const scanned = [];
  let cumulativeTotal = 0;
  let cumulativeConfirmed = 0;
  let cumulativeMismatches = 0;
  let cumulativeSkipped = 0;
  let reportsWithLedger = 0;
  for (const r of recent) {
    const content = readSummarySafe(r.path);
    if (content === null) {
      scanned.push({ name: r.name, total: 0, confirmed: 0, mismatches: 0, skipped: 0, hasLedger: false });
      continue;
    }
    const ledger = parseEvidenceLedger(content);
    if (ledger.length === 0) {
      scanned.push({ name: r.name, total: 0, confirmed: 0, mismatches: 0, skipped: 0, hasLedger: false });
      continue;
    }
    reportsWithLedger += 1;
    let conf = 0, mis = 0, skp = 0;
    for (const row of ledger) {
      const v = (row.verdict || "").toLowerCase();
      if (v === "兑现" || v === "confirmed") conf += 1;
      else if (v === "不兑现" || v === "未兑现" || v === "mismatch") mis += 1;
      else skp += 1;
    }
    cumulativeTotal += ledger.length;
    cumulativeConfirmed += conf;
    cumulativeMismatches += mis;
    cumulativeSkipped += skp;
    scanned.push({ name: r.name, total: ledger.length, confirmed: conf, mismatches: mis, skipped: skp, hasLedger: true });
  }

  const withLedger = scanned.filter((s) => s.hasLedger);
  let trend = null;
  if (withLedger.length >= 2) {
    const half = Math.min(TREND_HALF_WINDOW, Math.floor(withLedger.length / 2));
    if (half >= 1) {
      const recentHalf = withLedger.slice(0, half);
      const olderHalf = withLedger.slice(-half);
      const mismatchRate = (arr) => {
        const t = arr.reduce((sum, s) => sum + s.total, 0);
        const m = arr.reduce((sum, s) => sum + s.mismatches, 0);
        return t > 0 ? m / t : null;
      };
      trend = {
        recentMismatchRate: mismatchRate(recentHalf),
        olderMismatchRate: mismatchRate(olderHalf),
        halfWindow: half,
      };
    }
  }

  const detail = reports.length === 0
    ? "归档为空（.stw/reports/ 无 summary-*.md）"
    : `扫最近 ${recent.length} 份归档；${reportsWithLedger} 份含 §7 证据账本；累计 ${cumulativeTotal} 条 predicted / ${cumulativeConfirmed} 兑现 / ${cumulativeMismatches} 不兑现 / ${cumulativeSkipped} 跳过`;

  return {
    id: "evidence-verdict-trend",
    label: "predictionVerdict 证据链趋势（T12 falsifiable contract 产物）",
    detail,
    cumulative: {
      total: cumulativeTotal,
      confirmed: cumulativeConfirmed,
      mismatches: cumulativeMismatches,
      skipped: cumulativeSkipped,
    },
    reportsScanned: recent.length,
    reportsWithLedger,
    trend,
    perReport: scanned,
    rationale: "AHE §2 'Every change must be traceable to specific failure evidence'",
    empty: reportsWithLedger === 0,
  };
}

function analyzeSessionLoad(window) {
  if (window.length === 0) {
    return {
      id: "session-load",
      label: "session 负载（每任务事件总数）",
      detail: "窗口为空",
      topItems: [],
      rationale: "OpenAI doom loops detection heuristic",
      empty: true,
    };
  }
  const LOAD_TYPES = ["gate.run", "check.summary", "hook.run"];
  const perSession = window.map((s) => {
    const counts = Object.fromEntries(LOAD_TYPES.map((t) => [t, 0]));
    for (const e of s.events) {
      if (e.type in counts) counts[e.type] += 1;
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return { task: truncateTask(s.task), total, counts };
  });
  const top = perSession
    .slice()
    .sort((a, b) => b.total - a.total)
    .slice(0, TOP_N)
    .map((s) => ({ key: s.task, count: s.total, breakdown: s.counts }));
  const sum = perSession.reduce((a, b) => a + b.total, 0);
  const avg = window.length > 0 ? Math.round(sum / window.length) : 0;
  return {
    id: "session-load",
    label: "session 负载（每任务事件总数 gate.run + check.summary + hook.run）",
    detail: `${window.length} 任务合计 ${sum} 条事件；均值 ${avg}/任务；最高 ${top[0]?.count ?? 0}`,
    topItems: top,
    rationale: "OpenAI doom loops detection heuristic",
    empty: sum === 0,
  };
}

/**
 * Core entry. Returns { ok, skipped?, window?, findings?, error? }.
 * - Non-positive limit → { ok: false, error }.
 * - No sessions in events → { ok: true, skipped }.
 * - Otherwise: 5 findings aggregated, each may independently set empty:true.
 */
export async function analyzeTraces(rootDir, opts = {}) {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  if (!Number.isFinite(limit) || limit <= 0) {
    return { ok: false, error: `--limit 必须为 >= 1 的整数（收到 ${opts.limit}）` };
  }

  let events;
  try {
    events = opts.eventsOverride || (await readEvents(rootDir));
  } catch {
    events = [];
  }
  const sessions = splitIntoSessions(events);
  if (sessions.length === 0) {
    return {
      ok: true,
      skipped: "尚无任务历史（需至少 1 次 session.start —— 先跑 stw start / next / report）",
    };
  }
  const window = sessions.slice(-limit);

  const findings = [
    analyzeGateDenied(window),
    analyzeCheckFailures(window),
    analyzeErrorRegistry(rootDir, window),
    analyzeEvidenceTrend(rootDir, { limit }),
    analyzeSessionLoad(window),
  ];

  return {
    ok: true,
    window: {
      limit,
      actualTasks: window.length,
      taskDescriptions: window.map((s) => truncateTask(s.task)),
      note: "仅读主 .stw/events.jsonl · rotated (events.jsonl.1) 历史不计",
    },
    findings,
  };
}

function formatTopItems(items, indent = "      ") {
  if (!items || items.length === 0) return `${indent}(无)`;
  return items
    .map((item, i) => {
      const prefix = `${indent}[${i + 1}] `;
      if (item.breakdown) {
        const bits = Object.entries(item.breakdown)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ");
        return `${prefix}${item.key} — ${item.count}${bits ? ` (${bits})` : ""}`;
      }
      return `${prefix}${item.key} — ${item.count}`;
    })
    .join("\n");
}

function formatTrendDelta(trend) {
  if (!trend) return "  (样本不足 —— 需至少 2 份含 §7 的归档)";
  const fmt = (r) => (r === null || r === undefined) ? "n/a" : `${(r * 100).toFixed(1)}%`;
  const arrow = trend.recentMismatchRate !== null && trend.olderMismatchRate !== null
    ? (trend.recentMismatchRate < trend.olderMismatchRate ? "↓" : trend.recentMismatchRate > trend.olderMismatchRate ? "↑" : "→")
    : "—";
  return `  mismatch 率（最近 ${trend.halfWindow} 份 vs 更早 ${trend.halfWindow} 份）：${fmt(trend.olderMismatchRate)} → ${fmt(trend.recentMismatchRate)} ${arrow}`;
}

export function formatAnalyzeOutput(result) {
  if (!result.ok) return `❌ ${result.error || "analyze 失败"}`;
  if (result.skipped) return `⊘ ${result.skipped}`;

  const lines = [];
  const w = result.window;
  lines.push(`📊 STW Trace Analyzer —— 最近 ${w.actualTasks} 次任务（窗口上限 ${w.limit}）`);
  lines.push("");
  lines.push("窗口覆盖的任务：");
  for (const t of w.taskDescriptions) {
    lines.push(`  · ${t || "(无描述)"}`);
  }
  lines.push("");
  lines.push("失败模式归类：");
  let idx = 1;
  for (const f of result.findings) {
    lines.push("");
    lines.push(`  [${idx}] ${f.label} (${f.id})`);
    lines.push(`      ${f.detail}`);
    if (f.empty) {
      lines.push(`      状态：✓ 无热点`);
    } else if (f.topItems && f.topItems.length > 0) {
      lines.push(`      Top-${f.topItems.length}：`);
      lines.push(formatTopItems(f.topItems));
    }
    if (f.perSession && f.perSession.length > 0) {
      lines.push(`      按 session 聚集：`);
      lines.push(formatTopItems(f.perSession));
    }
    if (f.recent && f.recent.length > 0) {
      lines.push(`      最近 3 条病例：`);
      for (const r of f.recent) {
        lines.push(`        · [phase ${r.phase}] ${r.desc}${r.tags.length ? ` — ${r.tags.join("/")}` : ""}`);
      }
    }
    if (f.id === "evidence-verdict-trend") {
      lines.push(formatTrendDelta(f.trend));
    }
    lines.push(`      参考：${f.rationale}`);
    idx += 1;
  }
  lines.push("");
  lines.push(`窗口说明：${w.note}`);
  lines.push("这份数据供再认识之用，不触发 gate、不自动修改。");
  lines.push("哲学依据：LangChain Trace Analyzer + Osmani §Viv + AHE §3.2 +《党委会》胸中有数");
  return lines.join("\n");
}
