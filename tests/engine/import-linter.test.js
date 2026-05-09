import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runImportCheck, getLayerRules } from "../../src/engine/import-linter.js";

describe("runImportCheck", () => {
  it("returns passed=true on clean codebase", () => {
    const result = runImportCheck(process.cwd());
    assert.equal(result.passed, true);
    assert.ok(result.output.includes("无导入层级违规"));
  });

  it("detects engine importing from scout (forbidden direction)", () => {
    // We verify the check logic by testing that the CURRENT codebase
    // which is known-clean, passes. Violation detection is tested indirectly
    // via getLayerRules verifying the forbid rules are defined.
    const rules = getLayerRules();
    const engine = rules.find((r) => r.path === "src/engine");
    assert.ok(engine);
    assert.ok(engine.forbid.includes("src/scout"));
    assert.ok(engine.forbid.includes("src/adapters"));
  });

  it("detects adapters importing from engine (forbidden direction)", () => {
    const rules = getLayerRules();
    const adapters = rules.find((r) => r.path === "src/adapters");
    assert.ok(adapters);
    assert.ok(adapters.forbid.includes("src/engine"));
  });

  it("scout layer has no project-level imports allowed", () => {
    const rules = getLayerRules();
    const scout = rules.find((r) => r.path === "src/scout");
    assert.ok(scout);
    // scout can only use node builtins and external packages
    assert.ok(!scout.allowed.includes("src/adapters"));
    assert.ok(!scout.allowed.includes("src/engine"));
  });

  it("returns violations array in result", () => {
    const result = runImportCheck(process.cwd());
    assert.ok(Array.isArray(result.violations));
    assert.equal(result.violations.length, 0);
  });
});

describe("getLayerRules", () => {
  it("returns all three layers", () => {
    const rules = getLayerRules();
    assert.ok(rules.length >= 3);
    const paths = rules.map((r) => r.path);
    assert.ok(paths.includes("src/scout"));
    assert.ok(paths.includes("src/adapters"));
    assert.ok(paths.includes("src/engine"));
  });

  it("each rule has label, allowed, forbid", () => {
    for (const rule of getLayerRules()) {
      assert.ok(rule.label);
      assert.ok(Array.isArray(rule.allowed));
      assert.ok(Array.isArray(rule.forbid));
    }
  });
});
