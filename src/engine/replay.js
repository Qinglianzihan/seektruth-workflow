import { readEvents } from "./events.js";

const GATE_DENIED_TYPES = new Set([
  "phase.advance.denied",
  "gate.confidence.denied",
  "gate.planner.denied",
  "gate.reviewer.denied",
  "gate.bounds.denied",
  "gate.changePlan.denied",
  "gate.run.failed",
  "check.summary.failed",
  "hook.run.failed",
]);

function isDenied(event) {
  if (!event || !event.type) return false;
  if (GATE_DENIED_TYPES.has(event.type)) return true;
  if (event.data && event.data.ok === false) return true;
  if (event.data && event.data.passed === false) return true;
  return false;
}

/**
 * Produce a human-readable single-line summary for an event.
 */
export function summarizeEvent(event) {
  if (!event || typeof event !== "object") return "(invalid event)";
  const ts = event.ts || "?";
  const type = event.type || "?";
  const phase = event.phase != null ? `P${event.phase}` : "P-";
  const data = event.data || {};
  let detail;

  switch (type) {
    case "session.start":
      detail = `task="${truncate(event.task, 60)}"`;
      break;
    case "session.rollback":
      detail = `from phase ${data.fromPhase ?? "?"} (${truncate(data.reason, 60)})`;
      break;
    case "session.abort":
      detail = `aborted at phase ${data.phase ?? "?"}`;
      break;
    case "session.complete":
      detail = "all 5 phases done";
      break;
    case "phase.advance.ok":
      detail = `${data.from ?? "?"} → ${data.to ?? "?"}`;
      break;
    case "phase.advance.denied":
      detail = `phase ${data.phase ?? "?"} blocked by ${data.gate || "?"}: ${truncate(data.error, 120)}`;
      break;
    case "gate.confidence":
      detail = `score=${data.score ?? "?"}/${data.threshold ?? "?"} ok=${data.ok}`;
      break;
    case "gate.planner":
    case "gate.reviewer":
      detail = `ok=${data.ok} conclusion="${truncate(data.conclusion, 40)}"`;
      break;
    case "gate.bounds":
      detail = `ok=${data.ok} violations=${(data.violations || []).length}/${data.totalFiles ?? "?"}`;
      break;
    case "gate.changePlan":
      detail = `ok=${data.ok} unplanned=${(data.unplanned || []).length}`;
      break;
    case "gate.deps":
      detail = `changed=${(data.changed || []).length}`;
      break;
    case "gate.run":
      detail = `${data.gate || "?"} passed=${data.passed}`;
      break;
    case "check.summary":
      detail = `ok=${data.ok} failed=[${(data.failed || []).join(",")}]`;
      break;
    case "hook.run":
      detail = `event=${data.event || "?"} exit=${data.exitCode ?? "?"} failures=${data.failureCount ?? 0}`;
      break;
    default:
      detail = safeStringify(data, 120);
  }

  return `${ts}  ${phase}  ${type}  ${detail}`;
}

function truncate(value, n) {
  if (value == null) return "";
  const s = String(value);
  if (s.length <= n) return s;
  return s.slice(0, n) + "…";
}

function safeStringify(obj, n) {
  try {
    return truncate(JSON.stringify(obj), n);
  } catch {
    return "";
  }
}

/**
 * Render a flat chronological timeline.
 */
export function formatTimeline(events) {
  if (!events || events.length === 0) return "(暂无事件)";
  return events.map(summarizeEvent).join("\n");
}

/**
 * Find the most recent denied / failed event and walk back through the same
 * task's earlier events to build a decision chain. `contextLimit` caps the
 * number of upstream events included.
 */
export function findRootCause(events, { contextLimit = 10 } = {}) {
  if (!events || events.length === 0) {
    return { found: false, reason: "events 为空" };
  }

  let failureIdx = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    if (isDenied(events[i])) {
      failureIdx = i;
      break;
    }
  }
  if (failureIdx === -1) {
    return { found: false, reason: "未发现失败/拒绝事件" };
  }

  const failure = events[failureIdx];
  const sameTask = failure.task || "";
  const context = [];
  for (let i = failureIdx - 1; i >= 0 && context.length < contextLimit; i--) {
    const ev = events[i];
    if ((ev.task || "") !== sameTask) continue;
    context.unshift(ev);
  }

  return {
    found: true,
    failure,
    context,
    task: sameTask,
  };
}

/**
 * Convenience: load events then build the root-cause report.
 */
export async function loadRootCause(rootDir, options = {}) {
  const events = await readEvents(rootDir, options);
  return findRootCause(events, options);
}

/**
 * Convenience: load events then render the timeline.
 */
export async function loadTimeline(rootDir, options = {}) {
  const events = await readEvents(rootDir, options);
  return formatTimeline(events);
}
