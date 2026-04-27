import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createDefaultConfig } from "../../src/adapters/config-schema.js";

describe("createDefaultConfig()", () => {
  it("returns an object with version 1", () => {
    const cfg = createDefaultConfig();
    assert.equal(cfg.version, 1);
  });

  it("environment fields exist with correct defaults", () => {
    const cfg = createDefaultConfig();
    assert.equal(cfg.environment.project, null);
    assert.deepEqual(cfg.environment.aiTools, []);
    assert.deepEqual(cfg.environment.mcpServers, []);
    assert.deepEqual(cfg.environment.skills, []);
  });

  it("rules has all 5 rules enabled, none disabled", () => {
    const cfg = createDefaultConfig();
    assert.deepEqual(cfg.rules.enabled, [
      "investigate-first",
      "contradiction-analysis",
      "concentrate-force",
      "practice-test",
      "summarize",
    ]);
    assert.deepEqual(cfg.rules.disabled, []);
  });

  it("conflicts has default values", () => {
    const cfg = createDefaultConfig();
    assert.equal(cfg.conflicts.checked, false);
    assert.deepEqual(cfg.conflicts.resolved, []);
    assert.deepEqual(cfg.conflicts.warnings, []);
  });

  it("generatedAt is a date string", () => {
    const cfg = createDefaultConfig();
    assert.equal(typeof cfg.generatedAt, "string");
    assert.ok(!isNaN(Date.parse(cfg.generatedAt)), "generatedAt should be a valid ISO date string");
  });

  it("confidenceGate has default values", () => {
    const cfg = createDefaultConfig();
    assert.equal(cfg.confidenceGate.enabled, true);
    assert.equal(cfg.confidenceGate.threshold, 6);
  });
});
