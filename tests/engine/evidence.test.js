import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseChangePlanPredictions,
  parseChangePlanPredictionsFromContent,
  parseEvidenceLedger,
  checkEvidence,
  checkEvidenceLedger,
} from "../../src/engine/evidence.js";
import { freshDir, writeStwFile } from "../test-helper.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");

const THREE_COL_PLAN = `
## 4.5 变更计划声明

| 文件 | 改动类型 | 理由 |
| :--- | :--- | :--- |
| src/a.js | fix | 修 bug |
| src/b.js | create | 新模块 |

---
`;

const FOUR_COL_PLAN = `
## 4.5 变更计划声明

| 文件 | 改动类型 | 理由 | 预测 |
| :--- | :--- | :--- | :--- |
| src/a.js | fix | 修 bug | 测试通过 |
| src/b.js | create | 新模块 | 导出 3 个函数 |
| src/c.js | modify | 扩字段 | |

---
`;

const FAKE_4_5_IN_CODE_BLOCK = `
## 2.3 去伪

内部 note：
- \`## 4.5 变更计划声明\` 是 lockdown 下游
- 此处不该被误认为真 §4.5

## 4.5 变更计划声明

| 文件 | 改动类型 | 理由 | 预测 |
| :--- | :--- | :--- | :--- |
| src/real.js | fix | 真实改动 | done |

---
`;

const LEDGER_CONFIRMED = `
## 7. 证据账本

| 文件 | 预测 | 实际 | 判定 |
| :--- | :--- | :--- | :--- |
| src/a.js | 120 行 | 130 行 | 兑现 |
| src/b.js | 导出 3 函数 | 导出 3 函数 | 兑现 |

---
`;

const LEDGER_MIXED = `
## 7. 证据账本

| 文件 | 预测 | 实际 | 判定 |
| :--- | :--- | :--- | :--- |
| src/a.js | 120 行 | 250 行 | 不兑现 |
| src/b.js | 3 函数 | 3 函数 | 兑现 |
| src/c.js | 4 测试 | 10 测试 | 跳过 |

---
`;

const LEDGER_EMPTY = `
## 7. 证据账本

| 文件 | 预测 | 实际 | 判定 |
| :--- | :--- | :--- | :--- |
| | | | 兑现 / 不兑现 / 跳过 |

---
`;

// 规划师 A1 调整建议：历史归档真实存在 `## 7. 对 Roadmap 的再认识` 章节
const LEDGER_FALSE_POSITIVE = `
## 7. 对 Roadmap 的再认识

| 项 | 原定 | 实际 |
| :--- | :--- | :--- |
| T11 | 本周完成 | 已完成 |

---
`;

describe("Evidence — parseChangePlanPredictions", () => {
  it("returns [] when Analysis-Template.md missing", () => {
    const dir = freshDir();
    assert.deepEqual(parseChangePlanPredictions(dir), []);
  });

  it("returns [] when §4.5 heading missing", () => {
    const dir = freshDir();
    writeStwFile(dir, "Analysis-Template.md", "## 1. 背景\n\n无 4.5");
    assert.deepEqual(parseChangePlanPredictions(dir), []);
  });

  it("compat: three-col table → predicted empty string", () => {
    const entries = parseChangePlanPredictionsFromContent(THREE_COL_PLAN);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].file, "src/a.js");
    assert.equal(entries[0].type, "fix");
    assert.equal(entries[0].reason, "修 bug");
    assert.equal(entries[0].predicted, "");
  });

  it("four-col table → predicted filled or empty per cell", () => {
    const entries = parseChangePlanPredictionsFromContent(FOUR_COL_PLAN);
    assert.equal(entries.length, 3);
    assert.equal(entries[0].predicted, "测试通过");
    assert.equal(entries[1].predicted, "导出 3 个函数");
    assert.equal(entries[2].predicted, "");
  });

  it("ignores fake §4.5 text inside earlier section body", () => {
    const entries = parseChangePlanPredictionsFromContent(FAKE_4_5_IN_CODE_BLOCK);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].file, "src/real.js");
  });

  it("skips rows missing a plausible filename", () => {
    const content = `
## 4.5 变更计划声明

| 文件 | 改动类型 | 理由 | 预测 |
| :--- | :--- | :--- | :--- |
| TODO | | | |
| src/real.js | fix | x | y |

`;
    const entries = parseChangePlanPredictionsFromContent(content);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].file, "src/real.js");
  });
});

describe("Evidence — parseEvidenceLedger", () => {
  it("returns [] when §7 heading missing", () => {
    assert.deepEqual(parseEvidenceLedger("# empty\n\n## 6. 错误病例\n\n"), []);
  });

  it("returns [] for empty-table-only section", () => {
    assert.deepEqual(parseEvidenceLedger(LEDGER_EMPTY), []);
  });

  it("parses confirmed rows", () => {
    const rows = parseEvidenceLedger(LEDGER_CONFIRMED);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].verdict, "兑现");
  });

  it("strict title match — ignores `## 7. 对 Roadmap 的再认识`", () => {
    // 规划师 A1 防线：`## 7.` 前缀匹配会把错章节当 ledger；必须字面匹配 `## 7. 证据账本`
    assert.deepEqual(parseEvidenceLedger(LEDGER_FALSE_POSITIVE), []);
  });
});

describe("Evidence — checkEvidence (non-blocking gate)", () => {
  it("always returns ok:true", () => {
    const dir = freshDir();
    const res = checkEvidence(dir);
    assert.equal(res.ok, true);
  });

  it("no plan → coverage 0/0, no warning", () => {
    const dir = freshDir();
    const res = checkEvidence(dir);
    assert.equal(res.coverage, "0/0");
    assert.equal(res.warning, null);
    assert.equal(res.missing.length, 0);
  });

  it("partial coverage → warning lists missing files", () => {
    const dir = freshDir();
    writeStwFile(dir, "Analysis-Template.md", FOUR_COL_PLAN);
    const res = checkEvidence(dir);
    assert.equal(res.ok, true);
    assert.equal(res.total, 3);
    assert.equal(res.filled, 2);
    assert.equal(res.coverage, "2/3");
    assert.deepEqual(res.missing, ["src/c.js"]);
    assert.ok(res.warning && res.warning.includes("src/c.js"));
  });

  it("full coverage → no warning", () => {
    const dir = freshDir();
    writeStwFile(dir, "Analysis-Template.md", `
## 4.5 变更计划声明

| 文件 | 改动类型 | 理由 | 预测 |
| :--- | :--- | :--- | :--- |
| src/a.js | fix | x | done |
`);
    const res = checkEvidence(dir);
    assert.equal(res.warning, null);
    assert.equal(res.coverage, "1/1");
  });

  it("three-col old plan → all predicted empty, warning fires", () => {
    const dir = freshDir();
    writeStwFile(dir, "Analysis-Template.md", THREE_COL_PLAN);
    const res = checkEvidence(dir);
    assert.equal(res.ok, true);
    assert.equal(res.coverage, "0/2");
    assert.equal(res.missing.length, 2);
  });
});

describe("Evidence — checkEvidenceLedger (archive reconciliation)", () => {
  it("no summary → total=0, mismatches=[]", () => {
    const dir = freshDir();
    const v = checkEvidenceLedger(dir);
    assert.equal(v.total, 0);
    assert.deepEqual(v.mismatches, []);
  });

  it("all confirmed → confirmed === total, no mismatches", () => {
    const dir = freshDir();
    writeStwFile(dir, "Summary-Template.md", LEDGER_CONFIRMED);
    const v = checkEvidenceLedger(dir);
    assert.equal(v.total, 2);
    assert.equal(v.confirmed, 2);
    assert.equal(v.mismatches.length, 0);
  });

  it("mixed verdicts → only 不兑现 enters mismatches", () => {
    const dir = freshDir();
    writeStwFile(dir, "Summary-Template.md", LEDGER_MIXED);
    const v = checkEvidenceLedger(dir);
    assert.equal(v.total, 3);
    assert.equal(v.confirmed, 1);
    assert.equal(v.mismatches.length, 1);
    assert.equal(v.mismatches[0].file, "src/a.js");
    assert.equal(v.skipped, 1);
  });

  it("历史归档 smoke: legacy reports (pre-T12) yield []", () => {
    // 记忆 feedback-real-repo-smoke-test.md 教训
    // T12 之后归档的 summary-*.md 可能含 §7 证据账本（T12 首份归档 13-36-57 就有）—— 只验证 T12 之前的老归档
    const reportsDir = join(REPO_ROOT, ".stw", "reports");
    const files = readdirSync(reportsDir)
      .filter((f) => f.startsWith("summary-") && f.endsWith(".md"))
      // 字典序：T12 首份归档 2026-05-11T13-36-57 之前的全部视为 legacy（无 §7）
      .filter((f) => f < "summary-2026-05-11T13-36-57.md");
    assert.ok(files.length >= 1, "expected legacy reports before T12");
    for (const f of files) {
      const content = readFileSync(join(reportsDir, f), "utf-8");
      const ledger = parseEvidenceLedger(content);
      assert.equal(
        ledger.length,
        0,
        `legacy report ${f} should have no §7 evidence ledger (got ${ledger.length})`,
      );
    }
  });

  it("真实仓库 smoke: current Analysis §4.5 14 entries all with predicted", () => {
    const entries = parseChangePlanPredictions(REPO_ROOT);
    assert.ok(entries.length >= 10, `expected ≥ 10 entries, got ${entries.length}`);
    const filled = entries.filter((e) => e.predicted).length;
    assert.equal(filled, entries.length, "current T12 Analysis should have predicted column filled for every row");
  });
});
