import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runHook } from "../../src/engine/hook.js";
import { freshDir, writeStwFile } from "../test-helper.js";

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
