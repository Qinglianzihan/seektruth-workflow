import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  startForge,
  getForgeStatus,
  inspectForgeAgent,
  advanceForge,
  abortForge,
  AGENTS,
  runForgeAgents,
  acceptForge,
} from "../../src/engine/forge.js";
import { freshDir } from "../test-helper.js";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

describe("Forge — session orchestration", () => {
  it("starts a forge session with tracked agents and round files", () => {
    const dir = freshDir();
    const result = startForge(dir, "AI狼人杀");

    assert.equal(result.ok, true);
    assert.equal(result.session.idea, "AI狼人杀");
    assert.equal(result.session.phase, "diverge");
    assert.equal(result.session.status, "running");
    assert.ok(existsSync(join(dir, ".stw", "forge", "session.json")));
    assert.ok(existsSync(join(dir, ".stw", "forge", "blackboard.md")));

    for (const agent of AGENTS) {
      const agentPath = join(dir, ".stw", "forge", "agents", `${agent.id}.json`);
      assert.ok(existsSync(agentPath), `missing ${agent.id}`);
      const data = readJson(agentPath);
      assert.equal(data.status, "pending");
      assert.equal(data.round, "001-diverge");
    }
  });

  it("status reports aggregate agent counts and metrics", () => {
    const dir = freshDir();
    startForge(dir, "AI狼人杀");

    const status = getForgeStatus(dir);

    assert.equal(status.ok, true);
    assert.equal(status.session.phase, "diverge");
    assert.equal(status.agents.total, AGENTS.length);
    assert.equal(status.agents.pending, AGENTS.length);
    assert.equal(status.metrics.mustAnswerQuestions, 0);
  });

  it("inspect returns one agent state and output path", () => {
    const dir = freshDir();
    startForge(dir, "AI狼人杀");

    const result = inspectForgeAgent(dir, "architect");

    assert.equal(result.ok, true);
    assert.equal(result.agent.id, "architect");
    assert.ok(result.agent.outputFile.endsWith("architect.md"));
  });

  it("advance blocks until all diverge outputs are completed", () => {
    const dir = freshDir();
    startForge(dir, "AI狼人杀");

    const result = advanceForge(dir);

    assert.equal(result.ok, false);
    assert.match(result.error, /未完成/);
  });

  it("advance from diverge to user-confirm after valid agent outputs", () => {
    const dir = freshDir();
    startForge(dir, "AI狼人杀");

    for (const agent of AGENTS) {
      const agentPath = join(dir, ".stw", "forge", "agents", `${agent.id}.json`);
      const data = readJson(agentPath);
      writeFileSync(join(dir, data.outputFile), [
        "## 核心判断",
        "AI狼人杀需要先确定单人AI陪玩还是AI主持真人局。",
        "## 必须追问用户的问题",
        "1. 第一版是否只做单人和AI玩？",
        "## 隐性需求",
        "- 信息隔离",
        "## 最大风险",
        "- AI泄露隐藏身份",
        "## 建议不做",
        "- 联机和语音",
      ].join("\n"));
      data.status = "completed";
      data.finishedAt = new Date().toISOString();
      data.quality.schemaValid = true;
      writeFileSync(agentPath, JSON.stringify(data, null, 2));
    }

    const result = advanceForge(dir);
    const session = readJson(join(dir, ".stw", "forge", "session.json"));

    assert.equal(result.ok, true);
    assert.equal(result.phase, "user-confirm");
    assert.equal(session.gates.divergeComplete, true);
    assert.ok(existsSync(join(dir, ".stw", "forge", "questions.md")));
  });

  it("accept writes final requirements and starts normal STW workflow", () => {
    const dir = freshDir();
    startForge(dir, "AI狼人杀");

    for (const agent of AGENTS) {
      const agentPath = join(dir, ".stw", "forge", "agents", `${agent.id}.json`);
      const data = readJson(agentPath);
      writeFileSync(join(dir, data.outputFile), [
        "## 核心判断",
        `${agent.role} 认为第一版先做单人 AI 陪玩。`,
        "## 必须追问用户的问题",
        "1. 第一版是否只做单人？",
        "## 隐性需求",
        "- 信息隔离",
        "## 最大风险",
        "- AI泄露隐藏身份",
        "## 建议不做",
        "- 联机和语音",
      ].join("\n"));
      data.status = "completed";
      data.finishedAt = new Date().toISOString();
      data.quality.schemaValid = true;
      writeFileSync(agentPath, JSON.stringify(data, null, 2));
    }

    advanceForge(dir);
    const result = acceptForge(dir, "确认：第一版只做单人 AI 陪玩，不做联机。");
    const session = readJson(join(dir, ".stw", "forge", "session.json"));
    const progress = readJson(join(dir, ".stw", ".progress.json"));
    const requirements = readFileSync(join(dir, ".stw", "forge", "requirements.md"), "utf-8");

    assert.equal(result.ok, true);
    assert.equal(session.status, "done");
    assert.equal(session.gates.userConfirmed, true);
    assert.equal(progress.phase, 1);
    assert.match(progress.taskDescription, /requirements\.md/);
    assert.match(requirements, /确认：第一版只做单人/);
  });




  it("runForgeAgents supports claude provider", async () => {
    const dir = freshDir();
    startForge(dir, "AI狼人杀");
    const calls = [];
    const fakeSpawn = (cmd, args) => {
      calls.push({ cmd, args });
      return {
        status: 0,
        stdout: [
          "## 核心判断",
          "Claude Code provider should print output directly.",
          "## 必须追问用户的问题",
          "1. 是否只做 MVP？",
          "## 隐性需求",
          "- 信息隔离",
          "## 最大风险",
          "- 权限泄露风险",
          "## 建议不做",
          "- 大而全平台",
        ].join("\n"),
        stderr: "",
      };
    };

    const result = await runForgeAgents(dir, { provider: "claude", only: ["qa"], spawn: fakeSpawn });
    const qa = inspectForgeAgent(dir, "qa").agent;

    assert.equal(result.ok, true);
    assert.ok(["claude", "claude.cmd", "powershell.exe"].includes(calls[0].cmd));
    assert.ok(calls[0].args.join(" ").includes("--print"));
    assert.equal(qa.status, "completed");
  });
  it("runForgeAgents defaults to codex exec provider", async () => {
    const dir = freshDir();
    startForge(dir, "AI狼人杀");
    const calls = [];
    const fakeSpawn = (cmd, args) => {
      calls.push({ cmd, args });
      const outIdx = args.indexOf("-o");
      const outputPath = args[outIdx + 1];
      writeFileSync(outputPath, [
        "## 核心判断",
        "默认应调用当前 Codex CLI 模型。",
        "## 必须追问用户的问题",
        "1. 是否做单人 AI 陪玩？",
        "## 隐性需求",
        "- 信息隔离",
        "## 最大风险",
        "- AI 泄露身份风险",
        "## 建议不做",
        "- 联机语音",
      ].join("\n"));
      return { status: 0, stdout: "", stderr: "" };
    };

    const result = await runForgeAgents(dir, { only: ["architect"], spawn: fakeSpawn });
    const architect = inspectForgeAgent(dir, "architect").agent;

    assert.equal(result.ok, true);
    assert.ok(["codex", "codex.cmd"].includes(calls[0].cmd));
    assert.ok(calls[0].args.includes("exec"));
    assert.ok(calls[0].args.includes("-C"));
    assert.equal(architect.status, "completed");
  });
  it("runForgeAgents calls model client and writes completed agent outputs", async () => {
    const dir = freshDir();
    startForge(dir, "AI狼人杀");
    const calls = [];
    const client = async ({ agent, session, prompt }) => {
      calls.push({ agent: agent.id, idea: session.idea, prompt });
      return [
        "## 核心判断",
        `${agent.role} 认为第一版要先控制范围。`,
        "## 必须追问用户的问题",
        "1. 第一版是否只做单人和 AI 玩？",
        "## 隐性需求",
        "- 信息隔离",
        "## 最大风险",
        "- AI 泄露隐藏身份",
        "## 建议不做",
        "- 联机和语音",
      ].join("\n");
    };

    const result = await runForgeAgents(dir, { client });
    const status = getForgeStatus(dir);
    const architect = inspectForgeAgent(dir, "architect").agent;

    assert.equal(result.ok, true);
    assert.equal(result.completed, AGENTS.length);
    assert.equal(calls.length, AGENTS.length);
    assert.equal(status.agents.completed, AGENTS.length);
    assert.equal(architect.status, "completed");
    assert.ok(readFileSync(join(dir, architect.outputFile), "utf-8").includes("## 核心判断"));
  });

  it("runForgeAgents marks invalid output without completing the agent", async () => {
    const dir = freshDir();
    startForge(dir, "AI狼人杀");

    const result = await runForgeAgents(dir, { only: ["architect"], client: async () => "bad output" });
    const architect = inspectForgeAgent(dir, "architect").agent;

    assert.equal(result.ok, false);
    assert.equal(result.invalid.length, 1);
    assert.equal(architect.status, "invalid");
  });
  it("abort marks forge session aborted", () => {
    const dir = freshDir();
    startForge(dir, "AI狼人杀");

    const result = abortForge(dir, "用户取消");
    const session = readJson(join(dir, ".stw", "forge", "session.json"));

    assert.equal(result.ok, true);
    assert.equal(session.status, "aborted");
    assert.equal(session.abortReason, "用户取消");
  });
});
