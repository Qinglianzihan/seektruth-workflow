import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { parseAttackZones, generateLockdown, checkFileBounds } from "../../src/engine/lockdown.js";
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
