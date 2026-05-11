import test from "node:test";
import assert from "node:assert/strict";
import {
  findSection,
  findNextSection,
  sectionBody,
} from "../../src/engine/markdown-anchor.js";

test("sectionBody: marker at file start", () => {
  const content = "## 4.5 变更计划声明\n\nhello\n";
  assert.equal(sectionBody(content, "## 4.5 变更计划声明"), "\n\nhello\n");
});

test("sectionBody: marker after a newline returns body up to next ##", () => {
  const content = "intro\n\n## 4.5 变更计划声明\nbody line\n\n## 5. 下一节\nnext\n";
  assert.equal(sectionBody(content, "## 4.5 变更计划声明"), "\nbody line\n");
});

test("sectionBody: ignores literal inside inline backticks (the two-time-proven bug)", () => {
  const content = [
    "## 2.3 引用段",
    "某些模块会 `indexOf('## 4.5 变更计划声明')` 误中反引号里的字面串。",
    "",
    "## 4.5 变更计划声明",
    "真正的变更计划在这里。",
    "",
  ].join("\n");
  const body = sectionBody(content, "## 4.5 变更计划声明");
  assert.ok(body);
  assert.ok(body.includes("真正的变更计划在这里"));
  assert.ok(!body.includes("某些模块"), "不应把 §2.3 的引用段算进来");
});

test("sectionBody: absent marker returns null", () => {
  const content = "## 其它章节\n内容\n";
  assert.equal(sectionBody(content, "## 4.5 变更计划声明"), null);
});

test("sectionBody: adjacent sections §4.5 and §4.6 separate cleanly", () => {
  const content = [
    "## 4.5 变更计划声明",
    "第 4.5 节内容",
    "",
    "## 4.6 下一节",
    "第 4.6 节内容",
  ].join("\n");
  const body = sectionBody(content, "## 4.5 变更计划声明");
  assert.ok(body);
  assert.ok(body.includes("第 4.5 节内容"));
  assert.ok(!body.includes("第 4.6 节内容"));
});

test("findSection: handles empty / non-string input gracefully", () => {
  assert.equal(findSection("", "## foo"), -1);
  assert.equal(findSection(null, "## foo"), -1);
  assert.equal(findSection(undefined, "## foo"), -1);
});

test("findNextSection: returns content.length when no next section", () => {
  const content = "## only\nbody\n";
  const from = content.indexOf("body");
  assert.equal(findNextSection(content, from), content.length);
});

test("findNextSection: stops at `\\n## ` with space, not at `\\n##anchor`", () => {
  const content = "## a\nbody\n## b\ntail";
  const from = content.indexOf("body");
  const end = findNextSection(content, from);
  assert.equal(content.slice(from, end), "body");
});
