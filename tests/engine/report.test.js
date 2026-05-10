import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { archiveReport, listReports, getRecentSummaries, parseSummaryErrorCases } from "../../src/engine/report.js";
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

describe("Report — parseSummaryErrorCases", () => {
  it("returns empty when section is missing", () => {
    assert.deepEqual(parseSummaryErrorCases("# No section here"), []);
  });

  it("returns empty when table has only header + separator", () => {
    const md =
      "## 6. 错误病例\n\n" +
      "| 阶段 | 错误描述 | 根因 | 解决方案 | 标签 |\n" +
      "| :--- | :--- | :--- | :--- | :--- |\n" +
      "| | | | | |\n";
    assert.deepEqual(parseSummaryErrorCases(md), []);
  });

  it("parses a well-formed data row", () => {
    const md =
      "## 6. 错误病例\n\n" +
      "| 阶段 | 错误描述 | 根因 | 解决方案 | 标签 |\n" +
      "| :--- | :--- | :--- | :--- | :--- |\n" +
      "| 4 | Hook 配置错误 | 缺 hooks 数组 | 补数组 | hook, claude-code |\n" +
      "\n## 7. Next\n";
    const cases = parseSummaryErrorCases(md);
    assert.equal(cases.length, 1);
    assert.deepEqual(cases[0], {
      phase: 4,
      description: "Hook 配置错误",
      rootCause: "缺 hooks 数组",
      resolution: "补数组",
      tags: ["hook", "claude-code"],
    });
  });

  it("parses multiple rows and mixed tag separators", () => {
    const md =
      "## 6. 错误病例\n\n" +
      "| 阶段 | 错误描述 | 根因 | 解决方案 | 标签 |\n" +
      "| :--- | :--- | :--- | :--- | :--- |\n" +
      "| 1 | 调研不足 | 没看文档 | 先读文档 | 调研、flow |\n" +
      "| 3 | 越界修改 | 没锁 ATTACK_ZONE | 回滚 | lockdown 纪律 |\n" +
      "\n---\n";
    const cases = parseSummaryErrorCases(md);
    assert.equal(cases.length, 2);
    assert.deepEqual(cases[0].tags, ["调研", "flow"]);
    assert.deepEqual(cases[1].tags, ["lockdown", "纪律"]);
  });

  it("skips rows with empty description", () => {
    const md =
      "## 6. 错误病例\n\n" +
      "| 阶段 | 错误描述 | 根因 | 解决方案 | 标签 |\n" +
      "| :--- | :--- | :--- | :--- | :--- |\n" +
      "| 1 |  | some cause | some fix | tag1 |\n" +
      "| 2 | real one | rc | res | t |\n";
    const cases = parseSummaryErrorCases(md);
    assert.equal(cases.length, 1);
    assert.equal(cases[0].description, "real one");
  });

  it("defaults phase to 0 when not numeric", () => {
    const md =
      "## 6. 错误病例\n\n" +
      "| 阶段 | 错误描述 | 根因 | 解决方案 | 标签 |\n" +
      "| :--- | :--- | :--- | :--- | :--- |\n" +
      "| - | desc only | | | |\n";
    const cases = parseSummaryErrorCases(md);
    assert.equal(cases.length, 1);
    assert.equal(cases[0].phase, 0);
    assert.deepEqual(cases[0].tags, []);
  });

  it("ignores inline-code mentions of the section heading", () => {
    const md =
      "Text that mentions `## 6. 错误病例` inline — must not be treated as the section.\n\n" +
      "## 6. 错误病例\n\n" +
      "| 阶段 | 错误描述 | 根因 | 解决方案 | 标签 |\n" +
      "| :--- | :--- | :--- | :--- | :--- |\n" +
      "| 2 | real | cause | fix | tag |\n";
    const cases = parseSummaryErrorCases(md);
    assert.equal(cases.length, 1);
    assert.equal(cases[0].description, "real");
  });

  it("does not drop data rows whose description happens to quote 阶段/错误描述", () => {
    const md =
      "## 6. 错误病例\n\n" +
      "| 阶段 | 错误描述 | 根因 | 解决方案 | 标签 |\n" +
      "| :--- | :--- | :--- | :--- | :--- |\n" +
      "| 3 | Summary 表头 阶段 被当成数据，错误描述解析错误 | 正则对 CJK 不生效 | 改用 includes | parser |\n" +
      "| 3 | 另一条无关行 | 原因 | 办法 | x |\n";
    const cases = parseSummaryErrorCases(md);
    assert.equal(cases.length, 2);
    assert.ok(cases[0].description.includes("Summary 表头"));
  });
});

describe("Report — archiveReport ingests error cases", () => {
  it("populates .stw/error-registry.json from the Summary table", () => {
    const dir = freshDir();
    writeSummary(dir,
      "# 我的总结\n\n| **任务** | T6 测试 |\n有内容。\n\n" +
      "## 6. 错误病例\n\n" +
      "| 阶段 | 错误描述 | 根因 | 解决方案 | 标签 |\n" +
      "| :--- | :--- | :--- | :--- | :--- |\n" +
      "| 3 | 文件越界 | 忘记声明 ATTACK_ZONE | 补声明 | lockdown |\n" +
      "| 4 | 测试失败 | 断言错误 | 修断言 | test |\n"
    );
    const result = archiveReport(dir);
    assert.equal(result.ok, true);
    assert.equal(result.ingested, 2);

    const regPath = join(dir, ".stw", "error-registry.json");
    assert.ok(existsSync(regPath));
    const registry = JSON.parse(readFileSync(regPath, "utf-8"));
    assert.equal(registry.length, 2);
    assert.equal(registry[0].description, "文件越界");
    assert.equal(registry[0].phase, 3);
    assert.deepEqual(registry[1].tags, ["test"]);
  });

  it("reports ingested:0 when no error cases in Summary", () => {
    const dir = freshDir();
    writeSummary(dir, "# S\n\n| **任务** | 无错误 |\n正常完成。");
    const result = archiveReport(dir);
    assert.equal(result.ok, true);
    assert.equal(result.ingested, 0);
    assert.ok(!existsSync(join(dir, ".stw", "error-registry.json")));
  });
});
