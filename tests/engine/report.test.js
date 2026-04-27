import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { archiveReport, listReports, getRecentSummaries } from "../../src/engine/report.js";

function freshDir() {
  const dir = join(tmpdir(), "stw-report-" + Date.now());
  mkdirSync(join(dir, ".stw"), { recursive: true });
  return dir;
}

function writeSummary(dir, content) {
  writeFileSync(join(dir, ".stw", "Summary-Template.md"), content);
}

describe("Report — archiveReport", () => {
  it("rejects when Summary-Template.md missing", () => {
    const dir = freshDir();
    const result = archiveReport(dir);
    assert.equal(result.ok, false);
  });

  it("rejects unfilled template", () => {
    const dir = freshDir();
    writeSummary(dir, "# S\n\n## 1. 战役概述\n\n| **任务** | |\n\n<!-- 本次任务 -->");
    const result = archiveReport(dir);
    assert.equal(result.ok, false);
  });

  it("archives filled summary", () => {
    const dir = freshDir();
    writeSummary(dir, "# S\n\n| **任务** | 完成测试 |\n\n一些实际内容");
    const result = archiveReport(dir);
    assert.equal(result.ok, true);
    assert.ok(result.name.startsWith("summary-"));
    assert.ok(existsSync(result.path));
  });
});

describe("Report — listReports", () => {
  it("returns empty list when no reports dir", () => {
    assert.deepEqual(listReports("/nonexistent/path"), []);
  });

  it("lists archived reports newest first", () => {
    const dir = freshDir();
    writeSummary(dir, "# S\n\n| **任务** | X |\n内容");
    archiveReport(dir);
    const reports = listReports(dir);
    assert.equal(reports.length, 1);
    assert.ok(reports[0].name.startsWith("summary-"));
  });
});

describe("Report — getRecentSummaries", () => {
  it("returns empty for no reports", () => {
    assert.deepEqual(getRecentSummaries("/nonexistent"), []);
  });

  it("extracts title from archived report", () => {
    const dir = freshDir();
    writeSummary(dir, "# 我的总结\n\n## 1. 战役概述\n\n| **任务** | X |\n内容");
    archiveReport(dir);
    const summaries = getRecentSummaries(dir, 1);
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].title, "我的总结");
  });
});
