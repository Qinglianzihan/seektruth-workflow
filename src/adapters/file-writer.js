import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createDefaultConfig } from "./config-schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, "..", "..", "templates");

function readTemplate(name) {
  const path = join(TEMPLATES_DIR, name);
  return readFileSync(path, "utf-8");
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

  // Claude Code 集成：如果检测到 Claude Code，自动配置 Skill + CLAUDE.md
  const hasClaudeCode = environment.aiTools.some((t) => t.name === "Claude Code");
  if (hasClaudeCode) {
    // 1. Skill: 用户可在对话中直接 /stw status、/stw next 等
    const skillsDir = join(rootDir, ".claude", "skills");
    mkdirSync(skillsDir, { recursive: true });
    const skillTemplate = join(TEMPLATES_DIR, "stw-skill.md");
    if (existsSync(skillTemplate)) {
      copyFileSync(skillTemplate, join(skillsDir, "stw.md"));
    }

    // 2. CLAUDE.md: 自动注入 STW 工作流规范
    const claudeMdPath = join(rootDir, "CLAUDE.md");
    const stwBootstrap = [
      "",
      "<!-- STW 工作流规范（由 stw init 自动生成） -->",
      "",
      "## 当前任务",
      "",
      "读取 `.stw/STW-Workspace.md`，严格按照求是工作流的五阶段规范执行本项目的所有任务。",
      "这包括：调查研究 → 抓住主要矛盾 → 集中优势兵力 → 实践检验 → 总结与转化。",
      "使用 `/stw status` 查看当前进度，`/stw next` 推进阶段。",
      "",
    ].join("\n");

    if (!existsSync(claudeMdPath)) {
      writeFileSync(claudeMdPath, stwBootstrap.trimStart());
    } else {
      const existing = readFileSync(claudeMdPath, "utf-8");
      if (!existing.includes("STW 工作流规范")) {
        writeFileSync(claudeMdPath, existing + "\n" + stwBootstrap);
      }
    }
  }

  return stwDir;
}
