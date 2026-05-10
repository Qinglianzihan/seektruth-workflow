import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import {
  appendEvent,
  readEvents,
  rotateIfLarge,
  truncateForEvent,
  EVENTS_FILE,
  EVENTS_ROTATED,
} from "../../src/engine/events.js";
import { freshDir, writeStwFile, readEventsForTest } from "../test-helper.js";

function stubClock(times) {
  let i = 0;
  return () => times[Math.min(i++, times.length - 1)];
}

function stubIdGen(ids) {
  let i = 0;
  return () => ids[Math.min(i++, ids.length - 1)];
}

describe("appendEvent", () => {
  it("writes a JSONL line to .stw/events.jsonl", () => {
    const dir = freshDir();
    const result = appendEvent(dir, "session.start", { taskDescription: "demo" }, {
      clock: stubClock(["2026-05-11T00:00:00.000Z"]),
      idGen: stubIdGen(["evt-1"]),
    });
    assert.equal(result.ok, true);
    const events = readEventsForTest(dir);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "session.start");
    assert.equal(events[0].id, "evt-1");
    assert.equal(events[0].ts, "2026-05-11T00:00:00.000Z");
    assert.deepEqual(events[0].data, { taskDescription: "demo" });
  });

  it("captures task + phase from .progress.json when present", () => {
    const dir = freshDir();
    writeStwFile(dir, ".progress.json", JSON.stringify({
      phase: 3,
      taskDescription: "T3 任务描述",
      startedAt: "2026-05-11T00:00:00.000Z",
    }));
    appendEvent(dir, "gate.bounds", { ok: true });
    const [ev] = readEventsForTest(dir);
    assert.equal(ev.phase, 3);
    assert.equal(ev.task, "T3 任务描述");
  });

  it("handles phase='complete' and missing progress gracefully", () => {
    const dir = freshDir();
    writeStwFile(dir, ".progress.json", JSON.stringify({ phase: "complete", taskDescription: "x" }));
    appendEvent(dir, "session.complete", {});
    const [done] = readEventsForTest(dir);
    assert.equal(done.phase, "complete");

    const dir2 = freshDir();
    appendEvent(dir2, "session.start", {});
    const [ev] = readEventsForTest(dir2);
    assert.equal(ev.phase, null);
    assert.equal(ev.task, "");
  });

  it("accumulates multiple events as separate lines", () => {
    const dir = freshDir();
    appendEvent(dir, "gate.planner", { ok: true });
    appendEvent(dir, "phase.advance.ok", { from: 2, to: 3 });
    const events = readEventsForTest(dir);
    assert.equal(events.length, 2);
    assert.equal(events[0].type, "gate.planner");
    assert.equal(events[1].type, "phase.advance.ok");
  });

  it("returns ok:false but never throws on invalid input", () => {
    assert.equal(appendEvent("", "session.start", {}).ok, false);
    assert.equal(appendEvent("/tmp", "", {}).ok, false);
  });

  it("swallows unknown-type errors and never poisons the workflow", () => {
    const dir = freshDir();
    // Force an error by making idGen throw — appendEvent must swallow.
    const result = appendEvent(dir, "x", {}, {
      idGen: () => { throw new Error("boom"); },
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /boom/);
  });
});

describe("readEvents", () => {
  it("returns [] when events.jsonl does not exist", async () => {
    const dir = freshDir();
    const events = await readEvents(dir);
    assert.deepEqual(events, []);
  });

  it("skips malformed lines silently", async () => {
    const dir = freshDir();
    const path = join(dir, ".stw", "events.jsonl");
    writeFileSync(path, [
      JSON.stringify({ ts: "t1", id: "a", type: "x", data: {} }),
      "{not json",
      JSON.stringify({ ts: "t2", id: "b", type: "y", data: {} }),
      "",
    ].join("\n"));
    const events = await readEvents(dir);
    assert.equal(events.length, 2);
    assert.deepEqual(events.map((e) => e.id), ["a", "b"]);
  });

  it("filters by exact type", async () => {
    const dir = freshDir();
    appendEvent(dir, "gate.planner", { ok: true });
    appendEvent(dir, "gate.reviewer", { ok: true });
    appendEvent(dir, "phase.advance.ok", { from: 1, to: 2 });
    const events = await readEvents(dir, { typeFilter: "gate.planner" });
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "gate.planner");
  });

  it("filters by type glob prefix", async () => {
    const dir = freshDir();
    appendEvent(dir, "gate.planner", {});
    appendEvent(dir, "gate.reviewer", {});
    appendEvent(dir, "phase.advance.ok", {});
    const events = await readEvents(dir, { typeFilter: "gate.*" });
    assert.equal(events.length, 2);
    assert.ok(events.every((e) => e.type.startsWith("gate.")));
  });

  it("filters by task substring", async () => {
    const dir = freshDir();
    writeStwFile(dir, ".progress.json", JSON.stringify({ phase: 1, taskDescription: "task-alpha" }));
    appendEvent(dir, "session.start", {});
    writeStwFile(dir, ".progress.json", JSON.stringify({ phase: 1, taskDescription: "other-task" }));
    appendEvent(dir, "session.start", {});
    const events = await readEvents(dir, { taskFilter: "alpha" });
    assert.equal(events.length, 1);
    assert.ok(events[0].task.includes("alpha"));
  });

  it("respects limit as tail slice", async () => {
    const dir = freshDir();
    for (let i = 0; i < 5; i++) appendEvent(dir, "gate.run", { gate: `g${i}` });
    const events = await readEvents(dir, { limit: 2 });
    assert.equal(events.length, 2);
    assert.equal(events[0].data.gate, "g3");
    assert.equal(events[1].data.gate, "g4");
  });
});

describe("truncateForEvent", () => {
  it("leaves short strings untouched", () => {
    assert.equal(truncateForEvent("short", 100), "short");
  });

  it("truncates long ASCII at codepoint boundary", () => {
    const big = "a".repeat(3000);
    const out = truncateForEvent(big, 100);
    assert.ok(out.startsWith("a".repeat(100)));
    assert.ok(out.includes("…(+"));
  });

  it("truncates CJK at codepoint boundary without surrogate mangling", () => {
    const chinese = "中".repeat(3000);
    const out = truncateForEvent(chinese, 50);
    assert.equal(Array.from(out).slice(0, 50).join(""), "中".repeat(50));
    assert.ok(out.includes("…"));
  });

  it("preserves surrogate pairs for emoji", () => {
    const emoji = "🎯".repeat(10);
    const out = truncateForEvent(emoji, 3);
    assert.ok(out.startsWith("🎯🎯🎯"));
    assert.ok(!out.includes("\uD83C\uD83C"));
  });

  it("passes non-strings through unchanged", () => {
    assert.equal(truncateForEvent(null), null);
    assert.equal(truncateForEvent(undefined), undefined);
    assert.equal(truncateForEvent(42), 42);
    assert.deepEqual(truncateForEvent({ a: 1 }), { a: 1 });
  });
});

describe("rotateIfLarge", () => {
  it("does not rotate when file is missing or small", () => {
    const dir = freshDir();
    const r1 = rotateIfLarge(dir);
    assert.equal(r1.rotated, false);
    appendEvent(dir, "gate.run", { gate: "lint", passed: true });
    const r2 = rotateIfLarge(dir);
    assert.equal(r2.rotated, false);
  });

  it("rotates when line count exceeds threshold", () => {
    const dir = freshDir();
    const path = join(dir, EVENTS_FILE);
    writeFileSync(path, "");
    const line = JSON.stringify({ ts: "t", id: "x", type: "gate.run", data: {} }) + "\n";
    // 60 bytes per line × 50 lines = 3000 bytes > 50*10 = 500 prefilter
    for (let i = 0; i < 50; i++) appendFileSync(path, line);
    const result = rotateIfLarge(dir, 40);
    assert.equal(result.rotated, true);
    assert.ok(!existsSync(path));
    assert.ok(existsSync(join(dir, EVENTS_ROTATED)));
  });

  it("is idempotent when called repeatedly after rotation", () => {
    const dir = freshDir();
    const path = join(dir, EVENTS_FILE);
    writeFileSync(path, "");
    const line = JSON.stringify({ ts: "t", id: "x", type: "gate.run", data: {} }) + "\n";
    for (let i = 0; i < 50; i++) appendFileSync(path, line);
    rotateIfLarge(dir, 40);
    const r2 = rotateIfLarge(dir, 40);
    assert.equal(r2.ok, true);
  });
});

describe("appendEvent + runCheck integration (埋点存在性)", () => {
  it("records gate.run and check.summary events on runCheck", async () => {
    const dir = freshDir();
    // runCheck doesn't have a built-in unknown gate, so feed an unknown one
    // to avoid actually spawning eslint / node --test.
    const { runCheck } = await import("../../src/engine/check.js");
    const result = runCheck(dir, ["unknown-gate-xyz"]);
    assert.equal(result.ok, false);
    const events = readEventsForTest(dir);
    const gateRuns = events.filter((e) => e.type === "gate.run");
    const summaries = events.filter((e) => e.type === "check.summary");
    assert.equal(gateRuns.length, 1);
    assert.equal(gateRuns[0].data.gate, "unknown-gate-xyz");
    assert.equal(gateRuns[0].data.passed, false);
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].data.ok, false);
    assert.deepEqual(summaries[0].data.failed, ["unknown-gate-xyz"]);
  });
});
