const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const MAGENTA = "\x1b[35m";
const RED = "\x1b[31m";

function section(title) {
  return `\n${BOLD}${CYAN}=== ${title} ===${RESET}\n`;
}

function badge(label, value, color = GREEN) {
  return `  ${color}${BOLD}${label}:${RESET} ${value}`;
}

function divider() {
  return `${DIM}---${RESET}`;
}

export function generateReport({ project, aiTools, mcpConfigs, skills }) {
  const lines = [];

  // Header
  lines.push(`\n${BOLD}${MAGENTA}🔍 求是工作流 — 敌情侦察报告${RESET}`);
  lines.push(`${DIM}Environment Reconnaissance Report${RESET}`);
  lines.push(divider());

  // 1. Project
  lines.push(section("项目类型 / Project"));
  lines.push(badge("类型", project.type));
  if (project.buildTool) lines.push(badge("构建工具", project.buildTool, YELLOW));
  if (project.testFramework) lines.push(badge("测试框架", project.testFramework, YELLOW));
  lines.push(divider());

  // 2. AI Tools
  lines.push(section("AI 工具 / AI Tools"));
  if (aiTools.length === 0) {
    lines.push(`  ${DIM}未检测到已知 AI 编程工具${RESET}`);
  } else {
    for (const tool of aiTools) {
      const version = tool.version ? ` v${tool.version}` : "";
      lines.push(`  ${GREEN}✓${RESET} ${tool.name}${version} (${DIM}${tool.source}${RESET})`);
    }
  }
  lines.push(divider());

  // 3. MCP Servers
  lines.push(section("MCP 服务器 / MCP Servers"));
  if (mcpConfigs.length === 0) {
    lines.push(`  ${DIM}未发现 MCP 配置${RESET}`);
  } else {
    for (const cfg of mcpConfigs) {
      lines.push(`  ${YELLOW}📦${RESET} ${BOLD}来源:${RESET} ${cfg.source}`);
      for (const server of cfg.servers) {
        lines.push(`    ${CYAN}├─${RESET} ${server}`);
      }
    }
  }
  lines.push(divider());

  // 4. Skills
  lines.push(section("Skills / 技能"));
  if (skills.length === 0) {
    lines.push(`  ${DIM}未发现 Skills${RESET}`);
  } else {
    for (const skill of skills) {
      lines.push(`  ${MAGENTA}⚡${RESET} ${BOLD}${skill.name}${RESET}`);
      if (skill.description) {
        lines.push(`     ${DIM}${skill.description}${RESET}`);
      }
      lines.push(`     ${DIM}(${skill.source})${RESET}`);
    }
  }

  // Footer
  lines.push(`\n${BOLD}${GREEN}✅ 侦察完成${RESET}`);
  lines.push("");

  return lines.join("\n");
}
