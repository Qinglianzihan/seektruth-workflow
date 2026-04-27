import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CLAUDE_SETTINGS = join(homedir(), ".claude", "settings.json");
const CLAUDE_SETTINGS_LOCAL = join(homedir(), ".claude", "settings.local.json");
const CURSOR_MCP = join(homedir(), ".cursor", "mcp.json");
const PLUGIN_MARKETPLACE = join(homedir(), ".claude", "plugins", "marketplaces");
const INSTALLED_PLUGINS = join(homedir(), ".claude", "plugins", "installed_plugins.json");

// Known built-in MCP servers per platform (no config file, baked into the binary)
const BUILTIN_MCP = {
  "Claude Code": [
    { name: "ace-tool", description: "Codebase retrieval and semantic search engine" },
    { name: "sequential-thinking", description: "Structured multi-step reasoning" },
    { name: "memory", description: "Persistent knowledge graph across sessions" },
    { name: "jshook", description: "Browser/network request interception and domain toggling" },
  ],
};

function tryReadJson(filePath) {
  try {
    if (existsSync(filePath)) {
      return JSON.parse(readFileSync(filePath, "utf-8"));
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

function extractMcpServers(config) {
  if (config?.mcpServers) {
    return Object.keys(config.mcpServers);
  }
  return [];
}

function getInstalledPluginNames() {
  const data = tryReadJson(INSTALLED_PLUGINS);
  if (!data?.plugins) return [];
  // keys like "superpowers@claude-plugins-official"
  return Object.keys(data.plugins);
}

/**
 * Get known built-in MCP servers for a given AI tool platform.
 * These are embedded in the binary, not in config files.
 */
export function getBuiltinMcpServers(aiTools) {
  const all = [];
  for (const tool of aiTools) {
    const builtins = BUILTIN_MCP[tool.name];
    if (builtins) {
      all.push({
        source: `${tool.name} (内建)`,
        servers: builtins.map((b) => b.name),
        detailed: builtins,
      });
    }
  }
  return all;
}

export function scanMcpConfigs(rootDir) {
  const results = [];

  // Project-level .claude/settings.json / settings.local.json
  for (const f of [".claude/settings.json", ".claude/settings.local.json"]) {
    const cfg = tryReadJson(join(rootDir, f));
    if (cfg) {
      const servers = extractMcpServers(cfg);
      if (servers.length > 0) {
        results.push({ source: `${f} (project)`, servers });
      }
    }
  }

  // Global Claude settings
  for (const [label, filePath] of [
    [".claude/settings.json (global)", CLAUDE_SETTINGS],
    [".claude/settings.local.json (global)", CLAUDE_SETTINGS_LOCAL],
  ]) {
    const cfg = tryReadJson(filePath);
    if (cfg) {
      const servers = extractMcpServers(cfg);
      if (servers.length > 0) {
        results.push({ source: label, servers });
      }
    }
  }

  // Project-level .mcp.json
  const mcpJsonConfig = tryReadJson(join(rootDir, ".mcp.json"));
  if (mcpJsonConfig) {
    const servers = extractMcpServers(mcpJsonConfig);
    if (servers.length > 0) {
      results.push({ source: ".mcp.json", servers });
    }
  }

  // Cursor MCP config
  const cursorConfig = tryReadJson(CURSOR_MCP);
  if (cursorConfig) {
    const servers = extractMcpServers(cursorConfig);
    if (servers.length > 0) {
      results.push({ source: "~/.cursor/mcp.json", servers });
    }
  }

  // Codex CLI plugin .mcp.json files
  const CODEX_PLUGINS = join(homedir(), ".codex", ".tmp", "plugins", "plugins");
  if (existsSync(CODEX_PLUGINS)) {
    const codexDirs = readdirSync(CODEX_PLUGINS, { withFileTypes: true })
      .filter((d) => d.isDirectory());
    for (const dir of codexDirs) {
      const mcpData = tryReadJson(join(CODEX_PLUGINS, dir.name, ".mcp.json"));
      if (mcpData) {
        const servers = mcpData.mcpServers ? Object.keys(mcpData.mcpServers) : Object.keys(mcpData);
        results.push({ source: `codex plugin: ${dir.name}`, servers });
      }
    }
  }

  // Claude Code plugin marketplace .mcp.json files
  const installed = getInstalledPluginNames();
  if (installed.length > 0 && existsSync(PLUGIN_MARKETPLACE)) {
    const marketplaces = readdirSync(PLUGIN_MARKETPLACE, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const marketplace of marketplaces) {
      const extPluginsDir = join(PLUGIN_MARKETPLACE, marketplace, "external_plugins");
      if (!existsSync(extPluginsDir)) continue;

      const pluginDirs = readdirSync(extPluginsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory());

      for (const dir of pluginDirs) {
        // Check if this plugin is actually installed
        const pluginKey = `${dir.name}@${marketplace}`;
        const isInstalled = installed.includes(pluginKey);

        const mcpJsonPath = join(extPluginsDir, dir.name, ".mcp.json");
        const mcpData = tryReadJson(mcpJsonPath);
        if (mcpData) {
          // Format 1: { serverName: { command, args } }
          // Format 2: { mcpServers: { serverName: { ... } } }
          const servers = mcpData.mcpServers
            ? Object.keys(mcpData.mcpServers)
            : Object.keys(mcpData);
          results.push({
            source: isInstalled
              ? `plugin: ${dir.name} (installed)`
              : `plugin: ${dir.name} (available)`,
            servers,
          });
        }
      }
    }
  }

  return results;
}
