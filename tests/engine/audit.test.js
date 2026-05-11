import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  auditConstraints,
  formatAuditOutput,
  bumpAuditCounter,
} from "../../src/engine/audit.js";

function fresh() {
  const dir = join(
    tmpdir(),
    "stw-audit-" + Date.now() + "-" + Math.random().toString(36).slice(2),
  );
  mkdirSync(join(dir, ".stw"), { recursive: true });
  return dir;
}

function writeEvents(dir, lines) {
  const body = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
  writeFileSync(join(dir, ".stw", "events.jsonl"), body);
}

function writeClaudeMd(dir, lineCount) {
  const body = Array.from({ length: lineCount }, (_, i) => `line ${i + 1}`).join("\n");
  writeFileSync(join(dir, "CLAUDE.md"), body);
}

function sessionStart(ts, taskDescription) {
  return { ts, id: ts, type: "session.start", task: taskDescription, phase: 1, data: { taskDescription, startedAt: ts } };
}

describe("audit — graceful skip", () => {
  it("skips when events.jsonl missing", async () => {
    const dir = fresh();
    const r = await auditConstraints(dir);
    assert.equal(r.ok, true);
    assert.ok(r.skipped);
    rmSync(dir, { recursive: true, force: true });
  });

  it("skips when events.jsonl has no session.start", async () => {
    const dir = fresh();
    writeEvents(dir, [{ ts: "2026-05-11T00:00:00Z", id: "a", type: "gate.run", task: "", phase: 0, data: {} }]);
    const r = await auditConstraints(dir);
    assert.equal(r.ok, true);
    assert.ok(r.skipped);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("audit — window bucketing", () => {
  it("splits events into sessions by session.start boundary", async () => {
    const dir = fresh();
    writeEvents(dir, [
      sessionStart("2026-05-09T00:00:00Z", "task A"),
      { ts: "2026-05-09T00:01:00Z", id: "1", type: "gate.confidence", task: "task A", phase: 1, data: { ready: true } },
      sessionStart("2026-05-10T00:00:00Z", "task B"),
      { ts: "2026-05-10T00:01:00Z", id: "2", type: "phase.advance.denied", task: "task B", phase: 2, data: { gate: "bounds" } },
      sessionStart("2026-05-11T00:00:00Z", "task C"),
    ]);
    const r = await auditConstraints(dir);
    assert.equal(r.ok, true);
    assert.equal(r.window.actualTasks, 3);
    assert.deepEqual(
      r.window.taskDescriptions,
      ["task A", "task B", "task C"],
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("honors --limit to slice last N tasks", async () => {
    const dir = fresh();
    writeEvents(dir, [
      sessionStart("2026-05-08T00:00:00Z", "task A"),
      sessionStart("2026-05-09T00:00:00Z", "task B"),
      sessionStart("2026-05-10T00:00:00Z", "task C"),
      sessionStart("2026-05-11T00:00:00Z", "task D"),
    ]);
    const r = await auditConstraints(dir, { limit: 2 });
    assert.equal(r.window.actualTasks, 2);
    assert.deepEqual(r.window.taskDescriptions, ["task C", "task D"]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects --limit <= 0 with exit-nonzero signal", async () => {
    const dir = fresh();
    writeEvents(dir, [sessionStart("2026-05-11T00:00:00Z", "t")]);
    const r = await auditConstraints(dir, { limit: 0 });
    assert.equal(r.ok, false);
    assert.match(r.error, /必须为 >= 1/);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("audit — constraint statistics", () => {
  it("counts confidence gate triggered correctly", async () => {
    const dir = fresh();
    writeEvents(dir, [
      sessionStart("2026-05-09T00:00:00Z", "A"),
      { ts: "2026-05-09T00:01:00Z", id: "1", type: "gate.confidence", task: "A", phase: 1, data: { ready: false } },
      sessionStart("2026-05-10T00:00:00Z", "B"),
      { ts: "2026-05-10T00:01:00Z", id: "2", type: "gate.confidence", task: "B", phase: 1, data: { ready: true } },
      sessionStart("2026-05-11T00:00:00Z", "C"),
      { ts: "2026-05-11T00:01:00Z", id: "3", type: "gate.confidence", task: "C", phase: 1, data: { ready: false } },
    ]);
    const r = await auditConstraints(dir);
    const conf = r.constraints.find((c) => c.id === "confidence");
    assert.equal(conf.triggered, 2);
    assert.equal(conf.notTriggered, 1);
    assert.equal(conf.suspectedDeadWeight, false);
    rmSync(dir, { recursive: true, force: true });
  });

  it("flags attack-zone as dead weight when 0 triggers across >= 3 tasks", async () => {
    const dir = fresh();
    writeEvents(dir, [
      sessionStart("2026-05-09T00:00:00Z", "A"),
      sessionStart("2026-05-10T00:00:00Z", "B"),
      sessionStart("2026-05-11T00:00:00Z", "C"),
    ]);
    const r = await auditConstraints(dir);
    const az = r.constraints.find((c) => c.id === "attack-zone");
    assert.equal(az.triggered, 0);
    assert.equal(az.suspectedDeadWeight, true);
    assert.ok(r.suspectedDeadWeight.includes("attack-zone"));
    rmSync(dir, { recursive: true, force: true });
  });

  it("does NOT flag dead weight when actualTasks < 3", async () => {
    const dir = fresh();
    writeEvents(dir, [
      sessionStart("2026-05-10T00:00:00Z", "A"),
      sessionStart("2026-05-11T00:00:00Z", "B"),
    ]);
    const r = await auditConstraints(dir);
    const az = r.constraints.find((c) => c.id === "attack-zone");
    assert.equal(az.triggered, 0);
    assert.equal(
      az.suspectedDeadWeight,
      false,
      "sample size < 3 must suppress dead weight flag to avoid statistical noise",
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("breaks down phase-gates by sub-gate in detail string (P3)", async () => {
    const dir = fresh();
    writeEvents(dir, [
      sessionStart("2026-05-09T00:00:00Z", "A"),
      { ts: "2026-05-09T00:01:00Z", id: "1", type: "phase.advance.denied", task: "A", phase: 1, data: { gate: "bounds" } },
      sessionStart("2026-05-10T00:00:00Z", "B"),
      { ts: "2026-05-10T00:01:00Z", id: "2", type: "phase.advance.denied", task: "B", phase: 1, data: { gate: "confidence" } },
      sessionStart("2026-05-11T00:00:00Z", "C"),
    ]);
    const r = await auditConstraints(dir);
    const pg = r.constraints.find((c) => c.id === "phase-gates");
    assert.match(pg.detail, /bounds=1/);
    assert.match(pg.detail, /confidence=1/);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("audit — claude-md static check", () => {
  it("flags CLAUDE.md > 100 lines as suspected dead weight", async () => {
    const dir = fresh();
    writeEvents(dir, [
      sessionStart("2026-05-09T00:00:00Z", "A"),
      sessionStart("2026-05-10T00:00:00Z", "B"),
      sessionStart("2026-05-11T00:00:00Z", "C"),
    ]);
    writeClaudeMd(dir, 102);
    const r = await auditConstraints(dir);
    const cm = r.constraints.find((c) => c.id === "claude-md");
    assert.equal(cm.suspectedDeadWeight, true);
    assert.match(cm.detail, /102 行/);
    assert.match(cm.detail, /静态指标/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("does not flag CLAUDE.md <= 100 lines", async () => {
    const dir = fresh();
    writeEvents(dir, [sessionStart("2026-05-11T00:00:00Z", "A")]);
    writeClaudeMd(dir, 80);
    const r = await auditConstraints(dir);
    const cm = r.constraints.find((c) => c.id === "claude-md");
    assert.equal(cm.suspectedDeadWeight, false);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("audit — error-registry approximate metric", () => {
  it("counts registry entries whose timestamp falls in window", async () => {
    const dir = fresh();
    writeEvents(dir, [
      sessionStart("2026-05-09T00:00:00Z", "A"),
      sessionStart("2026-05-10T00:00:00Z", "B"),
      sessionStart("2026-05-11T00:00:00Z", "C"),
    ]);
    writeFileSync(
      join(dir, ".stw", "error-registry.json"),
      JSON.stringify([
        { id: "e1", description: "old", timestamp: "2026-05-01T00:00:00Z" },
        { id: "e2", description: "in-window", timestamp: "2026-05-10T12:00:00Z" },
        { id: "e3", description: "in-window", timestamp: "2026-05-11T01:00:00Z" },
      ]),
    );
    const r = await auditConstraints(dir);
    const er = r.constraints.find((c) => c.id === "error-registry");
    assert.equal(er.triggered, 2);
    assert.match(er.detail, /approximate/);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("audit — formatAuditOutput", () => {
  it("renders skipped result", () => {
    const out = formatAuditOutput({ ok: true, skipped: "无历史" });
    assert.match(out, /⊘/);
    assert.match(out, /无历史/);
  });

  it("renders full report with dead weight section", () => {
    const out = formatAuditOutput({
      ok: true,
      window: {
        limit: 10, actualTasks: 3,
        taskDescriptions: ["task A", "task B", "task C"],
        note: "仅读主 .stw/events.jsonl · rotated (events.jsonl.1) 历史不计",
      },
      constraints: [
        { id: "attack-zone", label: "ATTACK_ZONE", triggered: 0, notTriggered: 3, detail: "触发 0/3", suspectedDeadWeight: true, rationale: "Osmani" },
      ],
      suspectedDeadWeight: ["attack-zone"],
    });
    assert.match(out, /ATTACK_ZONE/);
    assert.match(out, /🚨 疑似 dead weight/);
    assert.match(out, /task A/);
    assert.match(out, /rotated/);
  });

  it("renders error result", () => {
    const out = formatAuditOutput({ ok: false, error: "bad --limit" });
    assert.match(out, /❌/);
  });
});

describe("audit — bumpAuditCounter (T14b)", () => {
  it("returns prompt every 5th archive, null otherwise", () => {
    const dir = fresh();
    const results = [];
    for (let i = 0; i < 11; i++) {
      results.push(bumpAuditCounter(dir));
    }
    assert.equal(results[0].prompt, null);
    assert.equal(results[3].prompt, null);
    assert.ok(results[4].prompt, "5th archive must yield prompt");
    assert.match(results[4].prompt, /第 5 次/);
    assert.equal(results[5].prompt, null);
    assert.ok(results[9].prompt, "10th archive must yield prompt");
    assert.match(results[9].prompt, /第 10 次/);
    assert.equal(results[10].prompt, null);
    rmSync(dir, { recursive: true, force: true });
  });

  it("persists counter across calls via .stw/.audit-counter.json", () => {
    const dir = fresh();
    bumpAuditCounter(dir);
    bumpAuditCounter(dir);
    const p = join(dir, ".stw", ".audit-counter.json");
    assert.ok(existsSync(p));
    const raw = JSON.parse(readFileSyncSafe(p));
    assert.equal(raw.archives, 2);
    rmSync(dir, { recursive: true, force: true });
  });

  it("self-heals when .audit-counter.json is corrupted JSON (T14.bis b)", () => {
    const dir = fresh();
    const p = join(dir, ".stw", ".audit-counter.json");
    writeFileSync(p, "{{{ not valid json");
    // First bump after corruption: reset to archives:1 and rewrite valid JSON
    const firstBump = bumpAuditCounter(dir);
    assert.equal(firstBump.archives, 1);
    assert.equal(firstBump.prompt, null);
    // File must now parse as legal JSON
    const raw1 = JSON.parse(readFileSyncSafe(p));
    assert.equal(raw1.archives, 1);
    // Second bump: normal read path, increments to 2
    const secondBump = bumpAuditCounter(dir);
    assert.equal(secondBump.archives, 2);
    const raw2 = JSON.parse(readFileSyncSafe(p));
    assert.equal(raw2.archives, 2);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("audit — opts.eventsOverride DI (T14.bis a)", () => {
  it("honors opts.eventsOverride bypassing readEvents/fs entirely", async () => {
    const dir = fresh();
    // Intentionally write NO events.jsonl file — override must still work
    const overrideEvents = [
      sessionStart("2026-05-09T00:00:00Z", "di-A"),
      { ts: "2026-05-09T00:01:00Z", id: "1", type: "gate.confidence", task: "di-A", phase: 1, data: { ready: false } },
      sessionStart("2026-05-10T00:00:00Z", "di-B"),
      sessionStart("2026-05-11T00:00:00Z", "di-C"),
    ];
    const r = await auditConstraints(dir, { eventsOverride: overrideEvents });
    assert.equal(r.ok, true);
    assert.equal(r.window.actualTasks, 3);
    assert.deepEqual(r.window.taskDescriptions, ["di-A", "di-B", "di-C"]);
    const conf = r.constraints.find((c) => c.id === "confidence");
    assert.equal(conf.triggered, 1);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("audit — opts.minTasks parameter (T14.bis c)", () => {
  it("raises dead-weight threshold: 3 tasks with 0 triggers no longer flagged when minTasks=5", async () => {
    const dir = fresh();
    writeEvents(dir, [
      sessionStart("2026-05-09T00:00:00Z", "A"),
      sessionStart("2026-05-10T00:00:00Z", "B"),
      sessionStart("2026-05-11T00:00:00Z", "C"),
    ]);
    const r = await auditConstraints(dir, { minTasks: 5 });
    const az = r.constraints.find((c) => c.id === "attack-zone");
    assert.equal(az.triggered, 0);
    assert.equal(
      az.suspectedDeadWeight,
      false,
      "minTasks=5 must suppress dead-weight flag when window has only 3 tasks",
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("defaults to MIN_TASKS_FOR_DEAD_WEIGHT=3 when opts.minTasks absent", async () => {
    const dir = fresh();
    writeEvents(dir, [
      sessionStart("2026-05-09T00:00:00Z", "A"),
      sessionStart("2026-05-10T00:00:00Z", "B"),
      sessionStart("2026-05-11T00:00:00Z", "C"),
    ]);
    const r = await auditConstraints(dir);
    const az = r.constraints.find((c) => c.id === "attack-zone");
    assert.equal(az.suspectedDeadWeight, true, "default 3 must still flag");
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects --min-tasks <= 0", async () => {
    const dir = fresh();
    writeEvents(dir, [sessionStart("2026-05-11T00:00:00Z", "t")]);
    const r = await auditConstraints(dir, { minTasks: 0 });
    assert.equal(r.ok, false);
    assert.match(r.error, /必须为 >= 1/);
    rmSync(dir, { recursive: true, force: true });
  });
});

import { readFileSync as readFileSyncSafe } from "node:fs";
