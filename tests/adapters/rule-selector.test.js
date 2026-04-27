import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectRules, listAllRules } from "../../src/adapters/rule-selector.js";

describe("Rule Selector", () => {
  it("enables all rules for Node.js projects", () => {
    const env = { project: { type: "Node.js" }, aiTools: [] };
    const { enabled, disabled } = selectRules(env);
    assert.ok(enabled.includes("investigate-first"));
    assert.ok(enabled.includes("practice-test"));
    assert.equal(disabled.length, 0);
  });

  it("disables concentrate-force for Unknown project type", () => {
    const env = { project: { type: "Unknown" }, aiTools: [] };
    const { enabled, disabled } = selectRules(env);
    assert.equal(enabled.includes("concentrate-force"), false);
    assert.ok(disabled.some((d) => d.id === "concentrate-force"));
  });

  it("lists all rules", () => {
    const rules = listAllRules();
    assert.equal(rules.length, 5);
    assert.ok(rules.find((r) => r.id === "summarize"));
  });

  it("handles missing project info gracefully", () => {
    const env = { aiTools: [] };
    const { disabled } = selectRules(env);
    assert.ok(disabled.some((d) => d.id === "concentrate-force"));
  });
});
