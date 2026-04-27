import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  startSession,
  getCurrentPhase,
  advancePhase,
  abortSession,
  rollbackSession,
  getSessionConfig,
  readTestResults,
} from "../../src/engine/state-machine.js";
import { freshDir, writeStwFile, writePassingAnalysis } from "../test-helper.js";
import { spawnSync } from "node:child_process";

describe("State Machine — basic operations", () => {
  it("getCurrentPhase returns null when no session", () => {
    assert.equal(getCurrentPhase(freshDir()), null);
  });

  it("startSession creates a session at phase 1", () => {
    const dir = freshDir();
    const session = startSession(dir);
    assert.equal(session.phase, 1);
    assert.equal(session.phaseInfo.id, 1);
    assert.deepEqual(session.completedPhases, []);
  });

  it("getCurrentPhase returns correct phase after start", () => {
    const dir = freshDir();
    startSession(dir);
    const session = getCurrentPhase(dir);
    assert.equal(session.phase, 1);
  });

  it("advancePhase fails when no active session", () => {
    const dir = freshDir();
    const result = advancePhase(dir);
    assert.equal(result.ok, false);
    assert.ok(result.error.includes("没有活跃的任务"));
  });
});

describe("State Machine — delivery checks", () => {
  it("phase 1 → 2 succeeds with Analysis-Template.md", () => {
    const dir = freshDir();
    writePassingAnalysis(dir);
    startSession(dir);
    const result = advancePhase(dir);
    assert.equal(result.ok, true);
    assert.equal(result.phase.id, 2);
  });

  it("phase 1 does NOT advance without Analysis-Template.md", () => {
    const dir = freshDir();
    startSession(dir);
    // No Analysis-Template.md
    const result = advancePhase(dir);
    assert.equal(result.ok, false);
  });

  it("phase 2 → 3 succeeds with ATTACK_ZONE outside code block", () => {
    const dir = freshDir();
    writePassingAnalysis(dir);
    writeStwFile(dir, "STW-Workspace.md", "# Workspace\n<!-- ATTACK_ZONE: src/* -->");
    startSession(dir);
    advancePhase(dir); // → phase 2
    const result = advancePhase(dir); // → phase 3
    assert.equal(result.ok, true);
    assert.equal(result.phase.id, 3);
  });

  it("phase 2 blocks when ATTACK_ZONE only inside code block", () => {
    const dir = freshDir();
    writePassingAnalysis(dir);
    writeStwFile(dir, "STW-Workspace.md", "# Template\n```\n<!-- ATTACK_ZONE: src/* -->\n```");
    startSession(dir);
    advancePhase(dir); // → phase 2
    const result = advancePhase(dir);
    assert.equal(result.ok, false);
  });

  it("phase 2 blocks without ATTACK_ZONE", () => {
    const dir = freshDir();
    writePassingAnalysis(dir);
    writeStwFile(dir, "STW-Workspace.md", "# No zone declaration");
    startSession(dir);
    advancePhase(dir); // → phase 2
    const result = advancePhase(dir);
    assert.equal(result.ok, false);
  });

  it("phase 3 → 4 succeeds with lockdown.json", () => {
    const dir = freshDir();
    writePassingAnalysis(dir);
    writeStwFile(dir, "STW-Workspace.md", "# W\n<!-- ATTACK_ZONE: src/* -->");
    writeStwFile(dir, "lockdown.json", "{}");
    startSession(dir);
    advancePhase(dir); // → 2
    advancePhase(dir); // → 3
    const result = advancePhase(dir); // → 4
    assert.equal(result.ok, true);
    assert.equal(result.phase.id, 4);
  });

  it("phase 5 → complete succeeds with Summary-Template.md", () => {
    const dir = freshDir();
    writePassingAnalysis(dir);
    writeStwFile(dir, "STW-Workspace.md", "# W\n<!-- ATTACK_ZONE: src/* -->");
    writeStwFile(dir, "lockdown.json", "{}");
    writeStwFile(dir, "test-results.json", '{"passed":true}');
    writeStwFile(dir, "Summary-Template.md", "# S");
    startSession(dir);
    advancePhase(dir); // → 2
    advancePhase(dir); // → 3
    advancePhase(dir); // → 4
    advancePhase(dir); // → 5
    const result = advancePhase(dir); // → complete
    assert.equal(result.ok, true);
    assert.equal(result.done, true);
    assert.equal(result.phase, "complete");
  });
});

describe("State Machine — full lifecycle", () => {
  it("completes all 5 phases in sequence", () => {
    const dir = freshDir();
    writePassingAnalysis(dir);
    writeStwFile(dir, "STW-Workspace.md", "# W\n<!-- ATTACK_ZONE: src/* -->");
    startSession(dir);

    // Phase 1 → 2
    assert.equal(advancePhase(dir).phase.id, 2);
    // Phase 2 → 3
    assert.equal(advancePhase(dir).phase.id, 3);
    // Phase 3 → 4
    writeStwFile(dir, "lockdown.json", "{}");
    assert.equal(advancePhase(dir).phase.id, 4);
    // Phase 4 → 5
    writeStwFile(dir, "test-results.json", '{"passed":true}');
    assert.equal(advancePhase(dir).phase.id, 5);
    // Phase 5 → complete
    writeStwFile(dir, "Summary-Template.md", "# S");
    const r = advancePhase(dir);
    assert.equal(r.ok, true);
    assert.equal(r.done, true);
    assert.equal(r.phase, "complete");
  });
});

describe("State Machine — abort", () => {
  it("aborts an active session", () => {
    const dir = freshDir();
    startSession(dir);
    assert.ok(getCurrentPhase(dir));
    const result = abortSession(dir);
    assert.equal(result.ok, true);
    assert.equal(getCurrentPhase(dir), null);
  });

  it("fails to abort when no active session", () => {
    const dir = freshDir();
    const result = abortSession(dir);
    assert.equal(result.ok, false);
  });
});

describe("State Machine — rollback", () => {
  it("rollbackSession resets phase to 1", () => {
    const dir = freshDir();
    writePassingAnalysis(dir);
    startSession(dir);
    advancePhase(dir); // → phase 2
    const result = rollbackSession(dir, "test rollback");
    assert.equal(result.ok, true);
    assert.equal(result.phase, 1);
    assert.equal(result.iterations, 1);
  });

  it("rollbackSession fails when no active session", () => {
    const dir = freshDir();
    const result = rollbackSession(dir, "test");
    assert.equal(result.ok, false);
  });

  it("rollbackSession fails when already at phase 1", () => {
    const dir = freshDir();
    startSession(dir);
    const result = rollbackSession(dir, "test");
    assert.equal(result.ok, false);
  });

  it("rollbackSession records correct phase in iteration entry", () => {
    const dir = freshDir();
    writePassingAnalysis(dir);
    writeStwFile(dir, "STW-Workspace.md", "# W\n<!-- ATTACK_ZONE: src/* -->");
    writeStwFile(dir, "lockdown.json", "{}");
    startSession(dir);
    advancePhase(dir); // → 2
    advancePhase(dir); // → 3
    rollbackSession(dir, "test reason");
    const session = getCurrentPhase(dir);
    assert.equal(session.iterations[0].phase, 3);
    assert.equal(session.iterations[0].reason, "test reason");
  });

  it("multiple rollbacks accumulate iterations", () => {
    const dir = freshDir();
    writePassingAnalysis(dir);
    startSession(dir);
    advancePhase(dir); // → 2
    rollbackSession(dir, "first");
    advancePhase(dir); // → 2
    rollbackSession(dir, "second");
    const session = getCurrentPhase(dir);
    assert.equal(session.iterations.length, 2);
  });

  it("advancePhase works after rollback", () => {
    const dir = freshDir();
    writePassingAnalysis(dir);
    startSession(dir);
    advancePhase(dir); // → 2
    rollbackSession(dir, "test");
    const result = advancePhase(dir); // → 2 again
    assert.equal(result.ok, true);
  });

  it("startSession initializes empty iterations", () => {
    const dir = freshDir();
    startSession(dir);
    const session = getCurrentPhase(dir);
    assert.deepEqual(session.iterations, []);
  });
});

describe("State Machine — file bounds enforcement (phase 3→4)", () => {
  /** Create a temp dir with git repo, return { dir, run }. */
  function freshGitDir() {
    const dir = freshDir();
    const run = (args) => spawnSync("git", args, { cwd: dir, encoding: "utf-8", timeout: 5000 });
    run(["init"]);
    run(["config", "user.email", "t@t"]);
    run(["config", "user.name", "t"]);
    return { dir, run };
  }

  it("phase 3→4 blocked when file modified outside attack zone", () => {
    const { dir, run } = freshGitDir();

    // Set up zone declaration and committed baseline
    writeStwFile(dir, "STW-Workspace.md", "# W\n<!-- ATTACK_ZONE: src/* -->");
    mkdirSync(join(dir, "src"), { recursive: true });
    mkdirSync(join(dir, "dist"), { recursive: true });
    writeFileSync(join(dir, "src", "app.js"), "orig");
    writeFileSync(join(dir, "dist", "bundle.js"), "orig");
    run(["add", "-A"]);
    run(["commit", "-m", "baseline"]);

    // Prep for workflow
    writePassingAnalysis(dir);
    writeStwFile(dir, "lockdown.json", '{"attackZones":["src/*"]}');
    startSession(dir);
    advancePhase(dir); // 1→2
    advancePhase(dir); // 2→3

    // Modify file OUTSIDE attack zone
    writeFileSync(join(dir, "dist", "bundle.js"), "changed");

    const result = advancePhase(dir); // 3→4 should be blocked
    assert.equal(result.ok, false);
    assert.ok(result.error.includes("越界修改"), "should mention 越界, got: " + result.error);
  });

  it("phase 3→4 passes when all changes inside zone", () => {
    const { dir, run } = freshGitDir();

    writeStwFile(dir, "STW-Workspace.md", "# W\n<!-- ATTACK_ZONE: src/* -->");
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "app.js"), "orig");
    run(["add", "-A"]);
    run(["commit", "-m", "baseline"]);

    writePassingAnalysis(dir);
    writeStwFile(dir, "lockdown.json", '{"attackZones":["src/*"]}');
    startSession(dir);
    advancePhase(dir); // 1→2
    advancePhase(dir); // 2→3

    // Modify file INSIDE attack zone only
    writeFileSync(join(dir, "src", "app.js"), "changed");

    const result = advancePhase(dir); // 3→4
    assert.equal(result.ok, true);
    assert.equal(result.phase.id, 4);
  });

  it("phase 3→4 passes in non-git directory (no diff to check)", () => {
    const dir = freshDir();
    writePassingAnalysis(dir);
    writeStwFile(dir, "STW-Workspace.md", "# W\n<!-- ATTACK_ZONE: src/* -->");
    writeStwFile(dir, "lockdown.json", "{}");
    startSession(dir);
    advancePhase(dir); // 1→2
    advancePhase(dir); // 2→3
    const result = advancePhase(dir); // 3→4 — no git, no diff
    assert.equal(result.ok, true);
    assert.equal(result.phase.id, 4);
  });

});

describe("State Machine — change plan enforcement (phase 3→4)", () => {
  function freshGitDir() {
    const dir = freshDir();
    const run = (args) => spawnSync("git", args, { cwd: dir, encoding: "utf-8", timeout: 5000 });
    run(["init"]);
    run(["config", "user.email", "t@t"]);
    run(["config", "user.name", "t"]);
    return { dir, run };
  }

  it("blocked when no change plan declared", () => {
    const { dir, run } = freshGitDir();

    writeStwFile(dir, "STW-Workspace.md", "# W\n<!-- ATTACK_ZONE: src/* -->");
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "app.js"), "orig");
    run(["add", "-A"]);
    run(["commit", "-m", "baseline"]);

    // Analysis without 变更计划章节 (but enough to pass confidence gate)
    writeStwFile(dir, "Analysis-Template.md",
      "## 0. 战前评估\n8/10\n\n" +
      "## 1. 任务背景\nThis is a test task background describing the problem to solve in enough detail.\n\n" +
      "## 1.5 项目风格侦察（从群众中来）\nScanned the project and found consistent patterns throughout.\n\n" +
      "## 2. 认知分析六步法\n\n" +
      "### 2.1 去粗 — 过滤噪音\nSome meaningful filtered content about relevant files goes here.\n\n" +
      "### 2.2 取精 — 提取精华\nKey architectural decisions discovered during analysis.\n\n" +
      "### 2.3 去伪 — 消除假象\nIdentified outdated docs and misleading configurations.\n\n" +
      "### 2.4 存真 — 保留真相\nAccurate description of code behavior (state-machine.js:130). Also more (lockdown.js:45).\n\n" +
      "### 2.5 由此及彼 — 追溯关联\nCall chain traced from entry to full dependency chain.\n\n" +
      "### 2.6 由表及里 — 直达根因\nRoot cause identified after careful analysis of symptoms.\n\n" +
      "## 3. 主要矛盾分析\nThe core contradiction identified and documented.\n\n" +
      "## 4. 初步方案\nProposed solution approach with clear implementation path.\n"
    );
    writeStwFile(dir, "lockdown.json", '{"attackZones":["src/*"]}');
    startSession(dir);
    advancePhase(dir); // 1→2
    advancePhase(dir); // 2→3

    // Modify file inside zone but not declared in plan
    writeFileSync(join(dir, "src", "app.js"), "changed");

    const result = advancePhase(dir); // 3→4
    assert.equal(result.ok, false);
    assert.ok(result.error.includes("未在变更计划中声明") || result.error.includes("未声明变更计划"),
      "should block on change plan, got: " + result.error);
  });

  it("passes when all changes declared in change plan", () => {
    const { dir, run } = freshGitDir();

    writeStwFile(dir, "STW-Workspace.md", "# W\n<!-- ATTACK_ZONE: src/* -->");
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "app.js"), "orig");
    run(["add", "-A"]);
    run(["commit", "-m", "baseline"]);

    // writePassingAnalysis includes 变更计划 declaring src/app.js
    writePassingAnalysis(dir);
    writeStwFile(dir, "lockdown.json", '{"attackZones":["src/*"]}');
    startSession(dir);
    advancePhase(dir); // 1→2
    advancePhase(dir); // 2→3

    // Modify file declared in plan
    writeFileSync(join(dir, "src", "app.js"), "changed");

    const result = advancePhase(dir); // 3→4
    assert.equal(result.ok, true);
    assert.equal(result.phase.id, 4);
  });
});

describe("Scenario 4: Task description", () => {
  it("startSession stores taskDescription", () => {
    const dir = freshDir();
    startSession(dir, "Fix login bug");
    const session = getCurrentPhase(dir);
    assert.equal(session.taskDescription, "Fix login bug");
  });

  it("startSession defaults to empty description", () => {
    const dir = freshDir();
    startSession(dir);
    const session = getCurrentPhase(dir);
    assert.equal(session.taskDescription, "");
  });

  it("taskDescription persists in progress.json", () => {
    const dir = freshDir();
    startSession(dir, "Refactor API");
    const raw = JSON.parse(readFileSync(join(dir, ".stw", ".progress.json"), "utf-8"));
    assert.equal(raw.taskDescription, "Refactor API");
  });
});

describe("Scenario 9: getSessionConfig", () => {
  it("returns default config when no config.json", () => {
    const dir = freshDir();
    assert.equal(getSessionConfig(dir).maxIterations, 0);
  });

  it("reads maxIterations from config", () => {
    const dir = freshDir();
    writeStwFile(dir, "config.json", JSON.stringify({ session: { maxIterations: 3 } }));
    assert.equal(getSessionConfig(dir).maxIterations, 3);
  });

  it("handles missing session field gracefully", () => {
    const dir = freshDir();
    writeStwFile(dir, "config.json", JSON.stringify({}));
    assert.equal(getSessionConfig(dir).maxIterations, 0);
  });
});

describe("Scenario 17: readTestResults", () => {
  it("returns null when no test-results.json", () => {
    const dir = freshDir();
    assert.equal(readTestResults(dir), null);
  });

  it("parses legacy format {passed:true}", () => {
    const dir = freshDir();
    writeStwFile(dir, "test-results.json", '{"passed":true}');
    const result = readTestResults(dir);
    assert.equal(result.passed, true);
  });

  it("parses rich format with counts", () => {
    const dir = freshDir();
    writeStwFile(dir, "test-results.json",
      JSON.stringify({ total: 10, passed: 10, failed: 0, suite: "jest", output: "All passed" })
    );
    const result = readTestResults(dir);
    assert.equal(result.total, 10);
    assert.equal(result.passed, 10);
    assert.equal(result.suite, "jest");
  });

  it("handles malformed JSON gracefully", () => {
    const dir = freshDir();
    writeStwFile(dir, "test-results.json", "not json");
    assert.equal(readTestResults(dir), null);
  });
});
