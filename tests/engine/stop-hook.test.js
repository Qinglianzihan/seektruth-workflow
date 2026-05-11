import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runStopHook, readStdinSafe } from "../../src/engine/stop-hook.js";
import { freshDir, writeStwFile, readEventsForTest } from "../test-helper.js";

function withProgress(dir, phase, taskDescription = "test task") {
  writeStwFile(dir, ".progress.json", JSON.stringify({
    phase,
    startedAt: new Date().toISOString(),
    completedPhases: [],
    iterations: [],
    taskDescription,
  }, null, 2));
}

const PHASE_READER = (phase, taskDescription = "test") => () => ({
  phase,
  phaseInfo: null,
  startedAt: new Date().toISOString(),
  completedPhases: [],
  iterations: [],
  taskDescription,
});

describe("runStopHook — protocol", () => {
  it("exits 0 silently when no .stw/.progress.json exists", () => {
    const dir = freshDir();
    const result = runStopHook(
      { rootDir: dir },
      { phaseReader: () => { throw new Error("should not read phase"); } }
    );
    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
  });

  it("exits 0 when stop_hook_active=true (防无限循环)", () => {
    const dir = freshDir();
    withProgress(dir, 2);
    const result = runStopHook(
      { rootDir: dir, stdinPayload: JSON.stringify({ stop_hook_active: true }) },
      { phaseReader: () => { throw new Error("should not read phase"); } }
    );
    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
  });
});

describe("runStopHook — phase gating (whitelist 1-4)", () => {
  for (const phase of [1, 2, 3, 4]) {
    it(`exits 2 with 回到阶段 stderr when phase=${phase} and stop_hook_active=false`, () => {
      const dir = freshDir();
      withProgress(dir, phase);
      const result = runStopHook(
        { rootDir: dir, stdinPayload: "{}" },
        { phaseReader: PHASE_READER(phase, "my task") }
      );
      assert.equal(result.exitCode, 2);
      assert.ok(result.stderr.includes(`阶段 ${phase}`), `expected 阶段 ${phase} in stderr`);
      assert.ok(result.stderr.includes("(event: Stop)"));
      assert.ok(result.stderr.includes("任务尚未完成"));
    });
  }

  it("exits 0 when phase=5 (all phases passed, session.complete imminent)", () => {
    const dir = freshDir();
    withProgress(dir, 5);
    const result = runStopHook(
      { rootDir: dir, stdinPayload: "{}" },
      { phaseReader: PHASE_READER(5) }
    );
    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
  });

  it('exits 0 when phase is the string "complete"', () => {
    const dir = freshDir();
    withProgress(dir, "complete");
    const result = runStopHook(
      { rootDir: dir, stdinPayload: "{}" },
      { phaseReader: PHASE_READER("complete") }
    );
    assert.equal(result.exitCode, 0);
  });

  it("exits 0 when phase is an unexpected/bogus value (defensive)", () => {
    const dir = freshDir();
    withProgress(dir, 99);
    const result = runStopHook(
      { rootDir: dir, stdinPayload: "{}" },
      { phaseReader: PHASE_READER(99) }
    );
    assert.equal(result.exitCode, 0);
  });
});

describe("runStopHook — stdin parsing (fail-open)", () => {
  it("treats empty stdin as first-trigger (blocks)", () => {
    const dir = freshDir();
    withProgress(dir, 1);
    const result = runStopHook(
      { rootDir: dir, stdinPayload: "" },
      { phaseReader: PHASE_READER(1) }
    );
    assert.equal(result.exitCode, 2);
  });

  it("treats non-JSON stdin as first-trigger (blocks)", () => {
    const dir = freshDir();
    withProgress(dir, 1);
    const result = runStopHook(
      { rootDir: dir, stdinPayload: "not { json at all" },
      { phaseReader: PHASE_READER(1) }
    );
    assert.equal(result.exitCode, 2);
  });

  it("treats JSON without stop_hook_active field as first-trigger", () => {
    const dir = freshDir();
    withProgress(dir, 3);
    const result = runStopHook(
      { rootDir: dir, stdinPayload: JSON.stringify({ some_other_field: "x" }) },
      { phaseReader: PHASE_READER(3) }
    );
    assert.equal(result.exitCode, 2);
  });

  it("treats stop_hook_active=false literal as first-trigger", () => {
    const dir = freshDir();
    withProgress(dir, 2);
    const result = runStopHook(
      { rootDir: dir, stdinPayload: JSON.stringify({ stop_hook_active: false }) },
      { phaseReader: PHASE_READER(2) }
    );
    assert.equal(result.exitCode, 2);
  });
});

describe("runStopHook — events instrumentation", () => {
  it("emits stop-hook.run exitCode=2 when blocking", () => {
    const dir = freshDir();
    withProgress(dir, 3, "some task");
    runStopHook(
      { rootDir: dir, stdinPayload: "{}" },
      { phaseReader: PHASE_READER(3, "some task") }
    );
    const events = readEventsForTest(dir);
    const ev = events.find((e) => e.type === "stop-hook.run");
    assert.ok(ev, "expected stop-hook.run event");
    assert.equal(ev.data.exitCode, 2);
    assert.equal(ev.data.phase, 3);
  });

  it("emits stop-hook.run exitCode=0 with reason=stop_hook_active", () => {
    const dir = freshDir();
    withProgress(dir, 2);
    runStopHook(
      { rootDir: dir, stdinPayload: JSON.stringify({ stop_hook_active: true }) },
      { phaseReader: PHASE_READER(2) }
    );
    const events = readEventsForTest(dir);
    const ev = events.find((e) => e.type === "stop-hook.run");
    assert.ok(ev);
    assert.equal(ev.data.exitCode, 0);
    assert.equal(ev.data.reason, "stop_hook_active");
  });

  it("does NOT emit events when no .progress.json (silent early return)", () => {
    const dir = freshDir();
    runStopHook({ rootDir: dir }, {});
    const events = readEventsForTest(dir);
    assert.equal(events.length, 0);
  });
});

describe("runStopHook — integration read of .progress.json via default phaseReader", () => {
  it("reads phase from .stw/.progress.json when no DI override given", () => {
    const dir = freshDir();
    withProgress(dir, 4, "real fs read");
    const result = runStopHook({ rootDir: dir, stdinPayload: "{}" });
    assert.equal(result.exitCode, 2);
    assert.ok(result.stderr.includes("阶段 4"));
    assert.ok(result.stderr.includes("real fs read"));
  });
});

// T11.bis R2: phase=4 首行措辞应突出"需要独立审查员"而非笼统"五阶段门禁未全部通过"
describe("runStopHook — T11.bis R2 phase=4 首行措辞", () => {
  it("phase=4 首行强调独立审查员签字", () => {
    const dir = freshDir();
    withProgress(dir, 4, "phase4 wording");
    const result = runStopHook(
      { rootDir: dir, stdinPayload: "{}" },
      { phaseReader: PHASE_READER(4, "phase4 wording") }
    );
    assert.equal(result.exitCode, 2);
    const firstLine = result.stderr.split("\n")[0];
    assert.ok(
      firstLine.includes("独立审查员"),
      `phase=4 首行应含 '独立审查员'，实际: ${firstLine}`,
    );
    assert.ok(!firstLine.includes("五阶段门禁未全部通过"));
  });

  it("phase=3 首行保留原措辞（回归）", () => {
    const dir = freshDir();
    withProgress(dir, 3, "phase3");
    const result = runStopHook(
      { rootDir: dir, stdinPayload: "{}" },
      { phaseReader: PHASE_READER(3, "phase3") }
    );
    const firstLine = result.stderr.split("\n")[0];
    assert.ok(firstLine.includes("五阶段门禁未全部通过"));
  });
});

// T11.bis R5: stop_hook_active 分支 event 埋 phase 字段（约束: 不读 phase → 显式 null）
describe("runStopHook — T11.bis R5 stop_hook_active 埋 phase", () => {
  it("stop_hook_active=true 时 event.data.phase 显式为 null", () => {
    const dir = freshDir();
    withProgress(dir, 2);
    runStopHook(
      { rootDir: dir, stdinPayload: JSON.stringify({ stop_hook_active: true }) },
      { phaseReader: () => { throw new Error("should not read phase"); } }
    );
    const events = readEventsForTest(dir);
    const ev = events.find((e) => e.type === "stop-hook.run");
    assert.ok(ev);
    assert.equal(ev.data.phase, null);
    assert.equal(ev.data.reason, "stop_hook_active");
  });
});

// T11.bis R6: phase 异常值走 reason=phase-unknown，phase=5/"complete" 走 phase-complete
describe("runStopHook — T11.bis R6 phase 异常值区分", () => {
  it("phase=5 → reason=phase-complete", () => {
    const dir = freshDir();
    withProgress(dir, 5);
    runStopHook(
      { rootDir: dir, stdinPayload: "{}" },
      { phaseReader: PHASE_READER(5) }
    );
    const ev = readEventsForTest(dir).find((e) => e.type === "stop-hook.run");
    assert.ok(ev);
    assert.equal(ev.data.reason, "phase-complete");
  });

  it("phase='complete' → reason=phase-complete", () => {
    const dir = freshDir();
    withProgress(dir, "complete");
    runStopHook(
      { rootDir: dir, stdinPayload: "{}" },
      { phaseReader: PHASE_READER("complete") }
    );
    const ev = readEventsForTest(dir).find((e) => e.type === "stop-hook.run");
    assert.ok(ev);
    assert.equal(ev.data.reason, "phase-complete");
  });

  it("phase=99 (未知数字) → reason=phase-unknown", () => {
    const dir = freshDir();
    withProgress(dir, 99);
    runStopHook(
      { rootDir: dir, stdinPayload: "{}" },
      { phaseReader: PHASE_READER(99) }
    );
    const ev = readEventsForTest(dir).find((e) => e.type === "stop-hook.run");
    assert.ok(ev);
    assert.equal(ev.data.reason, "phase-unknown");
    assert.equal(ev.data.phase, 99);
  });

  it("phase=null (奇异值) → reason=phase-unknown", () => {
    const dir = freshDir();
    withProgress(dir, null);
    runStopHook(
      { rootDir: dir, stdinPayload: "{}" },
      { phaseReader: PHASE_READER(null) }
    );
    const ev = readEventsForTest(dir).find((e) => e.type === "stop-hook.run");
    assert.ok(ev);
    assert.equal(ev.data.reason, "phase-unknown");
    assert.equal(ev.data.phase, null);
  });
});

// T11.bis R3: readStdinSafe() 在各种 stdin 环境下行为正确（防 TTY 阻塞 + 容错）
describe("readStdinSafe — T11.bis R3 四种 stdin 情形", () => {
  it("TTY 环境返回空字符串，不阻塞", () => {
    const orig = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    try {
      assert.equal(readStdinSafe(), "");
    } finally {
      if (orig) Object.defineProperty(process.stdin, "isTTY", orig);
      else delete process.stdin.isTTY;
    }
  });

  it("返回字符串类型（非 null/undefined）", () => {
    const s = readStdinSafe();
    assert.equal(typeof s, "string");
  });

  it("被 try/catch 保护 —— 任何异常都转成空字符串", () => {
    assert.doesNotThrow(() => readStdinSafe());
  });

  it("TTY 检测缺失时不抛异常（未定义的 isTTY 同样处理）", () => {
    const orig = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
    try {
      Object.defineProperty(process.stdin, "isTTY", { value: undefined, configurable: true });
      // 此路径会尝试 readFileSync(0)；在测试环境 fd 0 可能抛 —— 应被 catch 捕获返回 ""
      assert.equal(typeof readStdinSafe(), "string");
    } finally {
      if (orig) Object.defineProperty(process.stdin, "isTTY", orig);
      else delete process.stdin.isTTY;
    }
  });
});
