import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CLAUDE_DIR = join(homedir(), ".claude");
const CURSOR_DIR = join(homedir(), ".cursor");
const CODEIX_DIR = join(homedir(), ".codex");

export function detectAiTools() {
  const tools = [];

  // Claude Code
  const claudeVersion = process.env.CLAUDE_CODE_VERSION;
  if (claudeVersion) {
    tools.push({ name: "Claude Code", version: claudeVersion, source: "env" });
  } else if (existsSync(CLAUDE_DIR)) {
    tools.push({ name: "Claude Code", source: "config_dir" });
  }

  // Cursor
  if (existsSync(CURSOR_DIR)) {
    tools.push({ name: "Cursor", source: "config_dir" });
  }

  // Codex CLI
  if (existsSync(CODEIX_DIR)) {
    tools.push({ name: "Codex CLI", source: "config_dir" });
  }

  // Cline (via VSCode/VSCode-OSS/VSCode-Insiders extension config)
  for (const vsDir of [".vscode", ".vscode-oss", ".vscode-insiders"]) {
    const clinePath = join(homedir(), vsDir, "extensions", "cline");
    if (existsSync(clinePath)) {
      tools.push({ name: "Cline", source: "extension_dir" });
      break;
    }
  }

  return tools;
}

export function getClaudeConfigPath() {
  if (existsSync(CLAUDE_DIR)) {
    return CLAUDE_DIR;
  }
  return null;
}
