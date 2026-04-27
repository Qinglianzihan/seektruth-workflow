import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  startSession,
  getCurrentPhase,
  advancePhase,
  abortSession,
  rollbackSession,
} from "../../src/engine/state-machine.js";
import { freshDir, writeStwFile, writePassingAnalysis } from "../test-helper.js";

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
