import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { freshDir, writeStwFile } from "../test-helper.js";
import { injectSimilarCases } from "../../src/engine/analysis-injector.js";

const ANALYSIS = "Analysis-Template.md";
const BEGIN = "<!-- AUTO-INJECTED:similar-cases:BEGIN -->";
const END = "<!-- AUTO-INJECTED:similar-cases:END -->";
const HEADER = "# 敌情分析报告\n\n> **阶段 1：调查研究** | 日期：2026-05-10\n\n---\n\n## 1. 任务背景\nUser content.\n";

describe("injectSimilarCases", () => {
  it("returns ok:false when Analysis-Template.md does not exist", () => {
    const dir = freshDir();
    const result = injectSimilarCases(dir, [{ description: "x" }]);
    assert.equal(result.ok, false);
  });

  it("inserts a block after the H1/blockquote header on first injection", () => {
    const dir = freshDir();
    writeStwFile(dir, ANALYSIS, HEADER);

    const result = injectSimilarCases(dir, [
      { phase: 4, description: "Hook 格式错", rootCause: "缺 hooks 数组", resolution: "补数组", tags: ["hook"] },
    ]);
    assert.ok(result.ok);
    assert.equal(result.injected, 1);

    const content = readFileSync(join(dir, ".stw", ANALYSIS), "utf-8");
    assert.ok(content.includes(BEGIN));
    assert.ok(content.includes(END));
    assert.ok(content.includes("Hook 格式错"));
    assert.ok(content.includes("hook"));
    // Block must appear BEFORE user content
    assert.ok(content.indexOf(BEGIN) < content.indexOf("## 1. 任务背景"));
    // User content must be preserved
    assert.ok(content.includes("User content."));
  });

  it("is idempotent: second injection replaces instead of stacking", () => {
    const dir = freshDir();
    writeStwFile(dir, ANALYSIS, HEADER);
    injectSimilarCases(dir, [{ description: "Old case" }]);
    injectSimilarCases(dir, [{ description: "New case one" }, { description: "New case two" }]);

    const content = readFileSync(join(dir, ".stw", ANALYSIS), "utf-8");
    const beginCount = (content.match(/AUTO-INJECTED:similar-cases:BEGIN/g) || []).length;
    const endCount = (content.match(/AUTO-INJECTED:similar-cases:END/g) || []).length;
    assert.equal(beginCount, 1);
    assert.equal(endCount, 1);
    assert.ok(content.includes("New case one"));
    assert.ok(content.includes("New case two"));
    assert.ok(!content.includes("Old case"));
  });

  it("empty cases array clears an existing block and reports cleared:true", () => {
    const dir = freshDir();
    writeStwFile(dir, ANALYSIS, HEADER);
    injectSimilarCases(dir, [{ description: "Case to clear" }]);

    const result = injectSimilarCases(dir, []);
    assert.ok(result.ok);
    assert.equal(result.injected, 0);
    assert.equal(result.cleared, true);

    const content = readFileSync(join(dir, ".stw", ANALYSIS), "utf-8");
    assert.ok(!content.includes(BEGIN));
    assert.ok(!content.includes(END));
    assert.ok(!content.includes("Case to clear"));
    assert.ok(content.includes("User content."));
  });

  it("empty cases with no existing block is a no-op (cleared:false)", () => {
    const dir = freshDir();
    writeStwFile(dir, ANALYSIS, HEADER);
    const before = readFileSync(join(dir, ".stw", ANALYSIS), "utf-8");

    const result = injectSimilarCases(dir, []);
    assert.ok(result.ok);
    assert.equal(result.cleared, false);

    const after = readFileSync(join(dir, ".stw", ANALYSIS), "utf-8");
    assert.equal(after, before);
  });

  it("does not touch existing user content outside the fence", () => {
    const dir = freshDir();
    const userMarker = "USER_HAND_EDIT_MARKER_UNIQUE";
    writeStwFile(dir, ANALYSIS, HEADER + "\n" + userMarker + "\n");

    injectSimilarCases(dir, [{ description: "Some case" }]);
    const c1 = readFileSync(join(dir, ".stw", ANALYSIS), "utf-8");
    assert.ok(c1.includes(userMarker));

    injectSimilarCases(dir, [{ description: "Another case" }]);
    const c2 = readFileSync(join(dir, ".stw", ANALYSIS), "utf-8");
    assert.ok(c2.includes(userMarker));
  });

  it("omits missing fields gracefully when rendering a case", () => {
    const dir = freshDir();
    writeStwFile(dir, ANALYSIS, HEADER);
    const result = injectSimilarCases(dir, [{ description: "Bare case" }]);
    assert.ok(result.ok);

    const content = readFileSync(join(dir, ".stw", ANALYSIS), "utf-8");
    assert.ok(content.includes("Bare case"));
    // No "根因：" or "解决：" or "标签：" lines when fields are missing
    const blockStart = content.indexOf(BEGIN);
    const blockEnd = content.indexOf(END);
    const block = content.slice(blockStart, blockEnd);
    assert.ok(!block.includes("根因："));
    assert.ok(!block.includes("解决："));
    assert.ok(!block.includes("标签："));
  });
});
