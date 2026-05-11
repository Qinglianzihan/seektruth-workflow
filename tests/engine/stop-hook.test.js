import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runStopHook } from "../../src/engine/stop-hook.js";
import { freshDir, writeStwFile, readEventsForTest } from "../test-helper.js";

function withProgress(dir, phase, taskDescription = "test task") {
  writeStwFile(dir, ".progress.json", JSON.stringify({
    phase,
    startedAt: new Date().toISOString(),
    completedPhases: [],
    iterations: [],
    taskDescription,
  }, null, 2));
}

const PHASE_READER = (phase, taskDescription = "test") => () => ({
  phase,
  phaseInfo: null,
  startedAt: new Date().toISOString(),
  completedPhases: [],
  iterations: [],
  taskDescription,
});

describe("runStopHook — protocol", () => {
  it("exits 0 silently when no .stw/.progress.json exists", () => {
    const dir = freshDir();
    const result = runStopHook(
      { rootDir: dir },
      { phaseReader: () => { throw new Error("should not read phase"); } }
    );
    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
  });

  it("exits 0 when stop_hook_active=true (防无限循环)", () => {
    const dir = freshDir();
    withProgress(dir, 2);
    const result = runStopHook(
      { rootDir: dir, stdinPayload: JSON.stringify({ stop_hook_active: true }) },
      { phaseReader: () => { throw new Error("should not read phase"); } }
    );
    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
  });
});

describe("runStopHook — phase gating (whitelist 1-4)", () => {
  for (const phase of [1, 2, 3, 4]) {
    it(`exits 2 with 回到阶段 stderr when phase=${phase} and stop_hook_active=false`, () => {
      const dir = freshDir();
      withProgress(dir, phase);
      const result = runStopHook(
        { rootDir: dir, stdinPayload: "{}" },
        { phaseReader: PHASE_READER(phase, "my task") }
      );
      assert.equal(result.exitCode, 2);
      assert.ok(result.stderr.includes(`阶段 ${phase}`), `expected 阶段 ${phase} in stderr`);
      assert.ok(result.stderr.includes("(event: Stop)"));
      assert.ok(result.stderr.includes("任务尚未完成"));
    });
  }

  it("exits 0 when phase=5 (all phases passed, session.complete imminent)", () => {
    const dir = freshDir();
    withProgress(dir, 5);
    const result = runStopHook(
      { rootDir: dir, stdinPayload: "{}" },
      { phaseReader: PHASE_READER(5) }
    );
    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
  });

  it('exits 0 when phase is the string "complete"', () => {
    const dir = freshDir();
    withProgress(dir, "complete");
    const result = runStopHook(
      { rootDir: dir, stdinPayload: "{}" },
      { phaseReader: PHASE_READER("complete") }
    );
    assert.equal(result.exitCode, 0);
  });

  it("exits 0 when phase is an unexpected/bogus value (defensive)", () => {
    const dir = freshDir();
    withProgress(dir, 99);
    const result = runStopHook(
      { rootDir: dir, stdinPayload: "{}" },
      { phaseReader: PHASE_READER(99) }
    );
    assert.equal(result.exitCode, 0);
  });
});

describe("runStopHook — stdin parsing (fail-open)", () => {
  it("treats empty stdin as first-trigger (blocks)", () => {
    const dir = freshDir();
    withProgress(dir, 1);
    const result = runStopHook(
      { rootDir: dir, stdinPayload: "" },
      { phaseReader: PHASE_READER(1) }
    );
    assert.equal(result.exitCode, 2);
  });

  it("treats non-JSON stdin as first-trigger (blocks)", () => {
    const dir = freshDir();
    withProgress(dir, 1);
    const result = runStopHook(
      { rootDir: dir, stdinPayload: "not { json at all" },
      { phaseReader: PHASE_READER(1) }
    );
    assert.equal(result.exitCode, 2);
  });

  it("treats JSON without stop_hook_active field as first-trigger", () => {
    const dir = freshDir();
    withProgress(dir, 3);
    const result = runStopHook(
      { rootDir: dir, stdinPayload: JSON.stringify({ some_other_field: "x" }) },
      { phaseReader: PHASE_READER(3) }
    );
    assert.equal(result.exitCode, 2);
  });

  it("treats stop_hook_active=false literal as first-trigger", () => {
    const dir = freshDir();
    withProgress(dir, 2);
    const result = runStopHook(
      { rootDir: dir, stdinPayload: JSON.stringify({ stop_hook_active: false }) },
      { phaseReader: PHASE_READER(2) }
    );
    assert.equal(result.exitCode, 2);
  });
});

describe("runStopHook — events instrumentation", () => {
  it("emits stop-hook.run exitCode=2 when blocking", () => {
    const dir = freshDir();
    withProgress(dir, 3, "some task");
    runStopHook(
      { rootDir: dir, stdinPayload: "{}" },
      { phaseReader: PHASE_READER(3, "some task") }
    );
    const events = readEventsForTest(dir);
    const ev = events.find((e) => e.type === "stop-hook.run");
    assert.ok(ev, "expected stop-hook.run event");
    assert.equal(ev.data.exitCode, 2);
    assert.equal(ev.data.phase, 3);
  });

  it("emits stop-hook.run exitCode=0 with reason=stop_hook_active", () => {
    const dir = freshDir();
    withProgress(dir, 2);
    runStopHook(
      { rootDir: dir, stdinPayload: JSON.stringify({ stop_hook_active: true }) },
      { phaseReader: PHASE_READER(2) }
    );
    const events = readEventsForTest(dir);
    const ev = events.find((e) => e.type === "stop-hook.run");
    assert.ok(ev);
    assert.equal(ev.data.exitCode, 0);
    assert.equal(ev.data.reason, "stop_hook_active");
  });

  it("does NOT emit events when no .progress.json (silent early return)", () => {
    const dir = freshDir();
    runStopHook({ rootDir: dir }, {});
    const events = readEventsForTest(dir);
    assert.equal(events.length, 0);
  });
});

describe("runStopHook — integration read of .progress.json via default phaseReader", () => {
  it("reads phase from .stw/.progress.json when no DI override given", () => {
    const dir = freshDir();
    withProgress(dir, 4, "real fs read");
    const result = runStopHook({ rootDir: dir, stdinPayload: "{}" });
    assert.equal(result.exitCode, 2);
    assert.ok(result.stderr.includes("阶段 4"));
    assert.ok(result.stderr.includes("real fs read"));
  });
});
