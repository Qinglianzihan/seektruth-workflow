import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseAttackZones, generateLockdown } from "../../src/engine/lockdown.js";

function freshDir() {
  const dir = join(tmpdir(), "stw-lockdown-" + Date.now());
  mkdirSync(join(dir, ".stw"), { recursive: true });
  return dir;
}

function writeWorkspace(dir, content) {
  writeFileSync(join(dir, ".stw", "STW-Workspace.md"), content);
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
