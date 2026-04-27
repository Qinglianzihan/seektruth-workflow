import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { writeStwFiles } from "../../src/adapters/file-writer.js";
import { freshDir, writeFile } from "../test-helper.js";

const EMPTY_ENV = { project: null, aiTools: [], mcpConfigs: [], skills: [] };
const EMPTY_CONFLICTS = { checked: false, resolved: [], warnings: [] };

describe("File Writer — basic output", () => {
  it("creates .stw directory and returns path", () => {
    const dir = freshDir();
    const stwDir = writeStwFiles(dir, EMPTY_ENV, EMPTY_CONFLICTS);
    assert.ok(stwDir.endsWith(".stw"));
    assert.ok(existsSync(stwDir));
  });

  it("creates all expected output files", () => {
    const dir = freshDir();
    writeStwFiles(dir, EMPTY_ENV, EMPTY_CONFLICTS);
    const expected = [
      "config.json",
      "STW-Workspace.md",
      "Analysis-Template.md",
      "Summary-Template.md",
    ];
    for (const name of expected) {
      assert.ok(existsSync(join(dir, ".stw", name)), `missing: ${name}`);
    }
  });

  it("creates reports directory with .gitkeep", () => {
    const dir = freshDir();
    writeStwFiles(dir, EMPTY_ENV, EMPTY_CONFLICTS);
    assert.ok(existsSync(join(dir, ".stw", "reports", ".gitkeep")));
  });

  it("config.json is valid JSON with expected fields", () => {
    const dir = freshDir();
    writeStwFiles(dir, EMPTY_ENV, EMPTY_CONFLICTS);
    const cfg = JSON.parse(readFileSync(join(dir, ".stw", "config.json"), "utf-8"));
    assert.equal(cfg.version, 1);
    assert.ok("environment" in cfg);
    assert.ok("rules" in cfg);
    assert.ok("conflicts" in cfg);
    assert.ok("confidenceGate" in cfg);
    assert.equal(cfg.confidenceGate.threshold, 6);
  });
});

describe("File Writer — template substitution", () => {
  const populatedEnv = {
    project: { type: "node-web-app", language: "JavaScript" },
    aiTools: [{ name: "Claude Code", version: "1.0", source: "test" }],
    mcpConfigs: [{ source: "test", servers: ["memory", "context7"] }],
    skills: [{ name: "code-reviewer", description: "Reviews code diffs", source: "test" }],
  };

  it("injects AI tool name into workspace", () => {
    const dir = freshDir();
    writeStwFiles(dir, populatedEnv, EMPTY_CONFLICTS);
    const ws = readFileSync(join(dir, ".stw", "STW-Workspace.md"), "utf-8");
    assert.ok(ws.includes("Claude Code"));
  });

  it("injects project type into workspace", () => {
    const dir = freshDir();
    writeStwFiles(dir, populatedEnv, EMPTY_CONFLICTS);
    const ws = readFileSync(join(dir, ".stw", "STW-Workspace.md"), "utf-8");
    assert.ok(ws.includes("node-web-app"));
  });

  it("injects MCP server names into workspace", () => {
    const dir = freshDir();
    writeStwFiles(dir, populatedEnv, EMPTY_CONFLICTS);
    const ws = readFileSync(join(dir, ".stw", "STW-Workspace.md"), "utf-8");
    assert.ok(ws.includes("memory"));
    assert.ok(ws.includes("context7"));
  });

  it("injects date into analysis and summary templates", () => {
    const dir = freshDir();
    writeStwFiles(dir, populatedEnv, EMPTY_CONFLICTS);
    const analysis = readFileSync(join(dir, ".stw", "Analysis-Template.md"), "utf-8");
    const summary = readFileSync(join(dir, ".stw", "Summary-Template.md"), "utf-8");
    const today = new Date().toISOString().slice(0, 10);
    assert.ok(analysis.includes(today));
    assert.ok(summary.includes(today));
  });

  it("no leftover placeholders in workspace", () => {
    const dir = freshDir();
    writeStwFiles(dir, populatedEnv, EMPTY_CONFLICTS);
    const ws = readFileSync(join(dir, ".stw", "STW-Workspace.md"), "utf-8");
    assert.ok(!ws.includes("{{"), "contains unresolved placeholder");
  });
});

describe("File Writer — edge cases", () => {
  it("empty environment produces valid output", () => {
    const dir = freshDir();
    writeStwFiles(dir, EMPTY_ENV, EMPTY_CONFLICTS);
    const ws = readFileSync(join(dir, ".stw", "STW-Workspace.md"), "utf-8");
    assert.ok(ws.includes("未检测到 AI 编程工具") || ws.includes("AI 工具"));
  });

  it("project type 'Unknown' when null", () => {
    const dir = freshDir();
    writeStwFiles(dir, EMPTY_ENV, EMPTY_CONFLICTS);
    const ws = readFileSync(join(dir, ".stw", "STW-Workspace.md"), "utf-8");
    assert.ok(ws.includes("Unknown"));
  });

  it("conflict warnings appear in workspace when present", () => {
    const dir = freshDir();
    const conflicts = {
      checked: true,
      resolved: [],
      warnings: [
        { message: "Skill A conflicts with Skill B", suggestion: "Use only one" },
      ],
    };
    writeStwFiles(dir, EMPTY_ENV, conflicts);
    const ws = readFileSync(join(dir, ".stw", "STW-Workspace.md"), "utf-8");
    assert.ok(ws.includes("Skill A conflicts with Skill B"));
  });
});
