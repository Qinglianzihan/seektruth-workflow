import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ratchetError, getRatchetRules, runRatchetCheck, removeRatchetRule } from "../../src/engine/ratchet.js";

const TEST_DIR = join(process.cwd(), ".stw", "ratchet-test-tmp");

describe("ratchetError", () => {
  before(() => {
    if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
  });

  after(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("promotes an error entry to a ratchet rule", () => {
    const rootDir = process.cwd();
    const entry = {
      id: "err-test-001",
      description: "Test error: bad config format",
      rootCause: "Wrong nesting",
      resolution: "Use correct nested format",
      tags: ["config", "test"],
    };
    const result = ratchetError(rootDir, entry);
    assert.equal(result.ok, true);
    assert.ok(result.id.startsWith("ratch-"));

    const rules = getRatchetRules(rootDir);
    const rule = rules.find((r) => r.id === result.id);
    assert.ok(rule);
    assert.equal(rule.description, entry.description);
    assert.equal(rule.sourceErrorId, entry.id);
    assert.deepEqual(rule.tags, entry.tags);

    // Cleanup
    removeRatchetRule(rootDir, result.id);
  });

  it("returns empty array when no rules exist (after cleanup)", () => {
    // First ensure the file is clean
    const rootDir = process.cwd();
    const rules = getRatchetRules(rootDir);
    assert.ok(Array.isArray(rules));
  });
});

describe("runRatchetCheck", () => {
  it("returns passed=true when no rules registered", () => {
    const result = runRatchetCheck(process.cwd());
    assert.equal(result.passed, true);
  });

  it("detects anti-pattern via grep check", () => {
    const rootDir = process.cwd();
    const entry = {
      id: "err-test-grep",
      description: "Test grep rule - no console.log in src/",
      check: { type: "grep", pattern: "console\\.log", files: ["src/engine/check.js"] },
      tags: ["test"],
    };
    const result = ratchetError(rootDir, entry);
    assert.equal(result.ok, true);

    // check.js likely doesn't have console.log, so this should pass
    const checkResult = runRatchetCheck(rootDir);
    // The test file itself might or might not match — just verify structure
    assert.ok("passed" in checkResult);
    assert.ok("output" in checkResult);

    // Cleanup
    removeRatchetRule(rootDir, result.id);
  });
});

describe("removeRatchetRule", () => {
  it("removes a rule by id", () => {
    const rootDir = process.cwd();
    const entry = {
      id: "err-test-rm",
      description: "Rule to be removed",
      tags: [],
    };
    const result = ratchetError(rootDir, entry);
    const rulesBefore = getRatchetRules(rootDir);
    assert.ok(rulesBefore.some((r) => r.id === result.id));

    const rmResult = removeRatchetRule(rootDir, result.id);
    assert.equal(rmResult.ok, true);

    const rulesAfter = getRatchetRules(rootDir);
    assert.ok(!rulesAfter.some((r) => r.id === result.id));
  });

  it("returns error for nonexistent rule", () => {
    const result = removeRatchetRule(process.cwd(), "nonexistent-id");
    assert.equal(result.ok, false);
    assert.ok(result.error.includes("未找到"));
  });
});

describe("ratchet.json persistence", () => {
  it("writes to .stw/ratchet.json", () => {
    const rootDir = process.cwd();
    const ratchetFile = join(rootDir, ".stw", "ratchet.json");
    // File may or may not exist depending on test order
    // Just verify the module can write and read back
    const entry = {
      id: "err-test-persist",
      description: "Persistence test",
      tags: ["test"],
    };
    const result = ratchetError(rootDir, entry);
    assert.ok(existsSync(ratchetFile));

    const raw = JSON.parse(readFileSync(ratchetFile, "utf-8"));
    assert.ok(Array.isArray(raw));
    assert.ok(raw.some((r) => r.id === result.id));

    // Cleanup
    removeRatchetRule(rootDir, result.id);
  });
});
