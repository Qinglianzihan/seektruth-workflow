import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readEvents } from "./events.js";
import { getAllErrors } from "./error-registry.js";

const DEFAULT_LIMIT = 10;
const MIN_TASKS_FOR_DEAD_WEIGHT = 3;
const CLAUDE_MD_SOFT_LIMIT = 100;

/**
 * T14 周期 audit —— 扫五大核心约束在最近 N 任务里的触发情况。
 *
 * 哲学依据：
 * - Osmani ② §"harnesses don't shrink, they move"（🟢 5 家共识）
 * - Anthropic ③ line 302 "stripping away pieces no longer load-bearing"
 * - 《矛盾论》矛盾转化 + 《实践论》再实践—再认识
 *
 * 非阻断 review 工具。退出码永远 0。不做自动修改。
 */

const EVENT_CONSTRAINTS = [
  {
    id: "confidence",
    label: "置信度门禁",
    classify: (evs) =>
      evs.some((e) => e.type === "gate.confidence" && e.data?.ready === false),
    rationale: "Anthropic ③ 'stripping away pieces no longer load-bearing'",
  },
  {
    id: "attack-zone",
    label: "ATTACK_ZONE 越界封锁",
    classify: (evs) =>
      evs.some(
        (e) =>
          (e.type === "gate.bounds" && e.data?.ok === false) ||
          (e.type === "phase.advance.denied" && e.data?.gate === "bounds"),
      ),
    rationale: "Osmani ② 'harnesses don't shrink, they move'",
  },
  {
    id: "phase-gates",
    label: "五阶段门禁（整体）",
    classify: (evs) => evs.some((e) => e.type === "phase.advance.denied"),
    rationale: "LangChain ⑤ 'guardrails likely unnecessary as models improve'",
  },
];

const PHASE_GATE_SUBTYPES = [
  "deliverable", "confidence", "planner", "bounds", "changePlan", "reviewer",
];

export function truncateTask(t) {
  return (t || "").slice(0, 60);
}

export function splitIntoSessions(events) {
  const sessions = [];
  let current = null;
  for (const ev of events) {
    if (ev.type === "session.start") {
      if (current) sessions.push(current);
      current = {
        task: ev.data?.taskDescription || ev.task || "",
        startedAt: ev.ts,
        events: [],
      };
    } else if (current) {
      current.events.push(ev);
    }
  }
  if (current) sessions.push(current);
  return sessions;
}

function buildEventDetail(id, window, triggered, notTriggered) {
  const ratio = `${triggered}/${window.length}`;
  if (id === "phase-gates") {
    // P3: sub-gate 分拆
    const counts = Object.fromEntries(PHASE_GATE_SUBTYPES.map((g) => [g, 0]));
    for (const s of window) {
      for (const e of s.events) {
        if (e.type === "phase.advance.denied") {
          const g = e.data?.gate;
          if (g && g in counts) counts[g] += 1;
        }
      }
    }
    const parts = Object.entries(counts)
      .filter(([, n]) => n > 0)
      .map(([g, n]) => `${g}=${n}`);
    const subBreakdown = parts.length > 0 ? `（sub-gate denied: ${parts.join(", ")}）` : "（无 denied 事件）";
    return `触发 ${ratio} 任务 ${subBreakdown}`;
  }
  return `触发 ${ratio} 任务；未触发 ${notTriggered}/${window.length}`;
}

function auditErrorRegistry(rootDir, window, opts = {}) {
  const minTasks = opts.minTasks ?? MIN_TASKS_FOR_DEAD_WEIGHT;
  const entries = getAllErrors(rootDir);
  if (window.length === 0) {
    return {
      id: "error-registry",
      label: "error-registry 病例库",
      triggered: 0,
      notTriggered: 0,
      detail: "窗口为空",
      suspectedDeadWeight: false,
      rationale: "毛选《整顿党风》'惩前毖后，治病救人'",
    };
  }
  const firstStartTs = window[0].startedAt;
  const triggered = entries.filter(
    (e) => typeof e.timestamp === "string" && e.timestamp >= firstStartTs,
  ).length;
  const suspectedDeadWeight =
    triggered === 0 &&
    entries.length > 0 &&
    window.length >= minTasks;
  return {
    id: "error-registry",
    label: "error-registry 病例库",
    triggered,
    notTriggered: Math.max(0, window.length - triggered),
    detail: `窗口内新增 ${triggered} 条病例；registry 总条数 ${entries.length} (approximate · 按 logError 时刻计)`,
    suspectedDeadWeight,
    rationale: "毛选《整顿党风》'惩前毖后，治病救人'",
  };
}

function auditClaudeMd(rootDir, opts = {}) {
  const path = opts.claudeMdPath || join(rootDir, "CLAUDE.md");
  if (!existsSync(path)) {
    return {
      id: "claude-md",
      label: "CLAUDE.md 行数",
      triggered: 0,
      notTriggered: 0,
      detail: "CLAUDE.md 不存在",
      suspectedDeadWeight: false,
      rationale: "OpenAI ① 'AGENTS.md should be short and precise'",
    };
  }
  const content = readFileSync(path, "utf-8");
  const lineCount = content.split("\n").length - (content.endsWith("\n") ? 1 : 0);
  const over = lineCount > CLAUDE_MD_SOFT_LIMIT;
  return {
    id: "claude-md",
    label: "CLAUDE.md 行数",
    triggered: over ? 1 : 0,
    notTriggered: over ? 0 : 1,
    detail: `${lineCount} 行（上限 ~${CLAUDE_MD_SOFT_LIMIT}）· 静态指标 · 每次 audit 必现`,
    suspectedDeadWeight: over,
    rationale: "OpenAI ① 'AGENTS.md should be short and precise'",
  };
}

/**
 * Core entry. Returns { ok, skipped?, window, constraints, suspectedDeadWeight }.
 * Never throws on normal data; opts.limit === 0 / negative → { ok: false, error }.
 */
export async function auditConstraints(rootDir, opts = {}) {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  if (!Number.isFinite(limit) || limit <= 0) {
    return { ok: false, error: `--limit 必须为 >= 1 的整数（收到 ${opts.limit}）` };
  }
  const minTasks = opts.minTasks ?? MIN_TASKS_FOR_DEAD_WEIGHT;
  if (!Number.isFinite(minTasks) || minTasks <= 0) {
    return { ok: false, error: `--min-tasks 必须为 >= 1 的整数（收到 ${opts.minTasks}）` };
  }

  const events = opts.eventsOverride || (await readEvents(rootDir));
  const sessions = splitIntoSessions(events);
  if (sessions.length === 0) {
    return {
      ok: true,
      skipped: "尚无任务历史（需至少完成 1 个任务 —— 先跑 stw start / next / report）",
    };
  }
  const window = sessions.slice(-limit);

  const constraints = [];
  for (const c of EVENT_CONSTRAINTS) {
    const triggered = window.filter((s) => c.classify(s.events)).length;
    const notTriggered = window.length - triggered;
    const suspectedDeadWeight =
      triggered === 0 && window.length >= minTasks;
    constraints.push({
      id: c.id, label: c.label,
      triggered, notTriggered,
      detail: buildEventDetail(c.id, window, triggered, notTriggered),
      suspectedDeadWeight,
      rationale: c.rationale,
    });
  }

  constraints.push(auditErrorRegistry(rootDir, window, { minTasks }));
  constraints.push(auditClaudeMd(rootDir, opts));

  const suspectedDeadWeight = constraints
    .filter((c) => c.suspectedDeadWeight)
    .map((c) => c.id);

  return {
    ok: true,
    window: {
      limit,
      actualTasks: window.length,
      taskDescriptions: window.map((s) => truncateTask(s.task)),
      note: "仅读主 .stw/events.jsonl · rotated (events.jsonl.1) 历史不计",
    },
    constraints,
    suspectedDeadWeight,
  };
}

export function formatAuditOutput(result) {
  if (!result.ok) return `❌ ${result.error || "audit 失败"}`;
  if (result.skipped) return `⊘ ${result.skipped}`;

  const lines = [];
  const w = result.window;
  lines.push(`📋 STW 约束 Audit —— 最近 ${w.actualTasks} 次任务（窗口上限 ${w.limit}）`);
  lines.push("");
  lines.push("窗口覆盖的任务：");
  for (const t of w.taskDescriptions) {
    lines.push(`  · ${t || "(无描述)"}`);
  }
  lines.push("");
  lines.push("约束触发情况：");
  let idx = 1;
  for (const c of result.constraints) {
    const status = c.suspectedDeadWeight ? "🚨 疑似 dead weight" : "✅ 正常";
    lines.push("");
    lines.push(`  [${idx}] ${c.label} (${c.id})`);
    lines.push(`      ${c.detail}`);
    lines.push(`      状态：${status}`);
    if (c.suspectedDeadWeight) {
      lines.push(`      建议：review 这条约束。不自动修改。`);
      lines.push(`      参考：${c.rationale}`);
    }
    idx += 1;
  }
  lines.push("");
  if (result.suspectedDeadWeight.length > 0) {
    lines.push(`🚨 疑似 dead weight：${result.suspectedDeadWeight.join(", ")}`);
  } else {
    lines.push("✅ 本窗口无疑似 dead weight");
  }
  lines.push("");
  lines.push(`窗口说明：${w.note}`);
  lines.push("这份数据供再认识之用。不自动修改任何约束。");
  lines.push("哲学依据：《矛盾论》矛盾转化 + 《实践论》再实践—再认识");
  return lines.join("\n");
}

const COUNTER_FILE = ".stw/.audit-counter.json";
const COUNTER_THRESHOLD = 5;

/**
 * T14b: bump the archive counter; return a prompt string when archives % 5 === 0.
 * On corrupted counter JSON, resets to { archives: 1 } and rewrites the file
 * (self-heal) instead of silently returning 0 and leaving the file broken.
 * Write-path errors swallow to { archives: 0, prompt: null } as a last resort.
 */
export function bumpAuditCounter(rootDir) {
  const counterPath = join(rootDir, COUNTER_FILE);
  let counter = { archives: 0 };
  if (existsSync(counterPath)) {
    try {
      const parsed = JSON.parse(readFileSync(counterPath, "utf-8"));
      if (parsed && typeof parsed.archives === "number") counter = parsed;
    } catch {
      counter = { archives: 0 };
    }
  }
  counter.archives = (counter.archives || 0) + 1;
  try {
    writeFileSync(counterPath, JSON.stringify(counter, null, 2));
  } catch {
    return { archives: counter.archives, prompt: null };
  }
  const prompt =
    counter.archives % COUNTER_THRESHOLD === 0
      ? `本次是第 ${counter.archives} 次归档 —— 运行 stw audit 看最近 ${DEFAULT_LIMIT} 次任务的约束触发情况`
      : null;
  return { archives: counter.archives, prompt };
}
