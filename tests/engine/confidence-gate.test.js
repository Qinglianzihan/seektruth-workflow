import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { join } from "node:path";

import { freshDir, writeStwFile, writePassingAnalysis } from "../test-helper.js";
import { assessConfidence, readSelfRating } from "../../src/engine/confidence-gate.js";

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
