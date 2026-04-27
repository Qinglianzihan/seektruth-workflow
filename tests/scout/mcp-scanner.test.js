import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scanMcpConfigs, getBuiltinMcpServers } from "../../src/scout/mcp-scanner.js";

function freshDir() {
  const dir = join(tmpdir(), "stw-mcp-" + Date.now());
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeMcp(dir, relPath, data) {
  const full = join(dir, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, JSON.stringify(data));
}

describe("MCP Scanner — scanMcpConfigs", () => {
  it("scans project-level .mcp.json", () => {
    const dir = freshDir();
    writeMcp(dir, ".mcp.json", { mcpServers: { "my-server": { command: "node", args: [] } } });
    const results = scanMcpConfigs(dir);
    assert.ok(results.some((r) => r.servers.includes("my-server")));
  });

  it("does not find project configs from other projects", () => {
    const dir = freshDir();
    const results = scanMcpConfigs(dir);
    // Should not contain test configs unless explicitly created
    assert.equal(results.some((r) => r.servers.includes("my-server")), false);
  });
});

describe("MCP Scanner — getBuiltinMcpServers", () => {
  it("returns built-in MCP servers for Claude Code", () => {
    const result = getBuiltinMcpServers([{ name: "Claude Code", source: "env" }]);
    assert.ok(result.length > 0);
    assert.ok(result[0].servers.includes("ace-tool"));
    assert.ok(result[0].servers.includes("sequential-thinking"));
  });

  it("returns empty for unknown tools", () => {
    const result = getBuiltinMcpServers([{ name: "Unknown IDE" }]);
    assert.equal(result.length, 0);
  });
});
