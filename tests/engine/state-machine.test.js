import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  startSession,
  getCurrentPhase,
  advancePhase,
} from "../../src/engine/state-machine.js";

function freshDir() {
  const dir = join(tmpdir(), "stw-test-" + Date.now() + "-" + Math.random().toString(36).slice(2));
  mkdirSync(join(dir, ".stw"), { recursive: true });
  return dir;
}

function writeFile(dir, name, content) {
  writeFileSync(join(dir, ".stw", name), content);
}

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
    writeFile(dir, "Analysis-Template.md", "# Analysis");
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
    writeFile(dir, "Analysis-Template.md", "# A");
    writeFile(dir, "STW-Workspace.md", "# Workspace\n<!-- ATTACK_ZONE: src/* -->");
    startSession(dir);
    advancePhase(dir); // → phase 2
    const result = advancePhase(dir); // → phase 3
    assert.equal(result.ok, true);
    assert.equal(result.phase.id, 3);
  });

  it("phase 2 blocks when ATTACK_ZONE only inside code block", () => {
    const dir = freshDir();
    writeFile(dir, "Analysis-Template.md", "# A");
    writeFile(dir, "STW-Workspace.md", "# Template\n```\n<!-- ATTACK_ZONE: src/* -->\n```");
    startSession(dir);
    advancePhase(dir); // → phase 2
    const result = advancePhase(dir);
    assert.equal(result.ok, false);
  });

  it("phase 2 blocks without ATTACK_ZONE", () => {
    const dir = freshDir();
    writeFile(dir, "Analysis-Template.md", "# A");
    writeFile(dir, "STW-Workspace.md", "# No zone declaration");
    startSession(dir);
    advancePhase(dir); // → phase 2
    const result = advancePhase(dir);
    assert.equal(result.ok, false);
  });

  it("phase 3 → 4 succeeds with lockdown.json", () => {
    const dir = freshDir();
    writeFile(dir, "Analysis-Template.md", "# A");
    writeFile(dir, "STW-Workspace.md", "# W\n<!-- ATTACK_ZONE: src/* -->");
    writeFile(dir, "lockdown.json", "{}");
    startSession(dir);
    advancePhase(dir); // → 2
    advancePhase(dir); // → 3
    const result = advancePhase(dir); // → 4
    assert.equal(result.ok, true);
    assert.equal(result.phase.id, 4);
  });

  it("phase 5 → complete succeeds with Summary-Template.md", () => {
    const dir = freshDir();
    writeFile(dir, "Analysis-Template.md", "# A");
    writeFile(dir, "STW-Workspace.md", "# W\n<!-- ATTACK_ZONE: src/* -->");
    writeFile(dir, "lockdown.json", "{}");
    writeFile(dir, "test-results.json", '{"passed":true}');
    writeFile(dir, "Summary-Template.md", "# S");
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
    writeFile(dir, "Analysis-Template.md", "# A");
    writeFile(dir, "STW-Workspace.md", "# W\n<!-- ATTACK_ZONE: src/* -->");
    startSession(dir);

    // Phase 1 → 2
    assert.equal(advancePhase(dir).phase.id, 2);
    // Phase 2 → 3
    assert.equal(advancePhase(dir).phase.id, 3);
    // Phase 3 → 4
    writeFile(dir, "lockdown.json", "{}");
    assert.equal(advancePhase(dir).phase.id, 4);
    // Phase 4 → 5
    writeFile(dir, "test-results.json", '{"passed":true}');
    assert.equal(advancePhase(dir).phase.id, 5);
    // Phase 5 → complete
    writeFile(dir, "Summary-Template.md", "# S");
    const r = advancePhase(dir);
    assert.equal(r.ok, true);
    assert.equal(r.done, true);
    assert.equal(r.phase, "complete");
  });
});
