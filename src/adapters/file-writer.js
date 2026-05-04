import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createDefaultConfig } from "./config-schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, "..", "..", "templates");

function readTemplate(name) {
  const path = join(TEMPLATES_DIR, name);
  return readFileSync(path, "utf-8");
}


function copyDirFiles(srcDir, destDir) {
  if (!existsSync(srcDir)) return;
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const src = join(srcDir, entry.name);
    const dest = join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirFiles(src, dest);
    } else if (entry.isFile()) {
      copyFileSync(src, dest);
    }
  }
}

function writeNativePluginFiles(rootDir) {
  const codexManifest = join(TEMPLATES_DIR, "..", ".codex-plugin", "plugin.json");
  const claudeManifest = join(TEMPLATES_DIR, "..", ".claude-plugin", "plugin.json");
  const nativeSkillsDir = join(TEMPLATES_DIR, "native-skills");

  if (existsSync(codexManifest)) {
    mkdirSync(join(rootDir, ".codex-plugin"), { recursive: true });
    copyFileSync(codexManifest, join(rootDir, ".codex-plugin", "plugin.json"));
  }
  if (existsSync(claudeManifest)) {
    mkdirSync(join(rootDir, ".claude-plugin"), { recursive: true });
    copyFileSync(claudeManifest, join(rootDir, ".claude-plugin", "plugin.json"));
  }
  if (existsSync(nativeSkillsDir)) {
    for (const skill of readdirSync(nativeSkillsDir, { withFileTypes: true })) {
      if (skill.isDirectory()) {
        copyDirFiles(join(nativeSkillsDir, skill.name), join(rootDir, "skills", skill.name));
      }
    }
  }
}

function makeSummary(report, environment) {
  const parts = [];
  if (environment.project) {
    parts.push(`项目类型: ${environment.project.type}`);
  }
  if (environment.aiTools.length > 0) {
    parts.push(
      `AI 工具: ${environment.aiTools.map((t) => t.name).join(", ")}`,
    );
  }
  return parts.join(" | ") || "未检测到环境信息";
}

function makeMcpTable(mcpConfigs) {
  if (mcpConfigs.length === 0) return "未发现 MCP 服务器";
  const rows = ["| 来源 | 服务器 |", "| :--- | :--- |"];
  for (const cfg of mcpConfigs) {
    for (const server of cfg.servers) {
      rows.push(`| ${cfg.source} | \`${server}\` |`);
    }
  }
  return rows.join("\n");
}

function makeSkillsTable(skills) {
  if (skills.length === 0) return "未发现 Skills";
  const rows = ["| 名称 | 描述 | 来源 |", "| :--- | :--- | :--- |"];
  for (const skill of skills) {
    rows.push(`| ${skill.name} | ${skill.description || "-"} | ${skill.source} |`);
  }
  return rows.join("\n");
}

function makeAIToolsSummary(aiTools) {
  if (aiTools.length === 0) return "未检测到 AI 编程工具";
  return aiTools.map((t) => {
    const v = t.version ? ` v${t.version}` : "";
    return `${t.name}${v} (${t.source})`;
  }).join("; ");
}

function makeMcpSummary(mcpConfigs) {
  const allServers = mcpConfigs.flatMap((c) => c.servers);
  if (allServers.length === 0) return "未发现 MCP 服务器";
  return `${allServers.length} 个 MCP 服务器可用`;
}

function makeSkillsSummary(skills) {
  if (skills.length === 0) return "未发现 Skills";
  return `${skills.length} 个 Skill 可用`;
}

function makeConflictWarnings(conflicts) {
  if (!conflicts.warnings || conflicts.warnings.length === 0) {
    return "未检测到冲突。";
  }
  return conflicts.warnings
    .map((w) => `- ⚠️ ${w.message}\n  > ${w.suggestion}`)
    .join("\n");
}

export function writeStwFiles(rootDir, environment, conflicts) {
  const stwDir = join(rootDir, ".stw");
  const reportsDir = join(stwDir, "reports");
  mkdirSync(stwDir, { recursive: true });
  mkdirSync(reportsDir, { recursive: true });
  writeFileSync(join(reportsDir, ".gitkeep"), "");

  const now = new Date().toISOString().slice(0, 10);
  writeNativePluginFiles(rootDir);

  // Config
  const config = createDefaultConfig();
  config.generatedAt = now;
  config.environment = environment;
  config.conflicts = conflicts;
  writeFileSync(join(stwDir, "config.json"), JSON.stringify(config, null, 2));

  // STW-Workspace.md
  const workspace = readTemplate("STW-Workspace.md")
    .replaceAll(/\{\{GENERATED_AT\}\}/g, new Date().toLocaleString())
    .replaceAll(/\{\{AI_TOOLS_SUMMARY\}\}/g, makeAIToolsSummary(environment.aiTools))
    .replaceAll(/\{\{MCP_SUMMARY\}\}/g, makeMcpSummary(environment.mcpConfigs))
    .replaceAll(/\{\{SKILLS_SUMMARY\}\}/g, makeSkillsSummary(environment.skills))
    .replaceAll(/\{\{PROJECT_TYPE\}\}/g, environment.project?.type || "Unknown")
    .replaceAll(/\{\{MCP_TABLE\}\}/g, makeMcpTable(environment.mcpConfigs))
    .replaceAll(/\{\{SKILLS_TABLE\}\}/g, makeSkillsTable(environment.skills))
    .replaceAll(/\{\{CONFLICT_WARNINGS\}\}/g, makeConflictWarnings(conflicts));
  writeFileSync(join(stwDir, "STW-Workspace.md"), workspace);

  // Analysis-Template.md
  const analysis = readTemplate("Analysis-Template.md")
    .replaceAll(/\{\{DATE\}\}/g, now);
  writeFileSync(join(stwDir, "Analysis-Template.md"), analysis);

  // Summary-Template.md
  const summary = readTemplate("Summary-Template.md")
    .replaceAll(/\{\{DATE\}\}/g, now);
  writeFileSync(join(stwDir, "Summary-Template.md"), summary);

  // 审查员 agent 定义文件（可选模板，不存在则跳过）
  const reviewerMd = join(TEMPLATES_DIR, "审查员.md");
  const reviewerClaudeMd = join(TEMPLATES_DIR, "审查员.claude.md");
  if (existsSync(reviewerMd)) copyFileSync(reviewerMd, join(stwDir, "审查员.md"));
  if (existsSync(reviewerClaudeMd)) copyFileSync(reviewerClaudeMd, join(stwDir, "审查员.claude.md"));

  // AI 工具集成：为检测到的每个工具自动注入 STW 工作流规范
  const TOOL_BOOTSTRAPS = {
    "Claude Code": {
      files: ["CLAUDE.md"],
      content: [
        "<!-- STW 工作流规范（由 stw init 自动生成） -->",
        "",
        "## 求是工作流",
        "",
        "开发类任务必须先使用原生 Skill `using-stw`。",
        "若 Skill 未自动触发，先检测 `rtk`：可用则运行 `rtk stw status`，否则运行 `stw status`。无任务则按同一前缀执行 `start --desc \"<用户需求>\"`。",
        "读取 `.stw/STW-Workspace.md`，严格按照五阶段规范执行所有任务。",
        "对话中使用 `/stw status` 查看进度，`/stw next` 推进阶段；直接跑终端时优先用 `rtk stw ...`（若 rtk 可用），否则用 `stw ...`。",
        "",
      ],
      skill: true,
    },
    "Codex CLI": {
      files: ["AGENTS.md"],
      content: [
        "<!-- STW 工作流规范（由 stw init 自动生成） -->",
        "",
        "## 求是工作流",
        "",
        "开发类任务必须先使用原生 Skill `using-stw`。",
        "若 Skill 未自动触发，先检测 `rtk`：可用则运行 `rtk stw status`，否则运行 `stw status`。无任务则按同一前缀执行 `start --desc \"<用户需求>\"`。",
        "读取 `.stw/STW-Workspace.md`，严格按照五阶段规范执行所有任务。",
        "在终端中优先用 `rtk stw status/next`（若 rtk 可用），否则用 `stw status/next`。",
        "",
      ],
    },
    Cursor: {
      files: [".cursorrules"],
      content: [
        "<!-- STW 工作流规范（由 stw init 自动生成） -->",
        "",
        "开发类任务必须先使用原生 Skill `using-stw`。",
        "若 Skill 未自动触发，先检测 `rtk`：可用则运行 `rtk stw status`，否则运行 `stw status`。无任务则按同一前缀执行 `start --desc \"<用户需求>\"`。",
        "读取 `.stw/STW-Workspace.md`，严格按照五阶段规范执行所有任务。",
        "在终端中优先用 `rtk stw status/next`（若 rtk 可用），否则用 `stw status/next`。",
        "",
      ],
    },
    Cline: {
      files: [".clinerules"],
      content: [
        "<!-- STW 工作流规范（由 stw init 自动生成） -->",
        "",
        "开发类任务必须先使用原生 Skill `using-stw`。",
        "若 Skill 未自动触发，先检测 `rtk`：可用则运行 `rtk stw status`，否则运行 `stw status`。无任务则按同一前缀执行 `start --desc \"<用户需求>\"`。",
        "读取 `.stw/STW-Workspace.md`，严格按照五阶段规范执行所有任务。",
        "在终端中优先用 `rtk stw status/next`（若 rtk 可用），否则用 `stw status/next`。",
        "",
      ],
    },
    OpenCode: {
      files: ["OPenCODE.md"],
      content: [
        "<!-- STW 工作流规范（由 stw init 自动生成） -->",
        "",
        "开发类任务必须先使用原生 Skill `using-stw`。",
        "若 Skill 未自动触发，先检测 `rtk`：可用则运行 `rtk stw status`，否则运行 `stw status`。无任务则按同一前缀执行 `start --desc \"<用户需求>\"`。",
        "读取 `.stw/STW-Workspace.md`，严格按照五阶段规范执行所有任务。",
        "在终端中优先用 `rtk stw status/next`（若 rtk 可用），否则用 `stw status/next`。",
        "",
      ],
    },
    Windsurf: {
      files: [".windsurfrules"],
      content: [
        "<!-- STW 工作流规范（由 stw init 自动生成） -->",
        "",
        "开发类任务必须先使用原生 Skill `using-stw`。",
        "若 Skill 未自动触发，先检测 `rtk`：可用则运行 `rtk stw status`，否则运行 `stw status`。无任务则按同一前缀执行 `start --desc \"<用户需求>\"`。",
        "读取 `.stw/STW-Workspace.md`，严格按照五阶段规范执行所有任务。",
        "在终端中优先用 `rtk stw status/next`（若 rtk 可用），否则用 `stw status/next`。",
        "",
      ],
    },
    "GitHub Copilot": {
      files: [".github/copilot-instructions.md"],
      content: [
        "<!-- STW 工作流规范（由 stw init 自动生成） -->",
        "",
        "开发类任务必须先使用原生 Skill `using-stw`。",
        "若 Skill 未自动触发，先检测 `rtk`：可用则运行 `rtk stw status`，否则运行 `stw status`。无任务则按同一前缀执行 `start --desc \"<用户需求>\"`。",
        "读取 `.stw/STW-Workspace.md`，严格按照五阶段规范执行所有任务。",
        "在终端中优先用 `rtk stw status/next`（若 rtk 可用），否则用 `stw status/next`。",
        "",
      ],
    },
    Aider: {
      files: [".aiderrules"],
      content: [
        "<!-- STW 工作流规范（由 stw init 自动生成） -->",
        "",
        "开发类任务必须先使用原生 Skill `using-stw`。",
        "若 Skill 未自动触发，先检测 `rtk`：可用则运行 `rtk stw status`，否则运行 `stw status`。无任务则按同一前缀执行 `start --desc \"<用户需求>\"`。",
        "读取 `.stw/STW-Workspace.md`，严格按照五阶段规范执行所有任务。",
        "在终端中优先用 `rtk stw status/next`（若 rtk 可用），否则用 `stw status/next`。",
        "",
      ],
    },
  };

  const stwRefMarker = "STW 工作流规范";

  function upsertFile(filePath, lines) {
    const text = lines.join("\n");
    const parent = dirname(filePath);
    if (parent !== ".") mkdirSync(parent, { recursive: true });
    if (!existsSync(filePath)) {
      writeFileSync(filePath, text);
    } else {
      const existing = readFileSync(filePath, "utf-8");
      if (!existing.includes(stwRefMarker)) {
        writeFileSync(filePath, existing + "\n" + text);
      }
    }
  }

  for (const tool of environment.aiTools) {
    const cfg = TOOL_BOOTSTRAPS[tool.name];
    if (!cfg) continue;

    for (const file of cfg.files) {
      upsertFile(join(rootDir, file), cfg.content);
    }

    // Claude Code 专属: Skill (对话中 /stw)
    if (cfg.skill) {
      const skillsDir = join(rootDir, ".claude", "skills");
      mkdirSync(skillsDir, { recursive: true });
      const skillTemplate = join(TEMPLATES_DIR, "stw-skill.md");
      if (existsSync(skillTemplate)) {
        copyFileSync(skillTemplate, join(skillsDir, "stw.md"));
      }
    }
  }

  return stwDir;
}
