import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { freshDir } from "../test-helper.js";
import { logError, getRelatedErrors, getErrorInsights, extractKeywords, findRelatedErrorsByTask } from "../../src/engine/error-registry.js";

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
