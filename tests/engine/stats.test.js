import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { logTokens, getStats, generateStatsReport } from "../../src/engine/stats.js";
import { freshDir } from "../test-helper.js";

describe("logTokens(rootDir, tokens, note)", () => {
  it("creates stats file with initial entry", () => {
    const dir = freshDir();
    logTokens(dir, 100, "first log");

    const statsPath = join(dir, ".stw", "stats.json");
    assert.ok(existsSync(statsPath));

    const data = JSON.parse(readFileSync(statsPath, "utf-8"));
    assert.equal(data.totalTokens, 100);
    assert.equal(data.tokenLogs.length, 1);
    assert.equal(data.tokenLogs[0].amount, 100);
    assert.equal(data.tokenLogs[0].note, "first log");
  });

  it("accumulates totalTokens across multiple calls", () => {
    const dir = freshDir();
    logTokens(dir, 50, "first");
    logTokens(dir, 75, "second");
    logTokens(dir, 25, "third");

    const data = JSON.parse(readFileSync(join(dir, ".stw", "stats.json"), "utf-8"));
    assert.equal(data.totalTokens, 150);
    assert.equal(data.tokenLogs.length, 3);
  });

  it("stores note and timestamp for each entry", () => {
    const dir = freshDir();
    logTokens(dir, 200, "test-note");

    const data = JSON.parse(readFileSync(join(dir, ".stw", "stats.json"), "utf-8"));
    const log = data.tokenLogs[0];
    assert.equal(log.amount, 200);
    assert.equal(log.note, "test-note");
    assert.equal(typeof log.timestamp, "string");
    assert.ok(!isNaN(Date.parse(log.timestamp)), "timestamp should be valid ISO date");
  });
});

describe("getStats(rootDir)", () => {
  it("returns manual data with history object", async () => {
    const dir = freshDir();
    // Create some manual stats first
    logTokens(dir, 300, "pre-entry");

    const stats = await getStats(dir);
    assert.ok(stats.manual);
    assert.equal(stats.manual.totalTokens, 300);
    assert.ok(stats.history);
    // history.total depends on real ~/.claude/history.jsonl, just check shape
    assert.equal(typeof stats.history.total, "number");
    assert.equal(typeof stats.history.byProject, "object");
  });
});

describe("generateStatsReport(rootDir)", () => {
  it("returns a string", async () => {
    const dir = freshDir();
    logTokens(dir, 500, "report test");

    const report = await generateStatsReport(dir);
    assert.equal(typeof report, "string");
    assert.ok(report.length > 0);
    // Should contain token tracking section
    assert.ok(report.includes("500"));
    assert.ok(report.includes("report test"));
  });
});
