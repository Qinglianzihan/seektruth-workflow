import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync, readdirSync } from "node:fs";
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
      "roadmap.md",
      "planner-report.md",
      "reviewer-report.md",
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

  it("preserves existing STW documents and persistent records on repeated init", () => {
    const dir = freshDir();
    writeStwFiles(dir, EMPTY_ENV, EMPTY_CONFLICTS);

    writeFile(dir, ".stw/Analysis-Template.md", "# Old analysis\nimportant investigation");
    writeFile(dir, ".stw/Summary-Template.md", "# Old summary\nimportant lessons");
    writeFile(dir, ".stw/STW-Workspace.md", "# Old workspace\n<!-- ATTACK_ZONE: old -->");
    writeFile(dir, ".stw/error-registry.json", JSON.stringify([{ id: "err-1", description: "keep me" }], null, 2));
    writeFile(dir, ".stw/stats.json", JSON.stringify({ totalTokens: 123, tokenLogs: [{ amount: 123 }] }, null, 2));
    writeFile(dir, ".stw/reports/summary-old.md", "old report");

    writeStwFiles(dir, EMPTY_ENV, EMPTY_CONFLICTS);

    assert.ok(readFileSync(join(dir, ".stw", "Analysis-Template.md"), "utf-8").includes("# "));
    assert.deepEqual(JSON.parse(readFileSync(join(dir, ".stw", "error-registry.json"), "utf-8")), [{ id: "err-1", description: "keep me" }]);
    assert.equal(JSON.parse(readFileSync(join(dir, ".stw", "stats.json"), "utf-8")).totalTokens, 123);
    assert.equal(readFileSync(join(dir, ".stw", "reports", "summary-old.md"), "utf-8"), "old report");

    const historyRoot = join(dir, ".stw", "history");
    assert.ok(existsSync(historyRoot));
    const archived = readdirSync(historyRoot)
      .map((dirName) => join(historyRoot, dirName, "Summary-Template.md"))
      .filter((path) => existsSync(path))
      .map((path) => readFileSync(path, "utf-8"))
      .join("\n");
    assert.ok(archived.includes("important lessons"));
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
    assert.ok("plannerReviewer" in cfg);
    assert.equal(cfg.plannerReviewer.enabled, true);
  });

  it("planner-report.md and reviewer-report.md contain the Anthropic provenance note", () => {
    const dir = freshDir();
    writeStwFiles(dir, EMPTY_ENV, EMPTY_CONFLICTS);
    const planner = readFileSync(join(dir, ".stw", "planner-report.md"), "utf-8");
    const reviewer = readFileSync(join(dir, ".stw", "reviewer-report.md"), "utf-8");
    assert.ok(planner.includes("Anthropic"));
    assert.ok(planner.includes("**结论**"));
    assert.ok(reviewer.includes("Anthropic"));
    assert.ok(reviewer.includes("**结论**"));
  });

  it("roadmap.md is written with cross-task handoff skeleton", () => {
    const dir = freshDir();
    writeStwFiles(dir, EMPTY_ENV, EMPTY_CONFLICTS);
    const roadmap = readFileSync(join(dir, ".stw", "roadmap.md"), "utf-8");
    assert.ok(roadmap.includes("项目升级路线图"));
    assert.ok(roadmap.includes("新会话标准协议"));
    assert.ok(roadmap.includes("升级清单"));
  });

  it("archives user-edited roadmap.md on repeated init", () => {
    const dir = freshDir();
    writeStwFiles(dir, EMPTY_ENV, EMPTY_CONFLICTS);
    writeFile(dir, ".stw/roadmap.md", "# 我的路线图\n- [x] 已完成的重要事项");

    writeStwFiles(dir, EMPTY_ENV, EMPTY_CONFLICTS);

    const historyRoot = join(dir, ".stw", "history");
    const archived = readdirSync(historyRoot)
      .map((dirName) => join(historyRoot, dirName, "roadmap.md"))
      .filter((path) => existsSync(path))
      .map((path) => readFileSync(path, "utf-8"))
      .join("\n");
    assert.ok(archived.includes("已完成的重要事项"), "user roadmap must be archived");
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
    const content = readFileSync(path, "utf-8");
    assert.ok(content.includes("STW 工作流规范"));
    assert.ok(content.includes("`rtk stw status`"));
    assert.ok(content.includes("否则运行 `stw status`"));
    assert.ok(content.includes("若 rtk 可用"));
  });


  it("creates native Codex plugin manifest and STW skills", () => {
    const dir = freshDir();
    const env = { project: null, aiTools: [{ name: "Codex CLI", source: "test" }], mcpConfigs: [], skills: [] };
    writeStwFiles(dir, env, EMPTY_CONFLICTS);

    const manifestPath = join(dir, ".codex-plugin", "plugin.json");
    assert.ok(existsSync(manifestPath), "should create Codex plugin manifest");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    assert.equal(manifest.skills, "./skills/");

    for (const skill of ["using-stw", "stw-investigation", "stw-focus", "stw-lockdown", "stw-verification", "stw-summary", "stw-work-methods"]) {
      const skillPath = join(dir, "skills", skill, "SKILL.md");
      assert.ok(existsSync(skillPath), `missing native skill: ${skill}`);
      const content = readFileSync(skillPath, "utf-8");
      assert.ok(content.startsWith("---\nname: "), `invalid frontmatter: ${skill}`);
      assert.ok(content.includes("description: Use when"), `missing trigger description: ${skill}`);
    }
  });

  it("creates Claude plugin manifest for native skill discovery", () => {
    const dir = freshDir();
    writeStwFiles(dir, claudeEnv, EMPTY_CONFLICTS);
    const manifestPath = join(dir, ".claude-plugin", "plugin.json");
    assert.ok(existsSync(manifestPath), "should create Claude plugin manifest");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    assert.equal(manifest.name, "seektruth-workflow");
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

  it("creates .windsurfrules when Windsurf detected", () => {
    const dir = freshDir();
    const env = { project: null, aiTools: [{ name: "Windsurf", source: "test" }], mcpConfigs: [], skills: [] };
    writeStwFiles(dir, env, EMPTY_CONFLICTS);
    const path = join(dir, ".windsurfrules");
    assert.ok(existsSync(path));
    assert.ok(readFileSync(path, "utf-8").includes("STW 工作流规范"));
  });

  it("creates .github/copilot-instructions.md when GitHub Copilot detected", () => {
    const dir = freshDir();
    const env = { project: null, aiTools: [{ name: "GitHub Copilot", source: "test" }], mcpConfigs: [], skills: [] };
    writeStwFiles(dir, env, EMPTY_CONFLICTS);
    const path = join(dir, ".github", "copilot-instructions.md");
    assert.ok(existsSync(path));
    assert.ok(readFileSync(path, "utf-8").includes("STW 工作流规范"));
  });

  it("creates .aiderrules when Aider detected", () => {
    const dir = freshDir();
    const env = { project: null, aiTools: [{ name: "Aider", source: "test" }], mcpConfigs: [], skills: [] };
    writeStwFiles(dir, env, EMPTY_CONFLICTS);
    const path = join(dir, ".aiderrules");
    assert.ok(existsSync(path));
    assert.ok(readFileSync(path, "utf-8").includes("STW 工作流规范"));
  });
});

describe("File Writer — Claude Code PostToolUse hook injection", () => {
  const claudeEnv = {
    project: null,
    aiTools: [{ name: "Claude Code", source: "test" }],
    mcpConfigs: [],
    skills: [],
  };

  it("creates .claude/settings.json with stw hook run command", () => {
    const dir = freshDir();
    writeStwFiles(dir, claudeEnv, EMPTY_CONFLICTS);
    const settingsPath = join(dir, ".claude", "settings.json");
    assert.ok(existsSync(settingsPath), "settings.json should be created");
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    assert.ok(Array.isArray(settings.hooks?.PostToolUse));
    const matcher = settings.hooks.PostToolUse[0];
    assert.ok(matcher.matcher.includes("Edit") && matcher.matcher.includes("Write"));
    assert.ok(Array.isArray(matcher.hooks));
    assert.equal(matcher.hooks[0].type, "command");
    assert.ok(matcher.hooks[0].command.includes("stw hook run"));
  });

  it("preserves existing user settings when injecting", () => {
    const dir = freshDir();
    const existing = {
      permissions: { allow: ["Bash(ls:*)"] },
      env: { DEBUG: "1" },
      hooks: {
        SessionStart: [{ matcher: "", hooks: [{ type: "command", command: "echo hi" }] }],
      },
    };
    writeFile(dir, ".claude/settings.json", JSON.stringify(existing, null, 2));
    writeStwFiles(dir, claudeEnv, EMPTY_CONFLICTS);
    const merged = JSON.parse(readFileSync(join(dir, ".claude", "settings.json"), "utf-8"));
    assert.deepEqual(merged.permissions, existing.permissions);
    assert.deepEqual(merged.env, existing.env);
    assert.equal(merged.hooks.SessionStart[0].hooks[0].command, "echo hi");
    assert.ok(merged.hooks.PostToolUse.some((m) =>
      m.hooks.some((h) => h.command.includes("stw hook run"))
    ));
  });

  it("is idempotent — second init does not duplicate hook entry", () => {
    const dir = freshDir();
    writeStwFiles(dir, claudeEnv, EMPTY_CONFLICTS);
    writeStwFiles(dir, claudeEnv, EMPTY_CONFLICTS);
    const settings = JSON.parse(readFileSync(join(dir, ".claude", "settings.json"), "utf-8"));
    const stwHooks = settings.hooks.PostToolUse.filter((m) =>
      m.hooks.some((h) => h.command.includes("stw hook run"))
    );
    assert.equal(stwHooks.length, 1);
  });

  it("coexists with an existing PostToolUse entry (different command)", () => {
    const dir = freshDir();
    const existing = {
      hooks: {
        PostToolUse: [
          { matcher: "Edit", hooks: [{ type: "command", command: "my-own-formatter" }] },
        ],
      },
    };
    writeFile(dir, ".claude/settings.json", JSON.stringify(existing, null, 2));
    writeStwFiles(dir, claudeEnv, EMPTY_CONFLICTS);
    const merged = JSON.parse(readFileSync(join(dir, ".claude", "settings.json"), "utf-8"));
    assert.equal(merged.hooks.PostToolUse.length, 2);
    assert.ok(merged.hooks.PostToolUse[0].hooks[0].command.includes("my-own-formatter"));
    assert.ok(merged.hooks.PostToolUse[1].hooks[0].command.includes("stw hook run"));
  });

  it("does not create settings.json when Claude Code not detected", () => {
    const dir = freshDir();
    const env = { project: null, aiTools: [{ name: "Codex CLI", source: "test" }], mcpConfigs: [], skills: [] };
    writeStwFiles(dir, env, EMPTY_CONFLICTS);
    assert.ok(!existsSync(join(dir, ".claude", "settings.json")));
  });

  it("skips injection when settings.json is malformed JSON", () => {
    const dir = freshDir();
    writeFile(dir, ".claude/settings.json", "{ this is not json");
    writeStwFiles(dir, claudeEnv, EMPTY_CONFLICTS);
    // File left untouched — we don't clobber user data
    const content = readFileSync(join(dir, ".claude", "settings.json"), "utf-8");
    assert.equal(content, "{ this is not json");
  });
});

describe("File Writer — Claude Code Stop hook injection (T11)", () => {
  const claudeEnv = {
    project: null,
    aiTools: [{ name: "Claude Code", source: "test" }],
    mcpConfigs: [],
    skills: [],
  };

  it("creates settings.hooks.Stop entry with stw stop-hook run command", () => {
    const dir = freshDir();
    writeStwFiles(dir, claudeEnv, EMPTY_CONFLICTS);
    const settings = JSON.parse(readFileSync(join(dir, ".claude", "settings.json"), "utf-8"));
    assert.ok(Array.isArray(settings.hooks?.Stop), "expected hooks.Stop array");
    assert.equal(settings.hooks.Stop.length, 1);
    const entry = settings.hooks.Stop[0];
    assert.ok(Array.isArray(entry.hooks));
    assert.equal(entry.hooks[0].type, "command");
    assert.ok(entry.hooks[0].command.includes("stw stop-hook run"));
  });

  it("is idempotent — second init does not duplicate Stop hook entry", () => {
    const dir = freshDir();
    writeStwFiles(dir, claudeEnv, EMPTY_CONFLICTS);
    writeStwFiles(dir, claudeEnv, EMPTY_CONFLICTS);
    const settings = JSON.parse(readFileSync(join(dir, ".claude", "settings.json"), "utf-8"));
    const stwStopHooks = settings.hooks.Stop.filter((e) =>
      e.hooks.some((h) => h.command.includes("stw stop-hook run"))
    );
    assert.equal(stwStopHooks.length, 1);
  });

  it("coexists with an existing Stop entry (different command)", () => {
    const dir = freshDir();
    const existing = {
      hooks: {
        Stop: [{ hooks: [{ type: "command", command: "my-own-logger" }] }],
      },
    };
    writeFile(dir, ".claude/settings.json", JSON.stringify(existing, null, 2));
    writeStwFiles(dir, claudeEnv, EMPTY_CONFLICTS);
    const merged = JSON.parse(readFileSync(join(dir, ".claude", "settings.json"), "utf-8"));
    assert.equal(merged.hooks.Stop.length, 2);
    assert.ok(merged.hooks.Stop[0].hooks[0].command.includes("my-own-logger"));
    assert.ok(merged.hooks.Stop[1].hooks[0].command.includes("stw stop-hook run"));
  });

  it("injects both PostToolUse and Stop hooks on a fresh settings.json", () => {
    const dir = freshDir();
    writeStwFiles(dir, claudeEnv, EMPTY_CONFLICTS);
    const settings = JSON.parse(readFileSync(join(dir, ".claude", "settings.json"), "utf-8"));
    assert.ok(
      settings.hooks.PostToolUse.some((m) =>
        m.hooks.some((h) => h.command.includes("stw hook run"))
      ),
      "PostToolUse hook missing",
    );
    assert.ok(
      settings.hooks.Stop.some((e) =>
        e.hooks.some((h) => h.command.includes("stw stop-hook run"))
      ),
      "Stop hook missing",
    );
  });
});
