import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { archiveReport, listReports, getRecentSummaries } from "../../src/engine/report.js";
import { freshDir, writeStwFile } from "../test-helper.js";

function writeSummary(dir, content) {
  writeStwFile(dir, "Summary-Template.md", content);
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

  it("does not overwrite reports archived in the same second", () => {
    const dir = freshDir();
    writeSummary(dir, "# First\n\n| **任务** | X |\nfirst");
    const first = archiveReport(dir);
    writeSummary(dir, "# Second\n\n| **任务** | Y |\nsecond");
    const second = archiveReport(dir);

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.notEqual(second.name, first.name);
    assert.ok(existsSync(first.path));
    assert.ok(existsSync(second.path));
    assert.equal(listReports(dir).length, 2);
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

  it("extracts lessons from archived report", () => {
    const dir = freshDir();
    writeSummary(dir,
      "# 我的总结\n\n" +
      "## 1. 战役概述\n\n| **任务** | X |\n内容\n\n" +
      "## 4. 经验教训\n\n" +
      "先写测试再改代码很有效。\n" +
      "频繁提交保持清晰历史。"
    );
    archiveReport(dir);
    const summaries = getRecentSummaries(dir, 1);
    assert.ok(summaries[0].lessons.length > 0);
    assert.ok(summaries[0].lessons.includes("先写测试"));
  });

  it("extracts cognitive insights from archived report", () => {
    const dir = freshDir();
    writeSummary(dir,
      "# 我的总结\n\n" +
      "## 1. 战役概述\n\n| **任务** | X |\n内容\n\n" +
      "## 2. 认知迭代\n\n" +
      "发现了模块间隐藏的依赖关系。"
    );
    archiveReport(dir);
    const summaries = getRecentSummaries(dir, 1);
    assert.ok(summaries[0].cognitiveInsights.length > 0);
    assert.ok(summaries[0].cognitiveInsights.includes("隐藏的依赖"));
  });

  it("returns empty strings for missing sections", () => {
    const dir = freshDir();
    writeSummary(dir, "# 我的总结\n\n## 1. 战役概述\n\n| **任务** | X |\n内容");
    archiveReport(dir);
    const summaries = getRecentSummaries(dir, 1);
    assert.equal(summaries[0].lessons, "");
    assert.equal(summaries[0].cognitiveInsights, "");
  });
});
