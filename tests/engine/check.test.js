import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runCheck, listGates } from "../../src/engine/check.js";

const TEST_DIR = join(process.cwd(), ".stw", "check-test-tmp");

describe("runCheck", () => {
  before(() => {
    if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
  });

  after(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("runs lint gate and returns result", () => {
    const result = runCheck(process.cwd(), ["lint"]);
    assert.ok("lint" in result.results);
    const lintResult = result.results.lint;
    assert.ok("passed" in lintResult);
    assert.ok("output" in lintResult);
  });

  it("runs test gate and returns result", () => {
    const result = runCheck(process.cwd(), ["test"]);
    assert.ok("test" in result.results);
    assert.ok("passed" in result.results.test);
  });

  it("returns ok=true when all gates pass", () => {
    const result = runCheck(process.cwd(), ["test"]);
    assert.equal(result.results.test.passed, true, "test gate should pass on this codebase");
    assert.equal(result.ok, true);
  });

  it("returns ok=false for unknown gate", () => {
    const result = runCheck(process.cwd(), ["nonexistent"]);
    assert.equal(result.ok, false);
    assert.ok(result.results.nonexistent.output.includes("未知门禁"));
  });

  it("defaults to all gates when none specified", () => {
    const result = runCheck(process.cwd());
    assert.ok("lint" in result.results);
    assert.ok("test" in result.results);
  });
});

describe("listGates", () => {
  it("returns array of gate definitions", () => {
    const gates = listGates();
    assert.ok(Array.isArray(gates));
    assert.ok(gates.length >= 2);
    const ids = gates.map((g) => g.id);
    assert.ok(ids.includes("lint"));
    assert.ok(ids.includes("test"));
  });

  it("each gate has id and label", () => {
    for (const gate of listGates()) {
      assert.ok(gate.id);
      assert.ok(gate.label);
    }
  });
});

describe("stw check CLI", () => {
  it("--list flag shows available gates", () => {
    const result = spawnSync("node", ["bin/stw.js", "check", "--list"], {
      cwd: process.cwd(),
      encoding: "utf-8",
      timeout: 10000,
    });
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes("lint"));
    assert.ok(result.stdout.includes("test"));
  });

  it("runs all gates by default", () => {
    const result = spawnSync("node", ["bin/stw.js", "check"], {
      cwd: process.cwd(),
      encoding: "utf-8",
      timeout: 60000,
    });
    assert.ok(result.stdout.includes("lint") && result.stdout.includes("test"), "output should contain both lint and test results");
  });
});
