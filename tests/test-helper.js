import { mkdirSync, writeFileSync } from "node:fs";
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
 */
export function writePassingAnalysis(dir) {
  writeStwFile(dir, "Analysis-Template.md",
    "## 0. 战前评估\n8/10\n\n" +
    "## 1. 任务背景\nThis is a test task background describing the problem to solve in enough detail.\n\n" +
    "## 1.5 项目风格侦察（从群众中来）\nScanned the project and found consistent patterns in naming, imports, and error handling throughout.\n\n" +
    "| 维度 | 既有模式 | 示例出处 |\n" +
    "| :--- | :--- | :--- |\n" +
    "| 命名规范 | camelCase functions | (state-machine.js:34) |\n" +
    "| 导入风格 | ESM imports | (state-machine.js:1) |\n\n" +
    "## 2. 认知分析六步法\n\n" +
    "### 2.1 去粗 — 过滤噪音\nSome meaningful filtered content about relevant files goes here.\n\n" +
    "### 2.2 取精 — 提取精华\nKey architectural decisions and hidden constraints discovered during analysis.\n\n" +
    "### 2.3 去伪 — 消除假象\nIdentified outdated docs and misleading configurations in the codebase.\n\n" +
    "### 2.4 存真 — 保留真相\nAccurate description of how the code actually runs in production (state-machine.js:130). The function writes progress (lockdown.js:45).\n\n" +
    "### 2.5 由此及彼 — 追溯关联\nCall chain traced from entry point to affected modules fully documented.\n\n" +
    "### 2.6 由表及里 — 直达根因\nSurface symptoms traced down to the fundamental root cause of the issue.\n\n" +
    "## 3. 主要矛盾分析\nThe core contradiction identified and documented for this task.\n\n" +
    "## 4. 初步方案\nProposed solution approach with clear implementation path outlined here.\n"
  );
}
