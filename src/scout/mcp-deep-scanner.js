import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const CLAUDE_SETTINGS = join(homedir(), ".claude", "settings.json");
const CLAUDE_SETTINGS_LOCAL = join(homedir(), ".claude", "settings.local.json");
const PLUGIN_MARKETPLACE = join(homedir(), ".claude", "plugins", "marketplaces");
const INSTALLED_PLUGINS = join(homedir(), ".claude", "plugins", "installed_plugins.json");

const CONNECT_TIMEOUT = 10_000;

function tryReadJson(filePath) {
  try {
    if (existsSync(filePath)) return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch { /* ignore */ }
  return null;
}

function commandExists(cmd) {
  const result = spawnSync(cmd, ["--version"], { timeout: 2000, stdio: "ignore", shell: true });
  return result.status === 0;
}

function collectServerDefs(rootDir) {
  const defs = [];

  const addDefs = (source, config) => {
    const entries = config?.mcpServers ? Object.entries(config.mcpServers) : Object.entries(config);
    for (const [name, cfg] of entries) {
      if (cfg?.command) defs.push({ name, source, command: cfg.command, args: cfg.args || [] });
    }
  };

  // Project-level
  for (const f of [".claude/settings.json", ".claude/settings.local.json", ".mcp.json"]) {
    const cfg = tryReadJson(join(rootDir, f));
    if (cfg) addDefs(`${f} (project)`, cfg);
  }

  // Global Claude settings
  for (const [label, fp] of [
    [".claude/settings.json (global)", CLAUDE_SETTINGS],
    [".claude/settings.local.json (global)", CLAUDE_SETTINGS_LOCAL],
  ]) {
    const cfg = tryReadJson(fp);
    if (cfg) addDefs(label, cfg);
  }

  // Plugin marketplace — include all available servers (users may use them)
  if (existsSync(PLUGIN_MARKETPLACE)) {
    const marketplaces = readdirSync(PLUGIN_MARKETPLACE, { withFileTypes: true })
      .filter((d) => d.isDirectory()).map((d) => d.name);
    for (const marketplace of marketplaces) {
      const extDir = join(PLUGIN_MARKETPLACE, marketplace, "external_plugins");
      if (!existsSync(extDir)) continue;
      const dirs = readdirSync(extDir, { withFileTypes: true }).filter((d) => d.isDirectory());
      for (const dir of dirs) {
        const mcpData = tryReadJson(join(extDir, dir.name, ".mcp.json"));
        if (mcpData) addDefs(`plugin: ${dir.name}`, mcpData);
      }
    }
  }

  return defs;
}

async function probeServer(def) {
  const cmd = def.command.split(/\s+/)[0];
  if (!commandExists(cmd)) {
    return { name: def.name, source: def.source, status: "skipped", error: `"${cmd}" 未安装` };
  }

  const transport = new StdioClientTransport({ command: def.command, args: def.args });
  const client = new Client(
    { name: "stw-deep-scanner", version: "0.1.0" },
    { capabilities: {} },
  );

  const timer = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), CONNECT_TIMEOUT),
  );

  let connected = false;
  try {
    await Promise.race([client.connect(transport), timer]);
    connected = true;
    const result = await client.listTools();
    await client.close();
    connected = false;
    return {
      name: def.name,
      source: def.source,
      status: "ok",
      tools: result.tools.map((t) => ({
        name: t.name,
        description: (t.description || "").slice(0, 200),
      })),
    };
  } catch (err) {
    // Cleanup: kill the transport process if still running
    try { transport.close(); } catch { /* ignore */ }
    try { if (connected) client.close(); } catch { /* ignore */ }
    return { name: def.name, source: def.source, status: "error", error: err.message };
  }
}

export async function deepScanMcp(rootDir) {
  const defs = collectServerDefs(rootDir);
  if (defs.length === 0) return { servers: [], summary: "未发现可连接的 MCP 服务器" };

  const results = await Promise.allSettled(defs.map((d) => probeServer(d)));
  const servers = results.map((r) =>
    r.status === "fulfilled" ? r.value : { name: "?", status: "error", error: r.reason?.message },
  );

  const okCount = servers.filter((s) => s.status === "ok").length;
  const skipCount = servers.filter((s) => s.status === "skipped").length;

  return {
    servers,
    summary: `${okCount}/${servers.length} 连接成功 (${skipCount} 跳过 — 命令未安装)`,
  };
}
