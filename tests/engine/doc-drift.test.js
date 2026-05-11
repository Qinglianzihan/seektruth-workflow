import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { detectDocDrift, formatDocDriftOutput } from "../../src/engine/doc-drift.js";
import { freshDir } from "../test-helper.js";

function writeRoadmap(dir, body) {
  writeFileSync(join(dir, ".stw", "roadmap.md"), body);
}

function writeSource(dir, name, body) {
  const path = join(dir, name);
  writeFileSync(path, body);
  return path;
}

describe("detectDocDrift — stale-source detection", () => {
  it("flags T{N} marked '候选' in source when roadmap has [x]", () => {
    const dir = freshDir();
    writeRoadmap(dir, "## 已完成\n- [x] **T11.** Ralph Loop Stop hook (2026-05-11)\n");
    const src = writeSource(dir, "HARNESS_ENGINEERING.md",
      "| Ralph Loop | 🟢 4家 | **半** | T11 候选 |\n");
    const r = detectDocDrift(dir, { sourcePaths: [src] });
    assert.equal(r.ok, false);
    const issue = r.issues.find((i) => i.tNum === 11);
    assert.ok(issue, "T11 should be flagged");
    assert.equal(issue.type, "stale-source");
    assert.ok(["候选", "**半**"].includes(issue.matchedKeyword));
    assert.equal(issue.sourceLineNum, 1);
    rmSync(dir, { recursive: true, force: true });
  });

  it("flags each stale keyword family (参数化 mode1/mode2 合并)", () => {
    for (const kw of ["候选", "**半**", "半完成", "未实现", "计划中", "未落地", "待补", "待做", "部分完成"]) {
      const dir = freshDir();
      writeRoadmap(dir, "- [x] **T7.** something completed\n");
      const src = writeSource(dir, "HARNESS_ENGINEERING.md", `T7 ${kw}\n`);
      const r = detectDocDrift(dir, { sourcePaths: [src] });
      assert.equal(r.issues.length, 1, `keyword=${kw} should trigger 1 issue`);
      assert.equal(r.issues[0].matchedKeyword, kw);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does NOT mis-attribute stale keyword to wrong T on the same line", () => {
    const dir = freshDir();
    writeRoadmap(dir,
      "- [x] **T2.** PostToolUse hook done\n" +
      "- [ ] **T11.** Stop hook candidate\n");
    const src = writeSource(dir, "HARNESS_ENGINEERING.md",
      "T2 完成 PostToolUse hook（编辑后跑 check），但 Stop hook 那半未做。T11 候选。\n");
    const r = detectDocDrift(dir, { sourcePaths: [src] });
    const t2Issue = r.issues.find((i) => i.tNum === 2);
    assert.equal(t2Issue, undefined, "'候选' is nearer to T11, not T2 — T2 must not be flagged");
  });

  it("ignores T inside parentheses (avoid T2 hit from '(只缺 T2 的 Stop hook 那半)')", () => {
    const dir = freshDir();
    writeRoadmap(dir, "- [x] **T2.** done\n- [ ] **T11.** later\n");
    const src = writeSource(dir, "HARNESS_ENGINEERING.md",
      "| Ralph Loop | 🟢 | **半**（只缺 T2 的 Stop hook 那半）| T11 候选 |\n");
    const r = detectDocDrift(dir, { sourcePaths: [src] });
    assert.equal(r.issues.find((i) => i.tNum === 2), undefined);
  });
});

describe("detectDocDrift — unregistered detection", () => {
  it("flags T{N} present in source but missing from roadmap entirely", () => {
    const dir = freshDir();
    writeRoadmap(dir, "- [x] **T1.** roadmap\n");
    const src = writeSource(dir, "HARNESS_ENGINEERING.md",
      "- T99 是某个源文档里刚冒出来但 roadmap 完全未登记的新 T 编号\n");
    const r = detectDocDrift(dir, { sourcePaths: [src] });
    assert.ok(r.issues.some((i) => i.tNum === 99 && i.type === "unregistered"));
    rmSync(dir, { recursive: true, force: true });
  });

  it("does NOT flag T{N} as unregistered when roadmap has it as [ ] pending (P2 bug-net)", () => {
    const dir = freshDir();
    writeRoadmap(dir, "- [x] **T1.** done\n- [ ] **T14.** planned\n");
    const src = writeSource(dir, "HARNESS_ENGINEERING.md", "T14 候选\n");
    const r = detectDocDrift(dir, { sourcePaths: [src] });
    const unreg = r.issues.find((i) => i.tNum === 14 && i.type === "unregistered");
    assert.equal(unreg, undefined, "T14 is pending in roadmap, must not be unregistered");
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("detectDocDrift — no drift / skip branches", () => {
  it("returns ok when all [x] T{N} are consistent across sources", () => {
    const dir = freshDir();
    writeRoadmap(dir,
      "- [x] **T3.** Observability (2026-05-10)\n" +
      "- [ ] **T11.** Stop hook\n");
    const src = writeSource(dir, "HARNESS_ENGINEERING.md",
      "| Observability | 🟢 4家 | ✓ | events.js + stw replay (T3) |\n" +
      "| Ralph Loop | 🟢 | **半** | T11 候选 |\n");
    const r = detectDocDrift(dir, { sourcePaths: [src] });
    assert.equal(r.ok, true);
    assert.equal(r.issues.length, 0);
    rmSync(dir, { recursive: true, force: true });
  });

  it("gracefully skips when roadmap is missing", () => {
    const dir = freshDir();
    rmSync(join(dir, ".stw", "roadmap.md"), { force: true });
    const r = detectDocDrift(dir);
    assert.equal(r.ok, true);
    assert.equal(r.issues.length, 0);
    assert.ok(r.skipped);
    rmSync(dir, { recursive: true, force: true });
  });

  it("gracefully skips when roadmap exists but has no [x] T{N} entries", () => {
    const dir = freshDir();
    writeRoadmap(dir, "# Empty roadmap\n- [ ] **T1.** not yet done\n");
    const r = detectDocDrift(dir, { sourcePaths: [] });
    assert.equal(r.ok, true);
    assert.equal(r.issues.length, 0);
    assert.ok(r.skipped);
    rmSync(dir, { recursive: true, force: true });
  });

  it("gracefully skips when both source docs are missing (user-project case)", () => {
    const dir = freshDir();
    writeRoadmap(dir, "- [x] **T1.** roadmap\n");
    const r = detectDocDrift(dir, {
      sourcePaths: [join(dir, "missing-1.md"), join(dir, "missing-2.md")],
    });
    assert.equal(r.ok, true);
    assert.equal(r.issues.length, 0);
    assert.ok(r.scanned.sources.every((s) => !s.exists));
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("detectDocDrift — regex boundary", () => {
  it("does not detect 'T5050' as T{N} (\\b fails on trailing \\w) — P1 bug-net", () => {
    const dir = freshDir();
    writeRoadmap(dir, "- [x] **T1.** real entry\n");
    const src = writeSource(dir, "HARNESS_ENGINEERING.md",
      "T5050 is a noise string that should NOT produce any issue.\n" +
      "Neither should T123456.\n");
    const r = detectDocDrift(dir, { sourcePaths: [src] });
    assert.equal(r.issues.find((i) => i.tNum === 5050), undefined);
    assert.equal(r.issues.find((i) => i.tNum === 505), undefined);
    assert.equal(r.issues.find((i) => i.tNum === 123), undefined);
    assert.equal(r.issues.find((i) => i.tNum === 123456), undefined);
    rmSync(dir, { recursive: true, force: true });
  });

  it("does not confuse TEST, PROTEST with T{N}", () => {
    const dir = freshDir();
    writeRoadmap(dir, "- [x] **T1.** real entry\n");
    const src = writeSource(dir, "HARNESS_ENGINEERING.md",
      "TEST PROTEST ARTEST — none of these contain a valid T{N} token.\n");
    const r = detectDocDrift(dir, { sourcePaths: [src] });
    assert.equal(r.issues.length, 0);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("formatDocDriftOutput", () => {
  it("returns all-clear line when no drift and sources exist", () => {
    const out = formatDocDriftOutput({
      ok: true,
      issues: [],
      scanned: { completedInRoadmap: 5, sources: [{ path: "/x/HARNESS_ENGINEERING.md", exists: true }] },
    });
    assert.ok(out.includes("✅"));
    assert.ok(out.includes("5"));
  });

  it("lists issues when drift > 0", () => {
    const out = formatDocDriftOutput({
      ok: false,
      issues: [{
        type: "stale-source", tNum: 11, tTitle: "Ralph Loop Stop hook",
        source: "/repo/HARNESS_ENGINEERING.md", sourceLineNum: 283,
        sourceLine: "| Ralph Loop | 🟢 4家 | **半** | T11 候选 |",
        matchedKeyword: "候选",
      }],
      scanned: { completedInRoadmap: 1, sources: [{ path: "/repo/HARNESS_ENGINEERING.md", exists: true }] },
    });
    assert.ok(out.includes("T11"));
    assert.ok(out.includes("HARNESS_ENGINEERING.md"));
    assert.ok(out.includes("283"));
    assert.ok(out.includes("stale-source"));
  });

  it("shows skip line when roadmap missing", () => {
    const out = formatDocDriftOutput({
      ok: true, issues: [], skipped: "roadmap.md 不存在",
      scanned: { completedInRoadmap: 0, sources: [] },
    });
    assert.ok(out.includes("⊘"));
    assert.ok(out.includes("跳过"));
  });
});
