import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectAiTools, getClaudeConfigPath } from "../../src/scout/ai-tool-detector.js";

describe("AI Tool Detector — detectAiTools", () => {
  it("returns an array", () => {
    const tools = detectAiTools();
    assert.ok(Array.isArray(tools));
  });

  it("returned items have name and source fields", () => {
    const tools = detectAiTools();
    for (const t of tools) {
      assert.equal(typeof t.name, "string");
      assert.ok(t.name.length > 0);
      assert.equal(typeof t.source, "string");
      assert.ok(t.source.length > 0);
    }
  });
});

describe("AI Tool Detector — getClaudeConfigPath", () => {
  it("returns null or a string path", () => {
    const result = getClaudeConfigPath();
    assert.ok(result === null || typeof result === "string");
  });
});
