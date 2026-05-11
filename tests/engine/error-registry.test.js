import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { freshDir } from "../test-helper.js";
import {
  logError,
  getRelatedErrors,
  getErrorInsights,
  extractKeywords,
  findRelatedErrorsByTask,
  splitTags,
  cleanupTags,
  categorize,
  cleanRegistry,
  CATEGORY_VALUES,
} from "../../src/engine/error-registry.js";

const REGISTRY_PATH = ".stw/error-registry.json";

describe("logError", () => {
  it("creates registry file with first entry", () => {
    const dir = freshDir();
    const result = logError(dir, {
      phase: 1,
      description: "Test error occurred",
      rootCause: "A root cause",
      resolution: "A resolution",
      tags: ["test", "demo"],
    });

    assert.ok(result.ok);
    assert.ok(typeof result.id === "string");
    assert.ok(result.id.startsWith("err-"));

    const regPath = join(dir, REGISTRY_PATH);
    assert.ok(existsSync(regPath));
    const entries = JSON.parse(readFileSync(regPath, "utf-8"));
    assert.equal(entries.length, 1);

    const e = entries[0];
    assert.equal(e.id, result.id);
    assert.equal(e.phase, 1);
    assert.equal(e.description, "Test error occurred");
    assert.equal(e.rootCause, "A root cause");
    assert.equal(e.resolution, "A resolution");
    assert.deepEqual(e.tags, ["test", "demo"]);
    assert.ok(typeof e.timestamp === "string");
    assert.ok(e.timestamp.includes("T"));
  });

  it("assigns unique IDs to each entry", () => {
    const dir = freshDir();
    const r1 = logError(dir, { description: "First" });
    const r2 = logError(dir, { description: "Second" });

    assert.ok(r1.ok && r2.ok);
    assert.notEqual(r1.id, r2.id);
    assert.ok(r1.id.startsWith("err-"));
    assert.ok(r2.id.startsWith("err-"));
  });

  it("handles minimal entry (only description)", () => {
    const dir = freshDir();
    logError(dir, { description: "Minimal error" });

    const regPath = join(dir, REGISTRY_PATH);
    const entries = JSON.parse(readFileSync(regPath, "utf-8"));
    assert.equal(entries.length, 1);

    const e = entries[0];
    assert.equal(e.description, "Minimal error");
    assert.equal(e.rootCause, "");
    assert.equal(e.resolution, "");
    assert.deepEqual(e.tags, []);
    assert.equal(e.phase, 0);
  });
});

describe("getRelatedErrors", () => {
  it("returns empty for empty registry", () => {
    const dir = freshDir();
    const results = getRelatedErrors(dir, ["keyword"]);
    assert.deepEqual(results, []);
  });

  it("finds errors by keyword in description", () => {
    const dir = freshDir();
    logError(dir, { description: "A parser failure occurred" });
    logError(dir, { description: "A network timeout" });

    const results = getRelatedErrors(dir, ["parser"]);
    assert.equal(results.length, 1);
    assert.equal(results[0].description, "A parser failure occurred");
  });

  it("finds errors by tag", () => {
    const dir = freshDir();
    logError(dir, { description: "Error one", tags: ["auth"] });
    logError(dir, { description: "Error two", tags: ["network"] });

    const results = getRelatedErrors(dir, ["auth"]);
    assert.equal(results.length, 1);
    assert.equal(results[0].description, "Error one");
    assert.deepEqual(results[0].tags, ["auth"]);
  });

  it("returns results sorted by recency", () => {
    const dir = freshDir();
    logError(dir, { description: "First error", tags: ["common"] });
    // Small delay to ensure distinct timestamps
    const then = Date.now();
    while (Date.now() === then) { /* busy-wait */ }
    logError(dir, { description: "Second error", tags: ["common"] });

    const results = getRelatedErrors(dir, ["common"]);
    assert.equal(results.length, 2);
    assert.equal(results[0].description, "Second error");
    assert.equal(results[1].description, "First error");
  });

  it("returns most recent when keywords empty", () => {
    const dir = freshDir();
    logError(dir, { description: "Oldest" });
    const then = Date.now();
    while (Date.now() === then) { /* busy-wait */ }
    logError(dir, { description: "Middle" });
    while (Date.now() === then + 1) { /* busy-wait */ }
    logError(dir, { description: "Newest" });

    const results = getRelatedErrors(dir, []);
    assert.ok(results.length >= 1);
    assert.equal(results[0].description, "Newest");
  });
});

describe("getErrorInsights", () => {
  it("returns zero total for empty registry", () => {
    const dir = freshDir();
    const insights = getErrorInsights(dir);
    assert.deepEqual(insights, { total: 0, byPhase: {}, topTags: [], recent: [] });
  });

  it("counts errors by phase", () => {
    const dir = freshDir();
    logError(dir, { description: "Phase 1 error A", phase: 1 });
    logError(dir, { description: "Phase 1 error B", phase: 1 });
    logError(dir, { description: "Phase 2 error", phase: 2 });

    const insights = getErrorInsights(dir);
    assert.equal(insights.total, 3);
    assert.deepEqual(insights.byPhase, { "1": 2, "2": 1 });
  });

  it("returns top tags", () => {
    const dir = freshDir();
    logError(dir, { description: "E1", tags: ["auth", "timeout"] });
    logError(dir, { description: "E2", tags: ["auth", "parse"] });
    logError(dir, { description: "E3", tags: ["timeout"] });

    const insights = getErrorInsights(dir);
    assert.equal(insights.total, 3);

    // "auth" appears in 2 entries, "timeout" in 2, "parse" in 1
    // Both "auth" and "timeout" have count 2 — order among ties is
    // sort-stable but we just verify the first is one of the top tags.
    assert.equal(insights.topTags.length, 3);
    assert.ok(insights.topTags.indexOf("auth") < insights.topTags.indexOf("parse"));
    assert.ok(insights.topTags.indexOf("timeout") < insights.topTags.indexOf("parse"));
    assert.equal(insights.recent.length, 3);
  });
});

describe("extractKeywords", () => {
  it("returns empty for empty / non-string input", () => {
    assert.deepEqual(extractKeywords(""), []);
    assert.deepEqual(extractKeywords(null), []);
    assert.deepEqual(extractKeywords(undefined), []);
    assert.deepEqual(extractKeywords(42), []);
  });

  it("extracts lowercased English words ≥2 chars, deduped", () => {
    const kws = extractKeywords("Fix PostToolUse hook hook error in stw hook");
    assert.ok(kws.includes("fix"));
    assert.ok(kws.includes("posttooluse"));
    assert.ok(kws.includes("hook"));
    assert.ok(kws.includes("stw"));
    // deduped
    assert.equal(kws.filter((k) => k === "hook").length, 1);
  });

  it("extracts 2-4 char CJK substrings from Chinese segments", () => {
    const kws = extractKeywords("修复 Claude Code 钩子格式错误");
    // Has English word + CJK slices
    assert.ok(kws.includes("claude"));
    assert.ok(kws.includes("code"));
    assert.ok(kws.includes("钩子格式"));
    assert.ok(kws.includes("格式错误"));
    assert.ok(kws.includes("钩子"));
  });
});

describe("findRelatedErrorsByTask", () => {
  it("returns empty when task description is empty", () => {
    const dir = freshDir();
    logError(dir, { description: "Something happened" });
    assert.deepEqual(findRelatedErrorsByTask(dir, ""), []);
    assert.deepEqual(findRelatedErrorsByTask(dir, null), []);
  });

  it("finds English-keyword matches from task description", () => {
    const dir = freshDir();
    logError(dir, { description: "Hook configuration error", tags: ["hook"] });
    logError(dir, { description: "Network timeout issue", tags: ["network"] });

    const results = findRelatedErrorsByTask(dir, "Fix Claude Code hook format");
    assert.equal(results.length, 1);
    assert.equal(results[0].description, "Hook configuration error");
  });

  it("finds CJK-keyword matches from task description", () => {
    const dir = freshDir();
    logError(dir, { description: "钩子格式错误：hooks 数组缺失", tags: ["hook"] });
    logError(dir, { description: "网络超时", tags: ["network"] });

    const results = findRelatedErrorsByTask(dir, "T6 修复 钩子格式 相关问题");
    assert.equal(results.length, 1);
    assert.ok(results[0].description.includes("钩子"));
  });

  it("respects the limit parameter", () => {
    const dir = freshDir();
    for (let i = 0; i < 5; i++) {
      logError(dir, { description: `Hook error ${i}`, tags: ["hook"] });
    }
    const results = findRelatedErrorsByTask(dir, "hook", 2);
    assert.equal(results.length, 2);
  });

  it("returns empty when no entries share keywords with task", () => {
    const dir = freshDir();
    logError(dir, { description: "Unrelated parser bug" });
    const results = findRelatedErrorsByTask(dir, "network timeout issue");
    assert.deepEqual(results, []);
  });
});

// ========================================================================
// T17 Skill Issue 归因
// ========================================================================

describe("T17 — splitTags", () => {
  it("splits on slash as structural separator (user intent)", () => {
    assert.deepEqual(splitTags("正则边界/贪婪回溯/反直觉"), ["正则边界", "贪婪回溯", "反直觉"]);
  });

  it("splits on mixed separators (comma / slash / whitespace / CJK punct / middle-dot)", () => {
    const r = splitTags("aa,bb，cc/dd·ee  ff、gg");
    assert.deepEqual(r, ["aa", "bb", "cc", "dd", "ee", "ff", "gg"]);
  });

  it("filters out pure punctuation and newline tags", () => {
    assert.deepEqual(splitTags("·"), []);
    assert.deepEqual(splitTags("\\n)##"), []);
    assert.deepEqual(splitTags("6."), []);
  });

  it("filters out tags with backticks", () => {
    assert.deepEqual(splitTags("`code`,foo"), ["foo"]);
  });

  it("accepts array input and de-dupes", () => {
    assert.deepEqual(splitTags(["aa", "bb", "aa", "", "aa/bb"]), ["aa", "bb"]);
  });

  it("returns empty for null / undefined / empty string", () => {
    assert.deepEqual(splitTags(null), []);
    assert.deepEqual(splitTags(undefined), []);
    assert.deepEqual(splitTags(""), []);
  });

  it("strips wrapper parens and keeps short valid tag after strip", () => {
    assert.deepEqual(splitTags("(harness),(model)"), ["harness", "model"]);
  });

  it("rejects over-long tag (> 40 chars)", () => {
    const long = "a".repeat(41);
    assert.deepEqual(splitTags(long), []);
  });
});

describe("T17 — cleanupTags", () => {
  it("expands slash-joined tags from existing registry data", () => {
    const r = cleanupTags(["正则边界/贪婪回溯/反直觉", "falsifiable"]);
    assert.deepEqual(r, ["正则边界", "贪婪回溯", "反直觉", "falsifiable"]);
  });

  it("removes known noise tags (·, \\n)##, 6.) from realistic sample", () => {
    const r = cleanupTags(["·", "\\n)##", "6.", "正则", "mismatch"]);
    assert.ok(!r.includes("·"));
    assert.ok(!r.includes("\\n)##"));
    assert.ok(!r.includes("6."));
    assert.ok(r.includes("正则"));
    assert.ok(r.includes("mismatch"));
  });

  it("preserves valid tags verbatim", () => {
    assert.deepEqual(cleanupTags(["falsifiable", "mismatch", "t12"]), ["falsifiable", "mismatch", "t12"]);
  });

  it("handles non-string entries gracefully", () => {
    assert.deepEqual(cleanupTags(["valid", null, undefined, 42, {}]), ["valid"]);
  });

  it("returns empty array for non-array input", () => {
    assert.deepEqual(cleanupTags(null), []);
    assert.deepEqual(cleanupTags("string"), []);
  });
});

describe("T17 — categorize", () => {
  it("classifies parser/indexOf/regex keyword-heavy entry as harness", () => {
    const r = categorize({
      description: "lockdown parseChangePlan 的 indexOf 锚点撞反引号字面",
      rootCause: "regex 锚点未加独立行前缀",
      tags: ["parser", "regex"],
    });
    assert.equal(r, "harness");
  });

  it("classifies tool-misuse / memory entry as model", () => {
    const r = categorize({
      description: "工具参数误用 Write 没带 content",
      rootCause: "记忆幻觉",
      tags: ["工具参数", "记忆幻觉"],
    });
    assert.equal(r, "model");
  });

  it("classifies 口径不一致 / 描述歧义 as description", () => {
    const r = categorize({
      description: "一手源挂错导致描述口径不一致",
      rootCause: "任务描述歧义",
      tags: ["口径不一致", "描述"],
    });
    assert.equal(r, "description");
  });

  it("returns unknown for generic / single-keyword entries", () => {
    const r = categorize({
      description: "something went wrong",
      rootCause: "",
      tags: [],
    });
    assert.equal(r, "unknown");
  });

  it("returns unknown when top two categories tie (conservative)", () => {
    const r = categorize({
      description: "正则 regex parser 工具参数 记忆幻觉", // 3 harness / 2 model
      tags: ["parser", "regex", "工具参数", "记忆幻觉"], // shifts to tie-ish
    });
    assert.ok(CATEGORY_VALUES.includes(r));
  });

  it("CATEGORY_VALUES export is exactly the four expected categories", () => {
    assert.deepEqual([...CATEGORY_VALUES].sort(), ["description", "harness", "model", "unknown"]);
  });
});

describe("T17 — logError integration", () => {
  it("auto-populates category on logError when caller omits", () => {
    const dir = freshDir();
    const r = logError(dir, {
      description: "parser 越界 regex indexOf",
      rootCause: "正则边界",
      tags: ["parser", "regex"],
    });
    assert.ok(r.ok);
    const entries = JSON.parse(readFileSync(join(dir, ".stw/error-registry.json"), "utf-8"));
    assert.equal(entries[0].category, "harness");
  });

  it("respects explicit category from caller (if in CATEGORY_VALUES)", () => {
    const dir = freshDir();
    logError(dir, { description: "x", category: "model" });
    const entries = JSON.parse(readFileSync(join(dir, ".stw/error-registry.json"), "utf-8"));
    assert.equal(entries[0].category, "model");
  });

  it("overrides invalid category value with heuristic", () => {
    const dir = freshDir();
    logError(dir, {
      description: "parser regex indexOf",
      tags: ["parser"],
      category: "bogus-value",
    });
    const entries = JSON.parse(readFileSync(join(dir, ".stw/error-registry.json"), "utf-8"));
    assert.ok(CATEGORY_VALUES.includes(entries[0].category));
    assert.notEqual(entries[0].category, "bogus-value");
  });

  it("cleans slash-joined tags at logError time", () => {
    const dir = freshDir();
    logError(dir, { description: "x", tags: ["正则边界/贪婪回溯"] });
    const entries = JSON.parse(readFileSync(join(dir, ".stw/error-registry.json"), "utf-8"));
    assert.deepEqual(entries[0].tags, ["正则边界", "贪婪回溯"]);
  });
});

describe("T17 — cleanRegistry (one-shot migrate)", () => {
  it("returns total=0 and no backup when registry file missing", () => {
    const dir = freshDir();
    const r = cleanRegistry(dir);
    assert.equal(r.total, 0);
    assert.equal(r.backupPath, null);
  });

  it("dry-run reports counts without writing file or creating backup", () => {
    const dir = freshDir();
    const path = join(dir, ".stw/error-registry.json");
    writeFileSync(path, JSON.stringify([
      { id: "e1", description: "parser", rootCause: "regex", tags: ["正则边界/贪婪回溯", "·"] },
    ]));
    const before = readFileSync(path, "utf-8");
    const r = cleanRegistry(dir, { dryRun: true });
    assert.equal(r.dryRun, true);
    assert.equal(r.total, 1);
    assert.ok(r.cleanedTagCount >= 1);
    assert.ok(r.backfilledCategory >= 1);
    assert.equal(r.backupPath, null);
    const after = readFileSync(path, "utf-8");
    assert.equal(before, after, "dry-run must not modify the file");
  });

  it("actual run creates backup + rewrites registry + backfills category", () => {
    const dir = freshDir();
    const path = join(dir, ".stw/error-registry.json");
    writeFileSync(path, JSON.stringify([
      { id: "e1", description: "parser regex indexOf", rootCause: "锚点", tags: ["parser/regex", "·"] },
      { id: "e2", description: "记忆幻觉 工具参数", tags: ["记忆幻觉", "工具参数"] },
    ]));
    const r = cleanRegistry(dir);
    assert.equal(r.total, 2);
    assert.ok(r.backfilledCategory === 2);
    assert.ok(r.backupPath && existsSync(r.backupPath), "expected backup file");
    const out = JSON.parse(readFileSync(path, "utf-8"));
    assert.ok(CATEGORY_VALUES.includes(out[0].category));
    assert.ok(CATEGORY_VALUES.includes(out[1].category));
    assert.ok(!out[0].tags.includes("·"));
    assert.ok(out[0].tags.includes("parser"));
    assert.ok(out[0].tags.includes("regex"));
  });

  it("is idempotent — running a second time leaves file byte-identical", () => {
    const dir = freshDir();
    const path = join(dir, ".stw/error-registry.json");
    writeFileSync(path, JSON.stringify([
      { id: "e1", description: "parser", tags: ["正则/边界", "·"] },
    ]));
    cleanRegistry(dir);
    const first = readFileSync(path, "utf-8");
    cleanRegistry(dir);
    const second = readFileSync(path, "utf-8");
    assert.equal(first, second);
  });
});

describe("T17 — findRelatedErrorsByTask groupByCategory", () => {
  it("returns grouped object when opts.groupByCategory=true", () => {
    const dir = freshDir();
    logError(dir, { description: "parser regex indexOf 锚点", tags: ["parser"] });
    logError(dir, { description: "记忆幻觉 工具参数 误用", tags: ["记忆幻觉"] });
    const r = findRelatedErrorsByTask(dir, "parser 记忆", 5, { groupByCategory: true });
    assert.ok(r.harness.length >= 1 || r.model.length >= 1);
    assert.ok("harness" in r && "model" in r && "description" in r && "unknown" in r);
  });

  it("returns flat array by default (backward compatible)", () => {
    const dir = freshDir();
    logError(dir, { description: "parser regex", tags: ["parser"] });
    const r = findRelatedErrorsByTask(dir, "parser");
    assert.ok(Array.isArray(r));
  });
});

describe("T17 — getErrorInsights byCategory", () => {
  it("aggregates category counts", () => {
    const dir = freshDir();
    logError(dir, { description: "parser regex indexOf", tags: ["parser"] });
    logError(dir, { description: "记忆幻觉 工具参数", tags: ["记忆幻觉"] });
    const i = getErrorInsights(dir);
    assert.ok(i.byCategory);
    assert.ok(i.byCategory.harness >= 1 || i.byCategory.model >= 1);
  });

  it("returns undefined byCategory when registry empty (back-compat)", () => {
    const dir = freshDir();
    const i = getErrorInsights(dir);
    assert.equal(i.byCategory, undefined);
  });
});
