import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runHook } from "../../src/engine/hook.js";
import { freshDir, writeStwFile, readEventsForTest } from "../test-helper.js";

const PASS_LINT = () => ({ ok: true, results: { lint: { passed: true, output: "" } } });
const FAIL_LINT = () => ({
  ok: false,
  results: { lint: { passed: false, output: "src/foo.js:1:1  error  No semicolon  semi" } },
});
const PASS_BOUNDS = () => ({ ok: true, violations: [], totalFiles: 0, zones: ["src/a.js"] });
const FAIL_BOUNDS = () => ({
  ok: false,
  violations: ["src/forbidden.js"],
  totalFiles: 1,
  zones: ["src/allowed.js"],
});
const BOUNDS_ERROR = () => ({ ok: false, violations: [], totalFiles: 0, error: "未声明 ATTACK_ZONE" });

function withProgress(dir, phase) {
  writeStwFile(dir, ".progress.json", JSON.stringify({
    phase,
    startedAt: new Date().toISOString(),
    completedPhases: [],
    iterations: [],
    taskDescription: "test",
  }, null, 2));
}

describe("runHook — protocol", () => {
  it("exits 0 silently when no .stw/.progress.json exists", () => {
    const dir = freshDir();
    const result = runHook(
      { rootDir: dir },
      { lintRunner: () => { throw new Error("should not run"); } }
    );
    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
  });

  it("exits 0 silently when lint passes and phase < 3", () => {
    const dir = freshDir();
    withProgress(dir, 1);
    const result = runHook(
      { rootDir: dir },
      { lintRunner: PASS_LINT, boundsRunner: () => { throw new Error("bounds should not run"); } }
    );
    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
  });

  it("exits 2 with lint diagnostic when lint fails", () => {
    const dir = freshDir();
    withProgress(dir, 2);
    const result = runHook({ rootDir: dir }, { lintRunner: FAIL_LINT });
    assert.equal(result.exitCode, 2);
    assert.ok(result.stderr.includes("lint 未通过"));
    assert.ok(result.stderr.includes("No semicolon"));
    assert.ok(result.stderr.includes("(event: PostToolUse)"));
  });

  it("passes event label through to stderr trailer", () => {
    const dir = freshDir();
    withProgress(dir, 1);
    const result = runHook({ rootDir: dir, event: "UserPromptSubmit" }, { lintRunner: FAIL_LINT });
    assert.ok(result.stderr.includes("(event: UserPromptSubmit)"));
  });
});

describe("runHook — phase-aware bounds check", () => {
  it("skips bounds check when phase < 3", () => {
    const dir = freshDir();
    withProgress(dir, 2);
    let boundsCalled = false;
    const result = runHook(
      { rootDir: dir },
      { lintRunner: PASS_LINT, boundsRunner: () => { boundsCalled = true; return PASS_BOUNDS(); } }
    );
    assert.equal(boundsCalled, false);
    assert.equal(result.exitCode, 0);
  });

  it("runs bounds check when phase >= 3 and exits 2 on violations", () => {
    const dir = freshDir();
    withProgress(dir, 3);
    const result = runHook(
      { rootDir: dir },
      { lintRunner: PASS_LINT, boundsRunner: FAIL_BOUNDS }
    );
    assert.equal(result.exitCode, 2);
    assert.ok(result.stderr.includes("src/forbidden.js"));
    assert.ok(result.stderr.includes("ATTACK_ZONE"));
  });

  it("runs bounds check in phase 4 as well", () => {
    const dir = freshDir();
    withProgress(dir, 4);
    let boundsCalled = false;
    const result = runHook(
      { rootDir: dir },
      {
        lintRunner: PASS_LINT,
        boundsRunner: () => { boundsCalled = true; return PASS_BOUNDS(); },
      }
    );
    assert.equal(boundsCalled, true);
    assert.equal(result.exitCode, 0);
  });

  it("surfaces bounds runner error message", () => {
    const dir = freshDir();
    withProgress(dir, 3);
    const result = runHook(
      { rootDir: dir },
      { lintRunner: PASS_LINT, boundsRunner: BOUNDS_ERROR }
    );
    assert.equal(result.exitCode, 2);
    assert.ok(result.stderr.includes("未声明 ATTACK_ZONE"));
  });

  it("accumulates both lint and bounds failures", () => {
    const dir = freshDir();
    withProgress(dir, 3);
    const result = runHook(
      { rootDir: dir },
      { lintRunner: FAIL_LINT, boundsRunner: FAIL_BOUNDS }
    );
    assert.equal(result.exitCode, 2);
    assert.ok(result.stderr.includes("lint 未通过"));
    assert.ok(result.stderr.includes("src/forbidden.js"));
  });
});

describe("runHook — resilience", () => {
  it("catches lint runner throw and surfaces it as a failure", () => {
    const dir = freshDir();
    withProgress(dir, 1);
    const result = runHook(
      { rootDir: dir },
      { lintRunner: () => { throw new Error("eslint missing"); } }
    );
    assert.equal(result.exitCode, 2);
    assert.ok(result.stderr.includes("lint 执行出错"));
    assert.ok(result.stderr.includes("eslint missing"));
  });

  it("catches bounds runner throw", () => {
    const dir = freshDir();
    withProgress(dir, 3);
    const result = runHook(
      { rootDir: dir },
      {
        lintRunner: PASS_LINT,
        boundsRunner: () => { throw new Error("git unavailable"); },
      }
    );
    assert.equal(result.exitCode, 2);
    assert.ok(result.stderr.includes("范围检查执行出错"));
    assert.ok(result.stderr.includes("git unavailable"));
  });
});

describe("runHook — events instrumentation", () => {
  it("emits a hook.run event with exitCode=0 on success", () => {
    const dir = freshDir();
    withProgress(dir, 1);
    runHook({ rootDir: dir }, { lintRunner: PASS_LINT });
    const events = readEventsForTest(dir);
    const hook = events.find((e) => e.type === "hook.run");
    assert.ok(hook, "expected hook.run event");
    assert.equal(hook.data.exitCode, 0);
    assert.equal(hook.data.failureCount, 0);
    assert.equal(hook.data.event, "PostToolUse");
  });

  it("emits a hook.run event with failures[] on lint failure", () => {
    const dir = freshDir();
    withProgress(dir, 2);
    runHook({ rootDir: dir, event: "UserPromptSubmit" }, { lintRunner: FAIL_LINT });
    const events = readEventsForTest(dir);
    const hook = events.find((e) => e.type === "hook.run");
    assert.ok(hook);
    assert.equal(hook.data.exitCode, 2);
    assert.equal(hook.data.failureCount, 1);
    assert.equal(hook.data.event, "UserPromptSubmit");
    assert.ok(Array.isArray(hook.data.failures));
    assert.ok(hook.data.failures[0].includes("lint 未通过"));
  });

  it("does not emit events when no .stw/.progress.json (silent early return)", () => {
    const dir = freshDir();
    runHook({ rootDir: dir }, { lintRunner: () => { throw new Error("n/a"); } });
    const events = readEventsForTest(dir);
    assert.equal(events.length, 0);
  });
});

describe("runHook — T16 loop detection", () => {
  const EDIT_PAYLOAD = (filePath) => JSON.stringify({
    tool_name: "Edit",
    tool_input: { file_path: filePath, old_string: "a", new_string: "b" },
  });

  it("does not affect existing path when stdinPayload empty", () => {
    const dir = freshDir();
    withProgress(dir, 1);
    const result = runHook(
      { rootDir: dir, stdinPayload: "" },
      { lintRunner: PASS_LINT },
    );
    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
    const events = readEventsForTest(dir);
    assert.equal(events.filter((e) => e.type === "hook.loop-detected").length, 0);
  });

  it("records filePath on hook.run when stdin payload is an Edit call", () => {
    const dir = freshDir();
    withProgress(dir, 1);
    runHook(
      { rootDir: dir, stdinPayload: EDIT_PAYLOAD("/abs/foo.js") },
      { lintRunner: PASS_LINT, eventsReader: () => [] },
    );
    const events = readEventsForTest(dir);
    const hook = events.find((e) => e.type === "hook.run");
    assert.ok(hook);
    assert.equal(hook.data.filePath, "/abs/foo.js");
  });

  it("emits hook.loop-detected and stderr warning when threshold reached", () => {
    const dir = freshDir();
    withProgress(dir, 1);
    // Simulate 2 prior consecutive edits of the same file — this 3rd call
    // will be appended as hook.run (bringing count to 3) and trigger warn.
    const priorEvents = [
      { type: "hook.run", task: "test", data: { filePath: "/abs/foo.js" } },
      { type: "hook.run", task: "test", data: { filePath: "/abs/foo.js" } },
    ];
    const result = runHook(
      { rootDir: dir, stdinPayload: EDIT_PAYLOAD("/abs/foo.js") },
      {
        lintRunner: PASS_LINT,
        // eventsReader returns prior events plus the just-appended one
        eventsReader: (d) => [
          ...priorEvents,
          ...readEventsForTest(d).filter((e) => e.type === "hook.run"),
        ],
      },
    );
    assert.equal(result.exitCode, 2);
    assert.ok(result.stderr.includes("连续 3 次编辑同一文件"));
    assert.ok(result.stderr.includes("/abs/foo.js"));
    assert.ok(result.stderr.includes("《实践论》"));
    const events = readEventsForTest(dir);
    const loopEvent = events.find((e) => e.type === "hook.loop-detected");
    assert.ok(loopEvent, "expected hook.loop-detected event");
    assert.equal(loopEvent.data.filePath, "/abs/foo.js");
    assert.equal(loopEvent.data.count, 3);
    assert.equal(loopEvent.data.threshold, 3);
  });

  it("does not warn when a different file breaks continuity", () => {
    const dir = freshDir();
    withProgress(dir, 1);
    const priorEvents = [
      { type: "hook.run", task: "test", data: { filePath: "/abs/foo.js" } },
      { type: "hook.run", task: "test", data: { filePath: "/abs/bar.js" } },
      { type: "hook.run", task: "test", data: { filePath: "/abs/foo.js" } },
    ];
    const result = runHook(
      { rootDir: dir, stdinPayload: EDIT_PAYLOAD("/abs/foo.js") },
      {
        lintRunner: PASS_LINT,
        eventsReader: (d) => [
          ...priorEvents,
          ...readEventsForTest(d).filter((e) => e.type === "hook.run"),
        ],
      },
    );
    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
    const events = readEventsForTest(dir);
    assert.equal(events.filter((e) => e.type === "hook.loop-detected").length, 0);
  });

  it("honors custom threshold via deps.loopThreshold", () => {
    const dir = freshDir();
    withProgress(dir, 1);
    const priorEvents = [
      { type: "hook.run", task: "test", data: { filePath: "/abs/foo.js" } },
    ];
    const result = runHook(
      { rootDir: dir, stdinPayload: EDIT_PAYLOAD("/abs/foo.js") },
      {
        lintRunner: PASS_LINT,
        loopThreshold: 2,
        eventsReader: (d) => [
          ...priorEvents,
          ...readEventsForTest(d).filter((e) => e.type === "hook.run"),
        ],
      },
    );
    assert.equal(result.exitCode, 2);
    assert.ok(result.stderr.includes("连续 2 次编辑"));
  });

  it("accumulates loop warning alongside lint failure", () => {
    const dir = freshDir();
    withProgress(dir, 1);
    const priorEvents = [
      { type: "hook.run", task: "test", data: { filePath: "/abs/foo.js" } },
      { type: "hook.run", task: "test", data: { filePath: "/abs/foo.js" } },
    ];
    const result = runHook(
      { rootDir: dir, stdinPayload: EDIT_PAYLOAD("/abs/foo.js") },
      {
        lintRunner: FAIL_LINT,
        eventsReader: (d) => [
          ...priorEvents,
          ...readEventsForTest(d).filter((e) => e.type === "hook.run"),
        ],
      },
    );
    assert.equal(result.exitCode, 2);
    assert.ok(result.stderr.includes("lint 未通过"));
    assert.ok(result.stderr.includes("连续 3 次编辑"));
  });

  it("non-edit tool payload (Bash) takes non-loop path", () => {
    const dir = freshDir();
    withProgress(dir, 1);
    const bashPayload = JSON.stringify({
      tool_name: "Bash",
      tool_input: { command: "ls" },
    });
    const result = runHook(
      { rootDir: dir, stdinPayload: bashPayload },
      { lintRunner: PASS_LINT },
    );
    assert.equal(result.exitCode, 0);
    const events = readEventsForTest(dir);
    const hook = events.find((e) => e.type === "hook.run");
    assert.ok(hook);
    assert.equal(hook.data.filePath, undefined);
  });
});
