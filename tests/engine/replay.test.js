import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  summarizeEvent,
  formatTimeline,
  findRootCause,
} from "../../src/engine/replay.js";

function evt(type, data = {}, extra = {}) {
  return {
    ts: extra.ts || "2026-05-11T00:00:00.000Z",
    id: extra.id || `id-${type}`,
    type,
    task: extra.task ?? "task-alpha",
    phase: extra.phase ?? 1,
    data,
  };
}

describe("summarizeEvent", () => {
  it("formats session.start with task snippet", () => {
    const line = summarizeEvent(evt("session.start", {}, { task: "a task" }));
    assert.ok(line.includes("session.start"));
    assert.ok(line.includes('task="a task"'));
  });

  it("formats phase.advance.denied with gate + error", () => {
    const line = summarizeEvent(evt("phase.advance.denied", {
      phase: 2,
      gate: "planner",
      error: "规划师结论为空",
    }, { phase: 2 }));
    assert.ok(line.includes("P2"));
    assert.ok(line.includes("planner"));
    assert.ok(line.includes("规划师结论为空"));
  });

  it("formats gate.confidence with score/threshold", () => {
    const line = summarizeEvent(evt("gate.confidence", {
      score: 5,
      threshold: 6,
      ok: false,
    }));
    assert.ok(line.includes("score=5/6"));
    assert.ok(line.includes("ok=false"));
  });

  it("formats gate.bounds with violation counts", () => {
    const line = summarizeEvent(evt("gate.bounds", {
      ok: false,
      violations: ["a", "b"],
      totalFiles: 3,
    }));
    assert.ok(line.includes("violations=2/3"));
  });

  it("formats hook.run with exit + failure count", () => {
    const line = summarizeEvent(evt("hook.run", {
      event: "PostToolUse",
      exitCode: 2,
      failureCount: 1,
    }));
    assert.ok(line.includes("event=PostToolUse"));
    assert.ok(line.includes("exit=2"));
    assert.ok(line.includes("failures=1"));
  });

  it("falls back to stringified data for unknown types", () => {
    const line = summarizeEvent(evt("custom.type", { foo: "bar" }));
    assert.ok(line.includes("custom.type"));
    assert.ok(line.includes("foo"));
  });

  it("handles invalid input safely", () => {
    assert.equal(summarizeEvent(null), "(invalid event)");
    assert.equal(summarizeEvent("not an object"), "(invalid event)");
  });
});

describe("formatTimeline", () => {
  it("returns placeholder for empty list", () => {
    assert.equal(formatTimeline([]), "(暂无事件)");
    assert.equal(formatTimeline(null), "(暂无事件)");
  });

  it("joins multiple events with newlines", () => {
    const out = formatTimeline([
      evt("session.start", {}, { ts: "t1" }),
      evt("gate.planner", { ok: true, conclusion: "可以推进" }, { ts: "t2" }),
      evt("phase.advance.ok", { from: 2, to: 3 }, { ts: "t3" }),
    ]);
    const lines = out.split("\n");
    assert.equal(lines.length, 3);
    assert.ok(lines[0].includes("session.start"));
    assert.ok(lines[1].includes("gate.planner"));
    assert.ok(lines[2].includes("2 → 3"));
  });
});

describe("findRootCause", () => {
  it("returns found=false on empty input", () => {
    assert.equal(findRootCause([]).found, false);
    assert.equal(findRootCause(null).found, false);
  });

  it("returns found=false when no failures present", () => {
    const events = [
      evt("session.start"),
      evt("gate.planner", { ok: true }),
      evt("phase.advance.ok", { from: 2, to: 3 }),
    ];
    const r = findRootCause(events);
    assert.equal(r.found, false);
    assert.match(r.reason, /未发现/);
  });

  it("finds the most recent phase.advance.denied and walks back same-task events", () => {
    const events = [
      evt("session.start", {}, { ts: "t1" }),
      evt("gate.confidence", { ok: true, score: 8, threshold: 6 }, { ts: "t2" }),
      evt("phase.advance.ok", { from: 1, to: 2 }, { ts: "t3" }),
      evt("gate.planner", { ok: false, conclusion: "需要调整" }, { ts: "t4" }),
      evt("phase.advance.denied", { phase: 2, gate: "planner", error: "需要调整" }, { ts: "t5" }),
    ];
    const r = findRootCause(events);
    assert.equal(r.found, true);
    assert.equal(r.failure.type, "phase.advance.denied");
    assert.equal(r.failure.data.gate, "planner");
    assert.equal(r.context.length, 4);
    assert.deepEqual(r.context.map((e) => e.type), [
      "session.start",
      "gate.confidence",
      "phase.advance.ok",
      "gate.planner",
    ]);
  });

  it("recognizes ok=false as a failure even without .denied in type", () => {
    const events = [
      evt("session.start"),
      evt("gate.reviewer", { ok: false, conclusion: "不通过" }),
    ];
    const r = findRootCause(events);
    assert.equal(r.found, true);
    assert.equal(r.failure.type, "gate.reviewer");
  });

  it("recognizes passed=false (from check.run)", () => {
    const events = [
      evt("session.start"),
      evt("gate.run", { gate: "lint", passed: false }),
    ];
    const r = findRootCause(events);
    assert.equal(r.found, true);
    assert.equal(r.failure.data.gate, "lint");
  });

  it("filters context to the same task as the failure", () => {
    const events = [
      evt("session.start", {}, { task: "task-A", ts: "t1" }),
      evt("gate.planner", { ok: true }, { task: "task-A", ts: "t2" }),
      evt("session.complete", {}, { task: "task-A", ts: "t3" }),
      evt("session.start", {}, { task: "task-B", ts: "t4" }),
      evt("gate.planner", { ok: false, conclusion: "需要调整" }, { task: "task-B", ts: "t5" }),
      evt("phase.advance.denied", { phase: 2, gate: "planner" }, { task: "task-B", ts: "t6" }),
    ];
    const r = findRootCause(events);
    assert.equal(r.found, true);
    assert.equal(r.task, "task-B");
    assert.equal(r.context.length, 2);
    assert.ok(r.context.every((e) => e.task === "task-B"));
  });

  it("respects contextLimit", () => {
    const events = Array.from({ length: 15 }, (_, i) =>
      evt("gate.run", { gate: `g${i}`, passed: true }, { ts: `t${i}` })
    );
    events.push(evt("phase.advance.denied", { phase: 2, gate: "x" }, { ts: "tend" }));
    const r = findRootCause(events, { contextLimit: 5 });
    assert.equal(r.context.length, 5);
  });
});
