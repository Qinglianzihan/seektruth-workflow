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

describe("File Writer — Claude Code integration", () => {
  const claudeEnv = {
    project: null,
    aiTools: [{ name: "Claude Code", source: "test" }],
    mcpConfigs: [],
    skills: [],
  };

  it("creates .claude/skills/stw.md when Claude Code detected", () => {
    const dir = freshDir();
    writeStwFiles(dir, claudeEnv, EMPTY_CONFLICTS);
    const skillPath = join(dir, ".claude", "skills", "stw.md");
    assert.ok(existsSync(skillPath), "should create skill file");
    const skill = readFileSync(skillPath, "utf-8");
    assert.ok(skill.includes("求是工作流"));
    assert.ok(skill.includes("stw status"));
  });

  it("creates CLAUDE.md with STW reference when missing", () => {
    const dir = freshDir();
    writeStwFiles(dir, claudeEnv, EMPTY_CONFLICTS);
    const claudeMdPath = join(dir, "CLAUDE.md");
    assert.ok(existsSync(claudeMdPath), "should create CLAUDE.md");
    const content = readFileSync(claudeMdPath, "utf-8");
    assert.ok(content.includes("STW 工作流规范"));
    assert.ok(content.includes(".stw/STW-Workspace.md"));
  });

  it("appends to existing CLAUDE.md without duplication", () => {
    const dir = freshDir();
    const claudeMdPath = join(dir, "CLAUDE.md");
    writeFile(dir, "CLAUDE.md", "# My Project\n\nCustom rules here.\n");
    writeStwFiles(dir, claudeEnv, EMPTY_CONFLICTS);
    const content = readFileSync(claudeMdPath, "utf-8");
    assert.ok(content.includes("Custom rules here"));
    assert.ok(content.includes("STW 工作流规范"));
    // No double append
    writeStwFiles(dir, claudeEnv, EMPTY_CONFLICTS);
    const content2 = readFileSync(claudeMdPath, "utf-8");
    assert.equal(content2, content);
  });

  it("does not create Claude Code files when not detected", () => {
    const dir = freshDir();
    writeStwFiles(dir, EMPTY_ENV, EMPTY_CONFLICTS);
    assert.ok(!existsSync(join(dir, ".claude")));
    assert.ok(!existsSync(join(dir, "CLAUDE.md")));
  });

  it("creates AGENTS.md when Codex CLI detected", () => {
    const dir = freshDir();
    const env = { project: null, aiTools: [{ name: "Codex CLI", source: "test" }], mcpConfigs: [], skills: [] };
    writeStwFiles(dir, env, EMPTY_CONFLICTS);
    const path = join(dir, "AGENTS.md");
    assert.ok(existsSync(path));
    assert.ok(readFileSync(path, "utf-8").includes("STW 工作流规范"));
  });

  it("creates .cursorrules when Cursor detected", () => {
    const dir = freshDir();
    const env = { project: null, aiTools: [{ name: "Cursor", source: "test" }], mcpConfigs: [], skills: [] };
    writeStwFiles(dir, env, EMPTY_CONFLICTS);
    const path = join(dir, ".cursorrules");
    assert.ok(existsSync(path));
    assert.ok(readFileSync(path, "utf-8").includes("STW 工作流规范"));
  });

  it("creates .clinerules when Cline detected", () => {
    const dir = freshDir();
    const env = { project: null, aiTools: [{ name: "Cline", source: "test" }], mcpConfigs: [], skills: [] };
    writeStwFiles(dir, env, EMPTY_CONFLICTS);
    const path = join(dir, ".clinerules");
    assert.ok(existsSync(path));
    assert.ok(readFileSync(path, "utf-8").includes("STW 工作流规范"));
  });

  it("creates OPenCODE.md when OpenCode detected", () => {
    const dir = freshDir();
    const env = { project: null, aiTools: [{ name: "OpenCode", source: "test" }], mcpConfigs: [], skills: [] };
    writeStwFiles(dir, env, EMPTY_CONFLICTS);
    const path = join(dir, "OPenCODE.md");
    assert.ok(existsSync(path));
    assert.ok(readFileSync(path, "utf-8").includes("STW 工作流规范"));
  });
});
