import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { parseAttackZones, generateLockdown, checkFileBounds, parseChangePlan, checkChangePlan, checkDepsChange, checkDirtyTree } from "../../src/engine/lockdown.js";
import { freshDir, writeStwFile, writePassingAnalysis } from "../test-helper.js";

function writeWorkspace(dir, content) {
  writeStwFile(dir, "STW-Workspace.md", content);
}

/** Create temp dir with git repo. Returns { dir, run }. */
function freshGitDir() {
  const dir = freshDir();
  const run = (args) => spawnSync("git", args, { cwd: dir, encoding: "utf-8", timeout: 5000 });
  run(["init"]);
  run(["config", "user.email", "t@t"]);
  run(["config", "user.name", "t"]);
  return { dir, run };
}

/** Commit all current files as baseline. */
function commitAll(run) {
  run(["add", "-A"]);
  run(["commit", "-m", "baseline"]);
}

describe("Lockdown — parseAttackZones", () => {
  it("parses ATTACK_ZONE comments outside code blocks", () => {
    const dir = freshDir();
    writeWorkspace(dir, "# W\n<!-- ATTACK_ZONE: src/* -->\n<!-- ATTACK_ZONE: tests/* -->");
    assert.deepEqual(parseAttackZones(dir), ["src/*", "tests/*"]);
  });

  it("ignores ATTACK_ZONE inside code blocks", () => {
    const dir = freshDir();
    writeWorkspace(dir, "# W\n```\n<!-- ATTACK_ZONE: src/* -->\n```");
    assert.deepEqual(parseAttackZones(dir), []);
  });

  it("returns empty array when no zones declared", () => {
    const dir = freshDir();
    writeWorkspace(dir, "# W\nNo zones here");
    assert.deepEqual(parseAttackZones(dir), []);
  });

  it("returns empty array when workspace file missing", () => {
    const dir = freshDir();
    assert.deepEqual(parseAttackZones(dir), []);
  });
});

describe("Lockdown — generateLockdown", () => {
  it("creates lockdown.json with parsed zones", () => {
    const dir = freshDir();
    writeWorkspace(dir, "# W\n<!-- ATTACK_ZONE: src/engine/* -->");
    const result = generateLockdown(dir);
    assert.deepEqual(result.attackZones, ["src/engine/*"]);
    assert.ok(result.generatedAt);
    assert.ok(result.rule);
  });
});

describe("Lockdown — checkFileBounds", () => {
  it("returns error when no ATTACK_ZONE declared", () => {
    const dir = freshDir();
    const result = checkFileBounds(dir);
    assert.equal(result.ok, false);
    assert.ok(result.error.includes("未声明 ATTACK_ZONE"));
  });

  it("passes when all modified files are inside zone", () => {
    const { dir, run } = freshGitDir();

    // Set up zone + baseline
    writeWorkspace(dir, "# W\n<!-- ATTACK_ZONE: src/* -->");
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "app.js"), "original");
    commitAll(run);

    // Only modify file inside zone
    writeFileSync(join(dir, "src", "app.js"), "modified");

    const result = checkFileBounds(dir);
    assert.equal(result.ok, true, "violations: " + JSON.stringify(result.violations));
  });

  it("detects violation when file outside zone is modified", () => {
    const { dir, run } = freshGitDir();

    writeWorkspace(dir, "# W\n<!-- ATTACK_ZONE: src/* -->");
    mkdirSync(join(dir, "src"), { recursive: true });
    mkdirSync(join(dir, "dist"), { recursive: true });
    writeFileSync(join(dir, "src", "app.js"), "original");
    writeFileSync(join(dir, "dist", "bundle.js"), "original");
    commitAll(run);

    // Modify both
    writeFileSync(join(dir, "src", "app.js"), "modified");
    writeFileSync(join(dir, "dist", "bundle.js"), "modified");

    const result = checkFileBounds(dir);
    assert.equal(result.ok, false);
    const v = result.violations.map((p) => p.replace(/\\/g, "/"));
    assert.ok(v.some((p) => p.includes("dist/bundle.js")), "should flag dist/bundle.js, got: " + JSON.stringify(v));
    assert.ok(!v.some((p) => p.includes("src/app.js")), "should allow src/app.js");
  });

  it("** wildcard matches nested directories", () => {
    const { dir, run } = freshGitDir();

    writeWorkspace(dir, "# W\n<!-- ATTACK_ZONE: src/** -->");
    mkdirSync(join(dir, "src", "deep"), { recursive: true });
    writeFileSync(join(dir, "src", "main.js"), "orig");
    writeFileSync(join(dir, "src", "deep", "nested.js"), "orig");
    commitAll(run);

    writeFileSync(join(dir, "src", "main.js"), "mod");
    writeFileSync(join(dir, "src", "deep", "nested.js"), "mod");

    const result = checkFileBounds(dir);
    assert.equal(result.ok, true, "violations: " + JSON.stringify(result.violations));
  });

  it("returns ok with no violations when no files changed", () => {
    const { dir, run } = freshGitDir();
    writeWorkspace(dir, "# W\n<!-- ATTACK_ZONE: src/* -->");
    commitAll(run);

    const result = checkFileBounds(dir);
    assert.equal(result.ok, true);
    assert.equal(result.totalFiles, 0);
  });
});

describe("Lockdown — parseChangePlan", () => {
  it("parses table rows from 变更计划声明 section", () => {
    const dir = freshDir();
    writeStwFile(dir, "Analysis-Template.md",
      "## 4.5 变更计划声明\n\n" +
      "| 文件 | 改动类型 | 理由 |\n" +
      "| :--- | :--- | :--- |\n" +
      "| src/app.js | fix | Fix login bug |\n" +
      "| tests/app.test.js | test | Add regression |\n"
    );
    const plan = parseChangePlan(dir);
    assert.equal(plan.length, 2);
    assert.equal(plan[0].file, "src/app.js");
    assert.equal(plan[0].type, "fix");
    assert.equal(plan[0].reason, "Fix login bug");
    assert.equal(plan[1].file, "tests/app.test.js");
  });

  it("returns empty array when Analysis-Template.md missing", () => {
    const dir = freshDir();
    assert.deepEqual(parseChangePlan(dir), []);
  });

  it("returns empty array when section not found", () => {
    const dir = freshDir();
    writeStwFile(dir, "Analysis-Template.md", "## 4. 初步方案\nSome content\n");
    assert.deepEqual(parseChangePlan(dir), []);
  });

  it("skips header and separator rows", () => {
    const dir = freshDir();
    writeStwFile(dir, "Analysis-Template.md",
      "## 4.5 变更计划声明\n\n" +
      "| 文件 | 改动类型 | 理由 |\n" +
      "| :--- | :--- | :--- |\n" +
      "| | | |\n" + // empty row
      "| src/lib.js | refactor | Cleanup |\n"
    );
    const plan = parseChangePlan(dir);
    assert.equal(plan.length, 1);
    assert.equal(plan[0].file, "src/lib.js");
  });
});

describe("Lockdown — checkChangePlan", () => {
  it("ok when all modified files are in the change plan", () => {
    const { dir, run } = freshGitDir();

    writeStwFile(dir, "Analysis-Template.md",
      "## 4.5 变更计划声明\n\n" +
      "| src/app.js | fix | Fix login bug |\n"
    );
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "app.js"), "original");
    commitAll(run);

    writeFileSync(join(dir, "src", "app.js"), "modified");

    const result = checkChangePlan(dir);
    assert.equal(result.ok, true);
    assert.deepEqual(result.unplanned, []);
  });

  it("detects unplanned files", () => {
    const { dir, run } = freshGitDir();

    writeStwFile(dir, "Analysis-Template.md",
      "## 4.5 变更计划声明\n\n" +
      "| src/app.js | fix | Fix login bug |\n"
    );
    mkdirSync(join(dir, "src"), { recursive: true });
    mkdirSync(join(dir, "dist"), { recursive: true });
    writeFileSync(join(dir, "src", "app.js"), "original");
    writeFileSync(join(dir, "dist", "bundle.js"), "original");
    commitAll(run);

    writeFileSync(join(dir, "src", "app.js"), "modified");
    writeFileSync(join(dir, "dist", "bundle.js"), "modified");

    const result = checkChangePlan(dir);
    assert.equal(result.ok, false);
    const unplanned = result.unplanned.map((p) => p.replace(/\\/g, "/"));
    assert.ok(unplanned.some((p) => p.includes("dist/bundle.js")),
      "should flag dist/bundle.js as unplanned, got: " + JSON.stringify(unplanned));
  });

  it("returns error when no change plan declared", () => {
    const { dir, run } = freshGitDir();

    writeStwFile(dir, "Analysis-Template.md",
      "## 4. 初步方案\nNo change plan here.\n"
    );
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "app.js"), "original");
    commitAll(run);

    writeFileSync(join(dir, "src", "app.js"), "modified");

    const result = checkChangePlan(dir);
    assert.equal(result.ok, false);
    assert.ok(result.error.includes("未声明变更计划"),
      "should report missing change plan, got: " + JSON.stringify(result));
  });

  it("ok in non-git directory (no changed files)", () => {
    const dir = freshDir();
    writeStwFile(dir, "Analysis-Template.md",
      "## 4.5 变更计划声明\n\n" +
      "| src/app.js | fix | Fix bug |\n"
    );
    const result = checkChangePlan(dir);
    assert.equal(result.ok, true);
  });
});

describe("Lockdown — checkDepsChange", () => {
  it("warns when package.json is modified", () => {
    const { dir, run } = freshGitDir();

    writeFileSync(join(dir, "package.json"), '{"name":"test"}');
    commitAll(run);

    writeFileSync(join(dir, "package.json"), '{"name":"test","version":"2.0"}');

    const result = checkDepsChange(dir);
    assert.equal(result.ok, true); // never blocks
    assert.ok(result.warning, "should have warning");
    assert.ok(result.changed.some((f) => f.replace(/\\/g, "/").includes("package.json")));
  });

  it("no warning when only non-dep files modified", () => {
    const { dir, run } = freshGitDir();

    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "app.js"), "original");
    commitAll(run);

    writeFileSync(join(dir, "src", "app.js"), "modified");

    const result = checkDepsChange(dir);
    assert.equal(result.ok, true);
    assert.equal(result.warning, null);
    assert.equal(result.changed.length, 0);
  });

  it("no warning in non-git directory", () => {
    const dir = freshDir();
    const result = checkDepsChange(dir);
    assert.equal(result.ok, true);
    assert.equal(result.warning, null);
    assert.equal(result.changed.length, 0);
  });
});

describe("Lockdown — checkDirtyTree", () => {
  it("detects uncommitted changes in git repo", () => {
    const { dir, run } = freshGitDir();

    writeFileSync(join(dir, "untracked.txt"), "dirty");
    // Don't commit — should be detected as dirty

    const result = checkDirtyTree(dir);
    assert.equal(result.dirty, true);
    assert.ok(result.files.some((f) => f.replace(/\\/g, "/").includes("untracked.txt")));
  });

  it("returns clean for committed repo", () => {
    const { dir, run } = freshGitDir();

    writeFileSync(join(dir, "committed.txt"), "clean");
    commitAll(run);

    const result = checkDirtyTree(dir);
    assert.equal(result.dirty, false);
    assert.equal(result.files.length, 0);
  });

  it("detects .stw residue from aborted session", () => {
    const { dir, run } = freshGitDir();

    mkdirSync(join(dir, ".stw"), { recursive: true });
    writeFileSync(join(dir, ".stw", ".progress.json"), '{"phase":1}');

    const result = checkDirtyTree(dir);
    assert.equal(result.dirty, true);
    assert.equal(result.stwResidue, true);
  });

  it("returns notGit for non-git directory", () => {
    const dir = freshDir();
    writeFileSync(join(dir, "file.txt"), "test");

    const result = checkDirtyTree(dir);
    assert.equal(result.dirty, false);
    assert.equal(result.notGit, true);
  });
});
