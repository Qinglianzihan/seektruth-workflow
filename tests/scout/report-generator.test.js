import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateReport } from "../../src/scout/report-generator.js";

describe("Report Generator — generateReport", () => {
  it("returns a string even with empty environment", () => {
    const env = { project: {}, aiTools: [], mcpConfigs: [], skills: [] };
    const report = generateReport(env);
    assert.equal(typeof report, "string");
    assert.ok(report.length > 0);
  });

  it("contains project type when project is provided", () => {
    const env = { project: { type: "Node.js" }, aiTools: [], mcpConfigs: [], skills: [] };
    const report = generateReport(env);
    assert.ok(report.includes("Node.js"));
  });

  it("contains AI tool info when aiTools provided", () => {
    const env = { project: {}, aiTools: [{ name: "Claude Code", source: "env" }], mcpConfigs: [], skills: [] };
    const report = generateReport(env);
    assert.ok(report.includes("Claude Code"));
  });

  it("contains MCP server info when mcpConfigs provided", () => {
    const env = { project: {}, aiTools: [], mcpConfigs: [{ source: "test", servers: ["my-server"] }], skills: [] };
    const report = generateReport(env);
    assert.ok(report.includes("my-server"));
  });

  it("contains skill info when skills provided", () => {
    const env = { project: {}, aiTools: [], mcpConfigs: [], skills: [{ name: "test-skill", description: "A test", source: "local" }] };
    const report = generateReport(env);
    assert.ok(report.includes("test-skill"));
  });

  it("contains 侦察完成 at the end", () => {
    const env = { project: {}, aiTools: [], mcpConfigs: [], skills: [] };
    const report = generateReport(env);
    assert.ok(report.includes("侦察完成"));
  });
});
