import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_THRESHOLD,
  DEFAULT_WINDOW,
  extractFilePath,
  countConsecutiveEdits,
  detectLoop,
  detectLoopFromDisk,
  readHookRunEventsSync,
} from "../../src/engine/loop-detector.js";
import { freshDir, writeStwFile, readEventsForTest } from "../test-helper.js";
import { appendEvent } from "../../src/engine/events.js";

function mkEdit(file, task = "test") {
  return { type: "hook.run", task, data: { filePath: file, event: "PostToolUse" } };
}

describe("extractFilePath", () => {
  it("returns file_path for Edit tool payload", () => {
    const payload = JSON.stringify({
      tool_name: "Edit",
      tool_input: { file_path: "/abs/foo.js", old_string: "a", new_string: "b" },
    });
    assert.equal(extractFilePath(payload), "/abs/foo.js");
  });

  it("returns file_path for Write tool payload", () => {
    const payload = JSON.stringify({
      tool_name: "Write",
      tool_input: { file_path: "/abs/bar.js", content: "x" },
    });
    assert.equal(extractFilePath(payload), "/abs/bar.js");
  });

  it("returns null for Bash tool payload", () => {
    const payload = JSON.stringify({
      tool_name: "Bash",
      tool_input: { command: "ls" },
    });
    assert.equal(extractFilePath(payload), null);
  });

  it("returns null for empty string (stdin missing / TTY)", () => {
    assert.equal(extractFilePath(""), null);
  });

  it("returns null for invalid JSON", () => {
    assert.equal(extractFilePath("not json"), null);
  });

  it("returns null when file_path missing", () => {
    const payload = JSON.stringify({ tool_name: "Edit", tool_input: {} });
    assert.equal(extractFilePath(payload), null);
  });

  it("returns null for non-string payload", () => {
    assert.equal(extractFilePath(null), null);
    assert.equal(extractFilePath(undefined), null);
    assert.equal(extractFilePath(42), null);
  });
});

describe("countConsecutiveEdits", () => {
  it("returns 0 when no matching events", () => {
    const events = [mkEdit("/a.js"), mkEdit("/b.js")];
    assert.equal(countConsecutiveEdits(events, "/c.js", { currentTask: "test" }), 0);
  });

  it("counts 3 consecutive edits of same file", () => {
    const events = [mkEdit("/a.js"), mkEdit("/a.js"), mkEdit("/a.js")];
    assert.equal(countConsecutiveEdits(events, "/a.js", { currentTask: "test" }), 3);
  });

  it("breaks on a different file in the middle — A-B-A-A counts only 2", () => {
    const events = [mkEdit("/a.js"), mkEdit("/b.js"), mkEdit("/a.js"), mkEdit("/a.js")];
    assert.equal(countConsecutiveEdits(events, "/a.js", { currentTask: "test" }), 2);
  });

  it("breaks on a different task boundary", () => {
    const events = [
      mkEdit("/a.js", "old-task"),
      mkEdit("/a.js", "test"),
      mkEdit("/a.js", "test"),
    ];
    assert.equal(countConsecutiveEdits(events, "/a.js", { currentTask: "test" }), 2);
  });

  it("ignores non-hook.run events interleaved", () => {
    const events = [
      mkEdit("/a.js"),
      { type: "gate.run", task: "test", data: {} },
      mkEdit("/a.js"),
      { type: "check.summary", task: "test", data: {} },
      mkEdit("/a.js"),
    ];
    assert.equal(countConsecutiveEdits(events, "/a.js", { currentTask: "test" }), 3);
  });

  it("returns 0 for empty events array / invalid filePath", () => {
    assert.equal(countConsecutiveEdits([], "/a.js", { currentTask: "test" }), 0);
    assert.equal(countConsecutiveEdits([mkEdit("/a.js")], "", { currentTask: "test" }), 0);
    assert.equal(countConsecutiveEdits(null, "/a.js", { currentTask: "test" }), 0);
  });

  it("breaks on hook.run event missing filePath data", () => {
    const events = [
      { type: "hook.run", task: "test", data: { event: "PostToolUse" } },
      mkEdit("/a.js"),
      mkEdit("/a.js"),
    ];
    assert.equal(countConsecutiveEdits(events, "/a.js", { currentTask: "test" }), 2);
  });
});

describe("detectLoop", () => {
  it("shouldWarn=false when count below threshold", () => {
    const events = [mkEdit("/a.js"), mkEdit("/a.js")];
    const r = detectLoop(events, "/a.js", { currentTask: "test" });
    assert.equal(r.shouldWarn, false);
    assert.equal(r.count, 2);
    assert.equal(r.threshold, DEFAULT_THRESHOLD);
  });

  it("shouldWarn=true when count reaches threshold", () => {
    const events = [mkEdit("/a.js"), mkEdit("/a.js"), mkEdit("/a.js")];
    const r = detectLoop(events, "/a.js", { currentTask: "test" });
    assert.equal(r.shouldWarn, true);
    assert.equal(r.count, 3);
  });

  it("shouldWarn=true remains true when count exceeds threshold (no reset)", () => {
    const events = [mkEdit("/a.js"), mkEdit("/a.js"), mkEdit("/a.js"), mkEdit("/a.js")];
    const r = detectLoop(events, "/a.js", { currentTask: "test" });
    assert.equal(r.shouldWarn, true);
    assert.equal(r.count, 4);
  });

  it("honors custom threshold opt", () => {
    const events = [mkEdit("/a.js"), mkEdit("/a.js")];
    const r = detectLoop(events, "/a.js", { currentTask: "test", threshold: 2 });
    assert.equal(r.shouldWarn, true);
    assert.equal(r.count, 2);
    assert.equal(r.threshold, 2);
  });
});

describe("detectLoopFromDisk — real IO smoke", () => {
  it("reads events.jsonl and applies detectLoop", () => {
    const dir = freshDir();
    writeStwFile(dir, ".progress.json", JSON.stringify({
      phase: 3,
      startedAt: new Date().toISOString(),
      completedPhases: [],
      iterations: [],
      taskDescription: "t16-smoke",
    }, null, 2));
    for (let i = 0; i < 3; i++) {
      appendEvent(dir, "hook.run", { event: "PostToolUse", filePath: "/abs/foo.js" });
    }
    const result = detectLoopFromDisk(dir, "/abs/foo.js", {
      currentTask: "t16-smoke",
    });
    assert.equal(result.shouldWarn, true);
    assert.equal(result.count, 3);
    const all = readEventsForTest(dir);
    assert.equal(all.length, 3);
  });

  it("returns count=0 when events.jsonl missing", () => {
    const dir = freshDir();
    const result = detectLoopFromDisk(dir, "/abs/foo.js", { currentTask: "t" });
    assert.equal(result.count, 0);
    assert.equal(result.shouldWarn, false);
  });

  it("readHookRunEventsSync filters to hook.run only", () => {
    const dir = freshDir();
    writeStwFile(dir, ".progress.json", JSON.stringify({
      phase: 3,
      startedAt: new Date().toISOString(),
      completedPhases: [],
      iterations: [],
      taskDescription: "t",
    }, null, 2));
    appendEvent(dir, "hook.run", { event: "PostToolUse", filePath: "/a.js" });
    appendEvent(dir, "gate.run", { ok: true });
    appendEvent(dir, "check.summary", {});
    appendEvent(dir, "hook.run", { event: "PostToolUse", filePath: "/a.js" });
    const events = readHookRunEventsSync(dir, 10);
    assert.equal(events.length, 2);
    assert.ok(events.every((e) => e.type === "hook.run"));
  });

  it("readHookRunEventsSync honors limit window", () => {
    const dir = freshDir();
    writeStwFile(dir, ".progress.json", JSON.stringify({
      phase: 3, startedAt: new Date().toISOString(), completedPhases: [], iterations: [],
      taskDescription: "t",
    }, null, 2));
    for (let i = 0; i < 10; i++) {
      appendEvent(dir, "hook.run", { event: "PostToolUse", filePath: `/${i}.js` });
    }
    const events = readHookRunEventsSync(dir, 3);
    assert.equal(events.length, 3);
  });

  it("DEFAULT_WINDOW export is a positive integer", () => {
    assert.equal(typeof DEFAULT_WINDOW, "number");
    assert.ok(DEFAULT_WINDOW > 0);
  });
});
