import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { join } from "node:path";
import { writeFileSync } from "node:fs";

import { freshDir, writeStwFile, writePassingAnalysis } from "../test-helper.js";
import { assessConfidence, readSelfRating } from "../../src/engine/confidence-gate.js";

function writeProgress(dir, taskDescription) {
  writeFileSync(
    join(dir, ".stw", ".progress.json"),
    JSON.stringify({ phase: 1, taskDescription })
  );
}

describe("assessConfidence", () => {
  it("returns low score for empty Analysis-Template.md", () => {
    const dir = freshDir();
    writeStwFile(dir, "Analysis-Template.md", "# Empty\n");
    const { ready, score } = assessConfidence(dir);
    assert.ok(score < 5);
    assert.strictEqual(ready, false);
  });

  it("returns high score for completely filled template", () => {
    const dir = freshDir();
    writePassingAnalysis(dir);
    const { ready, score } = assessConfidence(dir);
    assert.ok(score >= 6);
    assert.strictEqual(ready, true);
  });

  it("flags missing style reconnaissance section", () => {
    const dir = freshDir();
    // Has all sections except 项目风格侦察
    writeStwFile(dir, "Analysis-Template.md",
      "## 0. 战前评估\n8/10\n\n" +
      "## 1. 任务背景\nEnough context here for the task.\n\n" +
      "## 2.1 去粗 — 过滤噪音\nFiltered content about files here.\n\n" +
      "## 2.2 取精 — 提取精华\nKey architectural decisions found.\n\n" +
      "## 2.3 去伪 — 消除假象\nMisleading configs identified.\n\n" +
      "## 2.4 存真 — 保留真相\nActual behavior described (state-machine.js:130).\n\n" +
      "## 2.5 由此及彼 — 追溯关联\nCall chain fully documented.\n\n" +
      "## 2.6 由表及里 — 直达根因\nRoot cause identified clearly.\n\n" +
      "## 4. 初步方案\nImplementation approach outlined here (lockdown.js:45).\n"
    );
    const { score, gaps } = assessConfidence(dir);
    assert.ok(gaps.some((g) => g.includes("项目风格侦察")), "should flag missing style recon: " + JSON.stringify(gaps));
  });

  it("flags insufficient source citations (反对主观主义)", () => {
    const dir = freshDir();
    // All sections filled, but only 1 citation
    writeStwFile(dir, "Analysis-Template.md",
      "## 0. 战前评估\n8/10\n\n" +
      "## 1.5 项目风格侦察（从群众中来）\nScanned project patterns thoroughly enough for passing.\n\n" +
      "## 2.1 去粗 — 过滤噪音\nFiltered content about files here.\n\n" +
      "## 2.2 取精 — 提取精华\nKey architectural decisions found.\n\n" +
      "## 2.3 去伪 — 消除假象\nMisleading configs identified.\n\n" +
      "## 2.4 存真 — 保留真相\nActual behavior described with only one ref (state-machine.js:130).\n\n" +
      "## 2.5 由此及彼 — 追溯关联\nCall chain fully documented.\n\n" +
      "## 2.6 由表及里 — 直达根因\nRoot cause identified clearly.\n\n" +
      "## 4. 初步方案\nImplementation approach.\n"
    );
    const { gaps } = assessConfidence(dir);
    assert.ok(gaps.some((g) => g.includes("源码引用")), "should flag insufficient citations: " + JSON.stringify(gaps));
  });

  it("returns score 0 when Analysis-Template.md missing", () => {
    const dir = freshDir();
    const { ready, score, gaps } = assessConfidence(dir);
    assert.strictEqual(score, 0);
    assert.strictEqual(ready, false);
    assert.ok(gaps.length > 0);
    assert.ok(gaps.some((g) => g.includes("不存在")));
  });
});

  it("flags missing change plan section", () => {
    const dir = freshDir();
    // Has all sections except 变更计划声明
    writeStwFile(dir, "Analysis-Template.md",
      "## 0. 战前评估\n8/10\n\n" +
      "## 1. 任务背景\nEnough context here for the task.\n\n" +
      "## 1.5 项目风格侦察（从群众中来）\nScanned project patterns thoroughly enough for passing.\n\n" +
      "## 2.1 去粗 — 过滤噪音\nFiltered content about files here.\n\n" +
      "## 2.2 取精 — 提取精华\nKey architectural decisions found.\n\n" +
      "## 2.3 去伪 — 消除假象\nMisleading configs identified.\n\n" +
      "## 2.4 存真 — 保留真相\nActual behavior described (state-machine.js:130) with second ref (lockdown.js:45).\n\n" +
      "## 2.5 由此及彼 — 追溯关联\nCall chain fully documented.\n\n" +
      "## 2.6 由表及里 — 直达根因\nRoot cause identified clearly.\n\n" +
      "## 4. 初步方案\nImplementation approach outlined here (lockdown.js:45).\n"
    );
    const { gaps } = assessConfidence(dir);
    assert.ok(gaps.some((g) => g.includes("变更计划声明")), "should flag missing change plan: " + JSON.stringify(gaps));
  });

describe("assessConfidence — T10 调查方法自审 + 有的放矢", () => {
  it("flags empty §0.5 table as 反对本本主义 failure", () => {
    const dir = freshDir();
    writePassingAnalysis(dir);
    // Overwrite with §0.5 table only having header, no data row
    writeStwFile(dir, "Analysis-Template.md",
      "## 0. 战前评估\n8/10\n\n" +
      "## 0.5 需求澄清 — 向用户提问\n" +
      "| # | 问题 | 用户回答 |\n" +
      "| :--- | :--- | :--- |\n\n" +
      "## 1. 任务背景\nBackground content filled out enough to exceed twenty characters.\n\n" +
      "## 1.0 表层需求\nHidden constraints considered thoroughly during analysis.\n\n" +
      "## 1.5 项目风格侦察\nProject patterns scanned deeply enough to satisfy the gate.\n\n" +
      "## 1.6 外部调研\nResearch notes\n" +
      "| 方向 | 搜索结果 | 可借鉴 |\n" +
      "| :--- | :--- | :--- |\n" +
      "| 毛选 | 《反对本本主义》 | 表格强检 |\n\n" +
      "## 2.1 去粗\nNoise filtered for relevant files here.\n\n" +
      "## 2.2 取精\nExtracted architectural decisions here for the team.\n\n" +
      "## 2.3 去伪\nFalse leads identified and removed from analysis.\n\n" +
      "## 2.4 存真\nTruth preserved (state-machine.js:10) and (lockdown.js:1).\n\n" +
      "## 2.5 由此及彼\nCall chain traced for all relevant modules.\n\n" +
      "## 2.6 由表及里\nRoot cause found and hidden constraints listed.\n\n" +
      "## 4. 初步方案\nPlan outlined clearly enough to pass this gate.\n\n" +
      "## 4.5 变更计划声明\n| src/x.js | fix | reason long enough |\n"
    );
    const { gaps } = assessConfidence(dir);
    assert.ok(
      gaps.some((g) => g.includes("§0.5") && g.includes("反对本本主义")),
      "should flag §0.5 empty table: " + JSON.stringify(gaps)
    );
  });

  it("flags empty §1.6 table as 反对本本主义 failure", () => {
    const dir = freshDir();
    writeStwFile(dir, "Analysis-Template.md",
      "## 0. 战前评估\n8/10\n\n" +
      "## 0.5 需求澄清\n" +
      "| # | 问题 | 回答 |\n" +
      "| :--- | :--- | :--- |\n" +
      "| 1 | 问题A | 回答A |\n\n" +
      "## 1. 任务背景\nBackground content here filled adequately.\n\n" +
      "## 1.0 表层需求\nHidden constraints fully considered here.\n\n" +
      "## 1.5 项目风格侦察\nProject patterns scanned deeply enough.\n\n" +
      "## 1.6 外部调研\nNo data row — only a header:\n" +
      "| 方向 | 搜索结果 | 可借鉴 |\n" +
      "| :--- | :--- | :--- |\n\n" +
      "## 2.1 去粗\nNoise filtered for relevant files here.\n\n" +
      "## 2.2 取精\nExtracted decisions fully for the team.\n\n" +
      "## 2.3 去伪\nFalse leads removed from analysis.\n\n" +
      "## 2.4 存真\nTruth preserved (state-machine.js:10) and (lockdown.js:1).\n\n" +
      "## 2.5 由此及彼\nCall chain traced for all relevant modules.\n\n" +
      "## 2.6 由表及里\nRoot cause found and constraints listed.\n\n" +
      "## 4. 初步方案\nPlan outlined clearly enough to pass.\n\n" +
      "## 4.5 变更计划声明\n| src/x.js | fix | reason |\n"
    );
    const { gaps } = assessConfidence(dir);
    assert.ok(
      gaps.some((g) => g.includes("§1.6") && g.includes("反对本本主义")),
      "should flag §1.6 empty table: " + JSON.stringify(gaps)
    );
  });

  it("flags missing separator row — 封死省略分隔符绕过", () => {
    const dir = freshDir();
    // Header row without markdown separator — tableHasFilledRow must reject
    writeStwFile(dir, "Analysis-Template.md",
      "## 0. 战前评估\n8/10\n\n" +
      "## 0.5 需求澄清\n| # | 问题 | 用户回答 |\n| 1 | Q | A |\n\n" +
      "## 1. 任务背景\nBackground content here.\n\n" +
      "## 1.0 表层需求\nHidden needs.\n\n" +
      "## 1.5 项目风格侦察\nProject patterns.\n\n" +
      "## 1.6 外部调研\nResearch.\n\n" +
      "## 2.1 去粗\n.\n\n## 2.2 取精\n.\n\n## 2.3 去伪\n.\n\n" +
      "## 2.4 存真\nref (a.js:1) (b.js:2)\n\n## 2.5 由此及彼\n.\n\n" +
      "## 2.6 由表及里\n.\n\n## 4. 初步方案\n.\n\n## 4.5 变更计划声明\n.\n"
    );
    const { gaps } = assessConfidence(dir);
    assert.ok(
      gaps.some((g) => g.includes("§0.5") && g.includes("反对本本主义")),
      "should reject table missing separator row: " + JSON.stringify(gaps)
    );
  });

  it("passes §0.5/§1.6 when both tables have a filled 3-column row", () => {
    const dir = freshDir();
    writePassingAnalysis(dir);
    const { gaps } = assessConfidence(dir);
    assert.ok(
      !gaps.some((g) => g.includes("反对本本主义")),
      "should not flag any 反对本本主义 gap: " + JSON.stringify(gaps)
    );
  });

  it("rejects HTML-comment-only cells (nonEmpty count)", () => {
    const dir = freshDir();
    writeStwFile(dir, "Analysis-Template.md",
      "## 0. 战前评估\n8/10\n\n" +
      "## 0.5 需求澄清\n" +
      "| # | 问题 | 回答 |\n" +
      "| :--- | :--- | :--- |\n" +
      "| 1 | 问题 | <!-- TODO --> |\n\n" +
      "## 1. 任务背景\nbg content long enough.\n\n## 1.0 表层需求\nh.\n\n" +
      "## 1.5 项目风格侦察\np.\n\n## 1.6 外部调研\nr.\n\n" +
      "## 2.1 去粗\n.\n\n## 2.2 取精\n.\n\n## 2.3 去伪\n.\n\n" +
      "## 2.4 存真\nref (a.js:1) (b.js:2)\n\n## 2.5 由此及彼\n.\n\n" +
      "## 2.6 由表及里\n.\n\n## 4. 初步方案\n.\n\n## 4.5 变更计划声明\n.\n"
    );
    const { gaps } = assessConfidence(dir);
    assert.ok(
      gaps.some((g) => g.includes("§0.5") && g.includes("反对本本主义")),
      "HTML-only cell should count as empty: " + JSON.stringify(gaps)
    );
  });

  it("flags off-target analysis when taskDescription keywords miss", () => {
    const dir = freshDir();
    writePassingAnalysis(dir);
    writeProgress(dir, "集成 hook 到 Claude Code PostToolUse 钩子");
    const { gaps } = assessConfidence(dir);
    assert.ok(
      gaps.some((g) => g.includes("有的放矢") && g.includes("改造我们的学习")),
      "off-target analysis should be flagged: " + JSON.stringify(gaps)
    );
  });

  it("passes 有的放矢 when analysis mentions majority task keywords", () => {
    const dir = freshDir();
    writePassingAnalysis(dir);
    // writePassingAnalysis §4 contains "Proposed solution approach with clear
    // implementation path outlined here." We build a task whose keywords are
    // dense in that text.
    writeProgress(dir, "Proposed solution approach implementation path");
    const { gaps } = assessConfidence(dir);
    assert.ok(
      !gaps.some((g) => g.includes("有的放矢")),
      "keywords-in-plan analysis should pass: " + JSON.stringify(gaps)
    );
  });

  it("skips 有的放矢 when .progress.json missing (no gap, no denominator penalty)", () => {
    const dir = freshDir();
    writePassingAnalysis(dir);
    const { gaps, score } = assessConfidence(dir);
    assert.ok(
      !gaps.some((g) => g.includes("有的放矢")),
      "should skip targeted check: " + JSON.stringify(gaps)
    );
    assert.ok(score >= 6, "score should still clear threshold: " + score);
  });

  it("skips 有的放矢 when taskDescription is empty string", () => {
    const dir = freshDir();
    writePassingAnalysis(dir);
    writeProgress(dir, "");
    const { gaps } = assessConfidence(dir);
    assert.ok(
      !gaps.some((g) => g.includes("有的放矢")),
      "should skip targeted check on empty task: " + JSON.stringify(gaps)
    );
  });

  it("skips 有的放矢 when taskDescription has <2 extractable keywords", () => {
    const dir = freshDir();
    writePassingAnalysis(dir);
    // Pure stopwords only — no keyword survives filtering
    writeProgress(dir, "实现 优化");
    const { gaps } = assessConfidence(dir);
    assert.ok(
      !gaps.some((g) => g.includes("有的放矢")),
      "<2 keywords should skip: " + JSON.stringify(gaps)
    );
  });

  it("stopword filter excludes verbs/modals (STW 语境)", () => {
    // Task: "实现 + 系统" — 实现 is a stopword, 系统 is NOT (ruled领域关键词).
    // Analysis mentions 系统 → hit rate 1/1 = 100% → no gap.
    const dir = freshDir();
    writeStwFile(dir, "Analysis-Template.md",
      "## 0. 战前评估\n8/10\n\n" +
      "## 0.5 需求澄清\n| # | Q | A |\n| :--- | :--- | :--- |\n| 1 | a | b |\n\n" +
      "## 1. 任务背景\n这里分析系统相关的内容，讲述系统运行。\n\n" +
      "## 1.0 表层需求\nHidden constraints detailed enough.\n\n" +
      "## 1.5 项目风格侦察\nProject patterns scanned well.\n\n" +
      "## 1.6 外部调研\nr\n| a | b | c |\n| :--- | :--- | :--- |\n| 1 | 2 | 3 |\n\n" +
      "## 2.1 去粗\n.\n\n## 2.2 取精\n.\n\n## 2.3 去伪\n.\n\n" +
      "## 2.4 存真\n(a.js:1) (b.js:2) 系统 descriptions.\n\n## 2.5 由此及彼\n.\n\n" +
      "## 2.6 由表及里\n.\n\n## 4. 初步方案\n系统层的改造方案 written here.\n\n" +
      "## 4.5 变更计划声明\n| src/x.js | fix | ok |\n"
    );
    writeProgress(dir, "实现 系统");
    const { gaps } = assessConfidence(dir);
    assert.ok(
      !gaps.some((g) => g.includes("有的放矢")),
      "系统 should survive stopword filter and hit: " + JSON.stringify(gaps)
    );
  });

  it("denominator: targeted skip uses 14, non-skip uses 15", () => {
    // With all 14 structural steps passing + citation ok:
    //   skip scenario: filled=14/14 → score=10
    //   non-skip + miss: filled=14/15 → score ~9 (still passes default 6)
    const dirSkip = freshDir();
    writePassingAnalysis(dirSkip);
    const skipResult = assessConfidence(dirSkip);
    assert.strictEqual(skipResult.score, 10, "skip case = 14/14");

    const dirHit = freshDir();
    writePassingAnalysis(dirHit);
    writeProgress(dirHit, "Proposed solution approach implementation path");
    const hitResult = assessConfidence(dirHit);
    assert.strictEqual(hitResult.score, 10, "non-skip + all hit = 15/15");
  });

  it("malformed .progress.json is tolerated (skip, no throw)", () => {
    const dir = freshDir();
    writePassingAnalysis(dir);
    writeFileSync(join(dir, ".stw", ".progress.json"), "{not valid json");
    const { gaps, score } = assessConfidence(dir);
    assert.ok(
      !gaps.some((g) => g.includes("有的放矢")),
      "malformed progress should skip: " + JSON.stringify(gaps)
    );
    assert.ok(score >= 6);
  });
});


describe("readSelfRating", () => {
  it("returns null when section 0 missing", () => {
    const dir = freshDir();
    writeStwFile(dir, "Analysis-Template.md", "## 1. 任务背景\nSome content here.\n");
    assert.strictEqual(readSelfRating(dir), null);
  });

  it("parses X/10 format", () => {
    const dir = freshDir();
    writeStwFile(dir, "Analysis-Template.md", "## 0. 战前评估\n7/10\n\n## 1. 任务背景\nSome content here.\n");
    assert.strictEqual(readSelfRating(dir), 7);
  });
});
