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
