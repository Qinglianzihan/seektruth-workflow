import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deepScanMcp } from "../../src/scout/mcp-deep-scanner.js";
import { freshDir, writeFile } from "../test-helper.js";

describe("MCP Deep Scanner — structure and return types", () => {
  it("returns expected shape { servers, summary }", async () => {
    const dir = freshDir();
    const result = await deepScanMcp(dir, { includeGlobal: false });
    assert.ok("servers" in result);
    assert.ok("summary" in result);
    assert.ok(Array.isArray(result.servers));
    assert.equal(typeof result.summary, "string");
  });

  it("calls servers entries 'servers' not undefined", async () => {
    const dir = freshDir();
    const result = await deepScanMcp(dir, { includeGlobal: false });
    for (const s of result.servers) {
      assert.ok("name" in s);
      assert.ok("status" in s);
      assert.ok(["ok", "skipped", "error"].includes(s.status), `unexpected status: ${s.status}`);
    }
  });
});

describe("MCP Deep Scanner — project-level config", () => {
  it("detects project .mcp.json with fake command → skipped", async () => {
    const dir = freshDir();
    writeFile(dir, ".mcp.json", JSON.stringify({
      mcpServers: {
        "fake-server": {
          command: "nonexistentcmd__xyz",
          args: [],
        },
      },
    }));
    const result = await deepScanMcp(dir, { includeGlobal: false });
    // At least one server was collected from the project config
    const fromProject = result.servers.filter((s) =>
      s.name === "fake-server" && s.source?.includes(".mcp.json"),
    );
    assert.ok(fromProject.length >= 1, "Should have collected fake-server from .mcp.json");
    // The fake command doesn't exist, so it should be skipped
    for (const s of fromProject) {
      assert.equal(s.status, "skipped");
    }
  });

  it("detects project .claude/settings.json config", async () => {
    const dir = freshDir();
    writeFile(dir, ".claude/settings.json", JSON.stringify({
      mcpServers: {
        "another-fake": {
          command: "nonexistentcmd__abc",
          args: [],
        },
      },
    }));
    const result = await deepScanMcp(dir, { includeGlobal: false });
    const fromSettings = result.servers.filter((s) =>
      s.name === "another-fake",
    );
    assert.ok(fromSettings.length >= 1, "Should have collected server from settings.json");
    for (const s of fromSettings) {
      assert.equal(s.status, "skipped");
    }
  });

  it("empty project folder returns valid summary string", async () => {
    const dir = freshDir();
    const result = await deepScanMcp(dir, { includeGlobal: false });
    // Summary is always a non-empty string
    assert.ok(result.summary.length > 0);
  });
});
