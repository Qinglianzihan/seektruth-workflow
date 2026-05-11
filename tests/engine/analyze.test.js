import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { analyzeTraces, formatAnalyzeOutput } from "../../src/engine/analyze.js";

function fresh() {
  const dir = join(
    tmpdir(),
    "stw-analyze-" + Date.now() + "-" + Math.random().toString(36).slice(2),
  );
  mkdirSync(join(dir, ".stw"), { recursive: true });
  return dir;
}

function writeEvents(dir, lines) {
  const body = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
  writeFileSync(join(dir, ".stw", "events.jsonl"), body);
}

function sessionStart(ts, taskDescription) {
  return {
    ts,
    id: ts,
    type: "session.start",
    task: taskDescription,
    phase: 1,
    data: { taskDescription, startedAt: ts },
  };
}

function writeRegistry(dir, entries) {
  writeFileSync(
    join(dir, ".stw", "error-registry.json"),
    JSON.stringify(entries, null, 2),
  );
}

function writeSummaryReport(dir, name, ledgerRows) {
  const reportsDir = join(dir, ".stw", "reports");
  mkdirSync(reportsDir, { recursive: true });
  const header = `# 战役总结报告\n\n## 1. 战役概述\n\n(stub)\n\n`;
  let body = header;
  if (ledgerRows !== null) {
    body += "## 7. 证据账本\n\n| 文件 | 预测 | 实际 | 判定 |\n| :--- | :--- | :--- | :--- |\n";
    for (const r of ledgerRows) {
      body += `| ${r.file} | ${r.predicted} | ${r.actual} | ${r.verdict} |\n`;
    }
  }
  writeFileSync(join(reportsDir, name), body);
}

describe("analyze — graceful skip", () => {
  it("skips when events.jsonl missing", async () => {
    const dir = fresh();
    const r = await analyzeTraces(dir);
    assert.equal(r.ok, true);
    assert.ok(r.skipped);
    rmSync(dir, { recursive: true, force: true });
  });

  it("skips when no session.start events", async () => {
    const dir = fresh();
    writeEvents(dir, [
      { ts: "2026-05-11T00:00:00Z", id: "a", type: "gate.run", task: "", phase: 0, data: {} },
    ]);
    const r = await analyzeTraces(dir);
    assert.equal(r.ok, true);
    assert.ok(r.skipped);
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects --limit <= 0", async () => {
    const dir = fresh();
    writeEvents(dir, [sessionStart("2026-05-11T00:00:00Z", "t")]);
    const r = await analyzeTraces(dir, { limit: 0 });
    assert.equal(r.ok, false);
    assert.match(r.error, /必须为 >= 1/);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("analyze — window slicing (reuses T14 splitIntoSessions)", () => {
  it("splits events into sessions by session.start boundary", async () => {
    const dir = fresh();
    writeEvents(dir, [
      sessionStart("2026-05-09T00:00:00Z", "task A"),
      sessionStart("2026-05-10T00:00:00Z", "task B"),
      sessionStart("2026-05-11T00:00:00Z", "task C"),
    ]);
    const r = await analyzeTraces(dir);
    assert.equal(r.ok, true);
    assert.equal(r.window.actualTasks, 3);
    assert.deepEqual(r.window.taskDescriptions, ["task A", "task B", "task C"]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("honors --limit to slice last N tasks", async () => {
    const dir = fresh();
    writeEvents(dir, [
      sessionStart("2026-05-08T00:00:00Z", "A"),
      sessionStart("2026-05-09T00:00:00Z", "B"),
      sessionStart("2026-05-10T00:00:00Z", "C"),
      sessionStart("2026-05-11T00:00:00Z", "D"),
    ]);
    const r = await analyzeTraces(dir, { limit: 2 });
    assert.equal(r.window.actualTasks, 2);
    assert.deepEqual(r.window.taskDescriptions, ["C", "D"]);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("analyze — opts.eventsOverride DI", () => {
  it("honors opts.eventsOverride bypassing fs", async () => {
    const dir = fresh();
    const overrideEvents = [
      sessionStart("2026-05-09T00:00:00Z", "di-A"),
      { ts: "2026-05-09T00:01:00Z", id: "1", type: "phase.advance.denied", task: "di-A", phase: 3, data: { gate: "bounds" } },
      sessionStart("2026-05-10T00:00:00Z", "di-B"),
      { ts: "2026-05-10T00:01:00Z", id: "2", type: "phase.advance.denied", task: "di-B", phase: 3, data: { gate: "bounds" } },
      sessionStart("2026-05-11T00:00:00Z", "di-C"),
      { ts: "2026-05-11T00:01:00Z", id: "3", type: "phase.advance.denied", task: "di-C", phase: 3, data: { gate: "reviewer" } },
    ];
    const r = await analyzeTraces(dir, { eventsOverride: overrideEvents });
    assert.equal(r.ok, true);
    assert.equal(r.window.actualTasks, 3);
    const gd = r.findings.find((f) => f.id === "gate-denied-hotspots");
    assert.equal(gd.empty, false);
    assert.deepEqual(
      gd.topItems.map((i) => i.key).sort(),
      ["bounds", "reviewer"].sort(),
    );
    const boundsEntry = gd.topItems.find((i) => i.key === "bounds");
    assert.equal(boundsEntry.count, 2);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("analyze — gate-denied-hotspots", () => {
  it("ranks sub-gates by count and tracks per-session denied count", async () => {
    const dir = fresh();
    writeEvents(dir, [
      sessionStart("2026-05-09T00:00:00Z", "doom loop task"),
      { ts: "2026-05-09T00:01:00Z", id: "1", type: "phase.advance.denied", task: "doom loop task", phase: 3, data: { gate: "bounds" } },
      { ts: "2026-05-09T00:02:00Z", id: "2", type: "phase.advance.denied", task: "doom loop task", phase: 3, data: { gate: "bounds" } },
      { ts: "2026-05-09T00:03:00Z", id: "3", type: "phase.advance.denied", task: "doom loop task", phase: 3, data: { gate: "bounds" } },
      sessionStart("2026-05-10T00:00:00Z", "other"),
      { ts: "2026-05-10T00:01:00Z", id: "4", type: "phase.advance.denied", task: "other", phase: 3, data: { gate: "confidence" } },
    ]);
    const r = await analyzeTraces(dir);
    const gd = r.findings.find((f) => f.id === "gate-denied-hotspots");
    assert.equal(gd.empty, false);
    assert.equal(gd.topItems[0].key, "bounds");
    assert.equal(gd.topItems[0].count, 3);
    const doomLoopSession = gd.perSession.find((s) => s.key.includes("doom"));
    assert.equal(doomLoopSession.count, 3);
    rmSync(dir, { recursive: true, force: true });
  });

  it("marks empty when no denied events", async () => {
    const dir = fresh();
    writeEvents(dir, [sessionStart("2026-05-11T00:00:00Z", "A")]);
    const r = await analyzeTraces(dir);
    const gd = r.findings.find((f) => f.id === "gate-denied-hotspots");
    assert.equal(gd.empty, true);
    assert.equal(gd.topItems.length, 0);
    rmSync(dir, { recursive: true, force: true });
  });

  it("perSession entries use `key` field (not `task`) so formatter never prints undefined", async () => {
    const dir = fresh();
    writeEvents(dir, [
      sessionStart("2026-05-11T00:00:00Z", "named task"),
      { ts: "2026-05-11T00:01:00Z", id: "1", type: "phase.advance.denied", task: "named task", phase: 3, data: { gate: "bounds" } },
    ]);
    const r = await analyzeTraces(dir);
    const gd = r.findings.find((f) => f.id === "gate-denied-hotspots");
    for (const entry of gd.perSession) {
      assert.equal(typeof entry.key, "string");
      assert.notEqual(entry.key, "");
      assert.equal(entry.task, undefined, "field must be renamed from task→key to match formatter contract");
    }
    const out = formatAnalyzeOutput(r);
    assert.doesNotMatch(out, /undefined/, "formatter must not print 'undefined' on real perSession data");
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("analyze — check-failures", () => {
  it("only counts ok=false events and unpacks data.failed[]", async () => {
    const dir = fresh();
    writeEvents(dir, [
      sessionStart("2026-05-11T00:00:00Z", "T"),
      { ts: "2026-05-11T00:01:00Z", id: "p1", type: "check.summary", task: "T", phase: 3, data: { ok: true, failed: [], gates: ["lint"] } },
      { ts: "2026-05-11T00:02:00Z", id: "p2", type: "check.summary", task: "T", phase: 3, data: { ok: true, failed: [], gates: ["lint"] } },
      { ts: "2026-05-11T00:03:00Z", id: "f1", type: "check.summary", task: "T", phase: 3, data: { ok: false, failed: ["lint"], gates: ["lint"] } },
      { ts: "2026-05-11T00:04:00Z", id: "f2", type: "check.summary", task: "T", phase: 3, data: { ok: false, failed: ["lint", "test"], gates: ["lint", "test"] } },
    ]);
    const r = await analyzeTraces(dir);
    const cf = r.findings.find((f) => f.id === "check-failures");
    assert.equal(cf.empty, false);
    const lintEntry = cf.topItems.find((i) => i.key === "lint");
    const testEntry = cf.topItems.find((i) => i.key === "test");
    assert.equal(lintEntry.count, 2);
    assert.equal(testEntry.count, 1);
    rmSync(dir, { recursive: true, force: true });
  });

  it("marks empty when all check.summary are ok:true (planner R1 issue)", async () => {
    const dir = fresh();
    writeEvents(dir, [
      sessionStart("2026-05-11T00:00:00Z", "T"),
      { ts: "2026-05-11T00:01:00Z", id: "p1", type: "check.summary", task: "T", phase: 3, data: { ok: true, failed: [], gates: ["lint"] } },
    ]);
    const r = await analyzeTraces(dir);
    const cf = r.findings.find((f) => f.id === "check-failures");
    assert.equal(cf.empty, true);
  });
});

describe("analyze — error-registry-hotspots", () => {
  it("ranks tags by count + keeps recent 3 by timestamp desc", async () => {
    const dir = fresh();
    writeEvents(dir, [sessionStart("2026-05-11T00:00:00Z", "T")]);
    writeRegistry(dir, [
      { id: "e1", description: "old A", tags: ["lint", "regression"], phase: 3, timestamp: "2026-05-01T00:00:00Z" },
      { id: "e2", description: "old B", tags: ["lint"], phase: 3, timestamp: "2026-05-02T00:00:00Z" },
      { id: "e3", description: "new mismatch", tags: ["falsifiable", "mismatch"], phase: 5, timestamp: "2026-05-11T13:00:00Z" },
    ]);
    const r = await analyzeTraces(dir);
    const er = r.findings.find((f) => f.id === "error-registry-hotspots");
    assert.equal(er.empty, false);
    const lintEntry = er.topItems.find((i) => i.key === "lint");
    assert.equal(lintEntry.count, 2);
    assert.equal(er.recent[0].desc, "new mismatch");
    rmSync(dir, { recursive: true, force: true });
  });

  it("empty registry → empty:true, no crash", async () => {
    const dir = fresh();
    writeEvents(dir, [sessionStart("2026-05-11T00:00:00Z", "T")]);
    const r = await analyzeTraces(dir);
    const er = r.findings.find((f) => f.id === "error-registry-hotspots");
    assert.equal(er.empty, true);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("analyze — evidence-verdict-trend", () => {
  it("scans reports and aggregates ledger verdicts correctly", async () => {
    const dir = fresh();
    writeEvents(dir, [sessionStart("2026-05-11T00:00:00Z", "T")]);
    writeSummaryReport(dir, "summary-2026-05-09T00-00-00.md", null);
    writeSummaryReport(dir, "summary-2026-05-10T00-00-00.md", [
      { file: "a.js", predicted: "x", actual: "x", verdict: "兑现" },
      { file: "b.js", predicted: "y", actual: "z", verdict: "不兑现" },
    ]);
    writeSummaryReport(dir, "summary-2026-05-11T00-00-00.md", [
      { file: "c.js", predicted: "p", actual: "p", verdict: "兑现" },
      { file: "d.js", predicted: "q", actual: "q", verdict: "兑现" },
      { file: "e.js", predicted: "r", actual: "s", verdict: "跳过" },
    ]);
    const r = await analyzeTraces(dir);
    const ev = r.findings.find((f) => f.id === "evidence-verdict-trend");
    assert.equal(ev.reportsWithLedger, 2);
    assert.equal(ev.cumulative.total, 5);
    assert.equal(ev.cumulative.confirmed, 3);
    assert.equal(ev.cumulative.mismatches, 1);
    assert.equal(ev.cumulative.skipped, 1);
    rmSync(dir, { recursive: true, force: true });
  });

  it("old-schema reports without §7 → empty:true, no crash", async () => {
    const dir = fresh();
    writeEvents(dir, [sessionStart("2026-05-11T00:00:00Z", "T")]);
    writeSummaryReport(dir, "summary-2026-05-09T00-00-00.md", null);
    writeSummaryReport(dir, "summary-2026-05-10T00-00-00.md", null);
    const r = await analyzeTraces(dir);
    const ev = r.findings.find((f) => f.id === "evidence-verdict-trend");
    assert.equal(ev.empty, true);
    assert.equal(ev.cumulative.total, 0);
    assert.equal(ev.reportsWithLedger, 0);
    rmSync(dir, { recursive: true, force: true });
  });

  it("empty reports dir → empty:true, no crash", async () => {
    const dir = fresh();
    writeEvents(dir, [sessionStart("2026-05-11T00:00:00Z", "T")]);
    const r = await analyzeTraces(dir);
    const ev = r.findings.find((f) => f.id === "evidence-verdict-trend");
    assert.equal(ev.empty, true);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("analyze — session-load", () => {
  it("aggregates gate.run + check.summary + hook.run per session", async () => {
    const dir = fresh();
    writeEvents(dir, [
      sessionStart("2026-05-11T00:00:00Z", "heavy"),
      { ts: "2026-05-11T00:01:00Z", id: "1", type: "gate.run", task: "heavy", phase: 3, data: {} },
      { ts: "2026-05-11T00:02:00Z", id: "2", type: "gate.run", task: "heavy", phase: 3, data: {} },
      { ts: "2026-05-11T00:03:00Z", id: "3", type: "check.summary", task: "heavy", phase: 3, data: { ok: true, failed: [] } },
      { ts: "2026-05-11T00:04:00Z", id: "4", type: "hook.run", task: "heavy", phase: 3, data: {} },
      sessionStart("2026-05-11T01:00:00Z", "light"),
      { ts: "2026-05-11T01:01:00Z", id: "5", type: "gate.run", task: "light", phase: 3, data: {} },
    ]);
    const r = await analyzeTraces(dir);
    const sl = r.findings.find((f) => f.id === "session-load");
    assert.equal(sl.empty, false);
    assert.equal(sl.topItems[0].key, "heavy");
    assert.equal(sl.topItems[0].count, 4);
    assert.equal(sl.topItems[0].breakdown["gate.run"], 2);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("analyze — formatAnalyzeOutput", () => {
  it("renders skipped result with ⊘", () => {
    const out = formatAnalyzeOutput({ ok: true, skipped: "无历史" });
    assert.match(out, /⊘/);
    assert.match(out, /无历史/);
  });

  it("renders error result with ❌", () => {
    const out = formatAnalyzeOutput({ ok: false, error: "bad --limit" });
    assert.match(out, /❌/);
    assert.match(out, /bad --limit/);
  });

  it("renders full report with Top-N and task list", () => {
    const out = formatAnalyzeOutput({
      ok: true,
      window: {
        limit: 10, actualTasks: 2,
        taskDescriptions: ["task A", "task B"],
        note: "仅读主 .stw/events.jsonl · rotated (events.jsonl.1) 历史不计",
      },
      findings: [
        {
          id: "gate-denied-hotspots",
          label: "Phase gate denied 热点",
          detail: "3 次 denied",
          topItems: [{ key: "bounds", count: 2 }, { key: "confidence", count: 1 }],
          perSession: [],
          rationale: "LangChain",
          empty: false,
        },
      ],
    });
    assert.match(out, /📊 STW Trace Analyzer/);
    assert.match(out, /task A/);
    assert.match(out, /bounds — 2/);
    assert.match(out, /rotated/);
  });
});

describe("analyze — real repo smoke (feedback-real-repo-smoke-test.md)", () => {
  it("runs against current repo .stw/ without throwing, no undefined in findings", async () => {
    const repoRoot = process.cwd();
    // Only run when the repo has accumulated data (CI-safe guard)
    const eventsPath = join(repoRoot, ".stw", "events.jsonl");
    const { existsSync } = await import("node:fs");
    if (!existsSync(eventsPath)) return;
    const r = await analyzeTraces(repoRoot);
    assert.equal(r.ok, true);
    if (r.skipped) return;
    assert.ok(r.window, "window must exist on success path");
    assert.ok(Array.isArray(r.findings));
    assert.equal(r.findings.length, 5);
    const ids = r.findings.map((f) => f.id).sort();
    assert.deepEqual(ids, [
      "check-failures",
      "error-registry-hotspots",
      "evidence-verdict-trend",
      "gate-denied-hotspots",
      "session-load",
    ]);
    for (const f of r.findings) {
      assert.equal(typeof f.label, "string");
      assert.equal(typeof f.detail, "string");
      assert.equal(typeof f.rationale, "string");
      assert.equal(typeof f.empty, "boolean");
    }
    // Format path must not throw
    const out = formatAnalyzeOutput(r);
    assert.match(out, /STW Trace Analyzer/);
  });
});

describe("analyze — JSON output is valid JSON", () => {
  it("result serializes round-trip via JSON.parse", async () => {
    const dir = fresh();
    writeEvents(dir, [
      sessionStart("2026-05-11T00:00:00Z", "T"),
      { ts: "2026-05-11T00:01:00Z", id: "1", type: "phase.advance.denied", task: "T", phase: 3, data: { gate: "bounds" } },
    ]);
    const r = await analyzeTraces(dir);
    const s = JSON.stringify(r, null, 2);
    const parsed = JSON.parse(s);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.window.actualTasks, 1);
    assert.equal(parsed.findings.length, 5);
    rmSync(dir, { recursive: true, force: true });
  });
});

// T15.bis R3: formatAnalyzeOutput 的 empty state 字符串「✓ 无热点」未被直测
describe("formatAnalyzeOutput — T15.bis R3 empty state 直测", () => {
  it("单个 finding 的 empty:true 分支产出 '✓ 无热点'", () => {
    const result = {
      ok: true,
      window: { limit: 10, actualTasks: 1, taskDescriptions: ["t"], note: "(n)" },
      findings: [
        {
          id: "gate-denied-hotspots",
          label: "label A",
          detail: "nothing",
          topItems: [],
          empty: true,
          rationale: "r",
        },
      ],
    };
    const out = formatAnalyzeOutput(result);
    assert.ok(out.includes("✓ 无热点"), `expected '✓ 无热点' in output, got:\n${out}`);
    assert.ok(out.includes("label A"));
  });

  it("empty:false + topItems 非空时走 Top-N 渲染分支（不出 '✓ 无热点'）", () => {
    const result = {
      ok: true,
      window: { limit: 10, actualTasks: 1, taskDescriptions: ["t"], note: "(n)" },
      findings: [
        {
          id: "x",
          label: "label B",
          detail: "d",
          topItems: [{ key: "k1", count: 3 }],
          empty: false,
          rationale: "r",
        },
      ],
    };
    const out = formatAnalyzeOutput(result);
    assert.ok(!out.includes("✓ 无热点"));
    assert.ok(out.includes("k1 — 3"));
  });

  it("!ok 直接返回 ❌ 开头", () => {
    assert.equal(formatAnalyzeOutput({ ok: false, error: "bad" }), "❌ bad");
  });

  it("skipped 直接返回 ⊘ 开头", () => {
    assert.equal(formatAnalyzeOutput({ ok: true, skipped: "无历史" }), "⊘ 无历史");
  });
});
