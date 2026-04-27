import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveConflicts } from "../../src/adapters/conflict-resolver.js";

describe("resolveConflicts(skills)", () => {
  it("returns checked=true and empty warnings for empty skills array", () => {
    const result = resolveConflicts([]);
    assert.equal(result.checked, true);
    assert.deepEqual(result.resolved, []);
    assert.deepEqual(result.warnings, []);
  });

  it("generates warning for skill matching 'superpowers'", () => {
    const result = resolveConflicts([{ name: "superpowers" }]);
    assert.equal(result.checked, true);
    assert.equal(result.warnings.length, 1);
    assert.ok(result.warnings[0].message.includes("superpowers"));
  });

  it("is case-insensitive — generates warning for 'Superpowers'", () => {
    const result = resolveConflicts([{ name: "Superpowers" }]);
    assert.equal(result.warnings.length, 1);
    assert.ok(result.warnings[0].message.includes("Superpowers"));
  });

  it("generates warning for skill matching 'claude-automation-recommender'", () => {
    const result = resolveConflicts([{ name: "claude-automation-recommender" }]);
    assert.equal(result.warnings.length, 1);
    assert.ok(
      result.warnings[0].message.includes("claude-automation-recommender")
    );
  });

  it("generates multiple warnings when multiple conflicting skills are present", () => {
    const result = resolveConflicts([
      { name: "superpowers" },
      { name: "claude-automation-recommender" },
    ]);
    assert.equal(result.warnings.length, 2);
  });

  it("returns no warnings for a non-conflicting skill", () => {
    const result = resolveConflicts([{ name: "git-commit" }]);
    assert.equal(result.warnings.length, 0);
    assert.deepEqual(result.warnings, []);
  });
});
