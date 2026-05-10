import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Create a temporary directory with a .stw subdirectory for testing.
 */
export function freshDir() {
  const dir = join(tmpdir(), "stw-test-" + Date.now() + "-" + Math.random().toString(36).slice(2));
  mkdirSync(join(dir, ".stw"), { recursive: true });
  return dir;
}

/**
 * Create a file in the .stw subdirectory.
 */
export function writeStwFile(dir, name, content) {
  writeFileSync(join(dir, ".stw", name), content);
}

/**
 * Create a file anywhere in the test directory.
 */
export function writeFile(dir, relPath, content) {
  const full = join(dir, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

/**
 * Write a minimal Analysis-Template.md that passes the confidence gate (score ≥ 6).
 * Each section needs >20 chars of non-comment content.
 * Note: deliberately does NOT write .stw/.progress.json. This makes
 * assessConfidence skip the "有的放矢" (targeted-aim) check in test fixtures
 * that only care about the 14 structural steps, preserving backward
 * compatibility with existing assertions.
 */
export function writePassingAnalysis(dir) {
  writeStwFile(dir, "Analysis-Template.md",
    "## 0. 战前评估\n8/10\n\n" +
    "## 0.5 需求澄清 — 向用户提问\nQuestions for the user about what they really need.\n\n" +
    "| # | 问题 | 用户回答 |\n" +
    "| :--- | :--- | :--- |\n" +
    "| 1 | 要做到多深？ | 完整实现 |\n\n" +
    "## 1. 任务背景\nThis is a test task background describing the problem to solve in enough detail.\n\n" +
    "## 1.0 表层需求 → 深层需求（透过现象看本质）\nUser said fix the bug. Actually need to understand root cause and hidden constraints.\n\n" +
    "## 1.5 项目风格侦察（从群众中来）\nScanned the project and found consistent patterns in naming, imports, and error handling throughout.\n\n" +
    "| 维度 | 既有模式 | 示例出处 |\n" +
    "| :--- | :--- | :--- |\n" +
    "| 命名规范 | camelCase functions | (state-machine.js:34) |\n" +
    "| 导入风格 | ESM imports | (state-machine.js:1) |\n\n" +
    "## 1.6 外部调研 — 最佳实践与前人成果\nResearched similar implementations and found established patterns to follow.\n\n" +
    "| 方向 | 搜索结果 | 可借鉴的点 |\n" +
    "| :--- | :--- | :--- |\n" +
    "| 毛选原典 | 《反对本本主义》原话 | 表格行强检 + 关键词对齐 |\n\n" +
    "## 2. 认知分析六步法\n\n" +
    "### 2.1 去粗 — 过滤噪音\nSome meaningful filtered content about relevant files goes here.\n\n" +
    "### 2.2 取精 — 提取精华\nKey architectural decisions and hidden constraints discovered during analysis.\n\n" +
    "### 2.3 去伪 — 消除假象\nIdentified outdated docs and misleading configurations in the codebase.\n\n" +
    "### 2.4 存真 — 保留真相\nAccurate description of how the code actually runs in production (state-machine.js:130). The function writes progress (lockdown.js:45).\n\n" +
    "### 2.5 由此及彼 — 追溯关联\nCall chain traced from entry point to affected modules fully documented.\n\n" +
    "### 2.6 由表及里 — 直达根因\nSurface symptoms traced down to the fundamental root cause of the issue.\n\n" +
    "## 3. 主要矛盾分析\nThe core contradiction identified and documented for this task.\n\n" +
    "## 4. 初步方案\nProposed solution approach with clear implementation path outlined here.\n\n" +
    "## 4.5 变更计划声明\n| src/app.js | fix | Fix the reported bug in the application entry. |\n"
  );
}

/**
 * Write a minimal .stw/planner-report.md that passes the phase 2→3 gate.
 */
export function writePassingPlannerReport(dir) {
  writeStwFile(dir, "planner-report.md",
    "# 规划师报告\n\n" +
    "## 主要矛盾\n测试任务的主要矛盾。\n\n" +
    "## 结论\n\n**结论**: 可以推进\n"
  );
}

/**
 * Write a minimal .stw/reviewer-report.md that passes the phase 4→5 gate.
 */
export function writePassingReviewerReport(dir) {
  writeStwFile(dir, "reviewer-report.md",
    "# 审查员报告\n\n" +
    "## 纪律检查\n所有修改在 ATTACK_ZONE 内。\n\n" +
    "## 结论\n\n**结论**: 通过\n"
  );
}

/**
 * Synchronously read .stw/events.jsonl and return parsed entries.
 * Malformed lines are skipped. Useful for tests asserting event sequences.
 */
export function readEventsForTest(dir) {
  const path = join(dir, ".stw", "events.jsonl");
  if (!existsSync(path)) return [];
  const content = readFileSync(path, "utf-8");
  const out = [];
  for (const line of content.split("\n")) {
    if (!line) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // skip malformed
    }
  }
  return out;
}
