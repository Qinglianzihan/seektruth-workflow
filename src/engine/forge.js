import { existsSync, mkdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getCurrentPhase, startSession } from "./state-machine.js";

export const AGENTS = [
  { id: "user-proxy", role: "用户代表" },
  { id: "product-owner", role: "产品经理" },
  { id: "architect", role: "架构师" },
  { id: "minimalist", role: "极简实现者" },
  { id: "qa", role: "测试验收" },
  { id: "security", role: "安全风控" },
];

const PHASES = ["diverge", "user-confirm", "converge", "walkthrough", "review", "finalize", "done"];

function forgeDir(rootDir) {
  return join(rootDir, ".stw", "forge");
}

function sessionPath(rootDir) {
  return join(forgeDir(rootDir), "session.json");
}

function agentPath(rootDir, id) {
  return join(forgeDir(rootDir), "agents", `${id}.json`);
}

function ensureDirs(rootDir) {
  mkdirSync(join(forgeDir(rootDir), "agents"), { recursive: true });
  mkdirSync(join(forgeDir(rootDir), "rounds", "001-diverge"), { recursive: true });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function readSession(rootDir) {
  const path = sessionPath(rootDir);
  if (!existsSync(path)) return null;
  try {
    return readJson(path);
  } catch {
    return null;
  }
}

function countAgents(rootDir) {
  const counts = { total: AGENTS.length, pending: 0, running: 0, completed: 0, invalid: 0, timeout: 0, failed: 0, skipped: 0, blocked: 0 };
  for (const agent of AGENTS) {
    const path = agentPath(rootDir, agent.id);
    if (!existsSync(path)) continue;
    const state = readJson(path);
    if (state.status in counts) counts[state.status] += 1;
  }
  return counts;
}

function defaultMetrics() {
  return {
    questions: 0,
    mustAnswerQuestions: 0,
    risks: 0,
    mvpItems: 0,
    deferredItems: 0,
    blockingIssues: 0,
  };
}

function defaultQuality() {
  return {
    schemaValid: false,
    hasNewPoints: false,
    hasRisks: false,
    scopeInflation: false,
  };
}

export function startForge(rootDir, idea) {
  if (!idea || !idea.trim()) return { ok: false, error: "需求不能为空。" };
  ensureDirs(rootDir);
  const now = new Date().toISOString();
  const session = {
    id: `forge-${Date.now()}`,
    idea: idea.trim(),
    phase: "diverge",
    status: "running",
    currentRound: 1,
    maxRounds: 7,
    startedAt: now,
    agents: AGENTS.map((a) => a.id),
    gates: {
      divergeComplete: false,
      userConfirmed: false,
      requirementsDrafted: false,
      reviewPassed: false,
    },
    metrics: defaultMetrics(),
  };

  writeJson(sessionPath(rootDir), session);
  writeFileSync(join(forgeDir(rootDir), "blackboard.md"), `# 需求炼金炉黑板\n\n## 原始需求\n\n${session.idea}\n`);
  writeFileSync(join(forgeDir(rootDir), "discussion-log.md"), `# 需求讨论记录\n\n- ${now} 启动：${session.idea}\n`);

  for (const agent of AGENTS) {
    const outputFile = `.stw/forge/rounds/001-diverge/${agent.id}.md`;
    const state = {
      id: agent.id,
      role: agent.role,
      round: "001-diverge",
      status: "pending",
      startedAt: null,
      finishedAt: null,
      tokenBudget: 2000,
      attempts: 0,
      outputFile,
      quality: defaultQuality(),
    };
    writeJson(agentPath(rootDir, agent.id), state);
  }

  return { ok: true, session };
}

export function getForgeStatus(rootDir) {
  const session = readSession(rootDir);
  if (!session) return { ok: false, error: "没有活跃的需求炼金炉。" };
  return { ok: true, session, agents: countAgents(rootDir), metrics: session.metrics || defaultMetrics() };
}

export function inspectForgeAgent(rootDir, id) {
  const path = agentPath(rootDir, id);
  if (!existsSync(path)) return { ok: false, error: `未找到 agent: ${id}` };
  return { ok: true, agent: readJson(path) };
}

function outputHasRequiredSections(content) {
  const required = ["## 核心判断", "## 必须追问用户的问题", "## 隐性需求", "## 最大风险", "## 建议不做"];
  return required.every((section) => content.includes(section));
}

function collectDiverge(rootDir) {
  const outputs = [];
  const invalid = [];
  const incomplete = [];

  for (const agent of AGENTS) {
    const path = agentPath(rootDir, agent.id);
    const state = readJson(path);
    if (state.status !== "completed") {
      incomplete.push(agent.id);
      continue;
    }
    const fullOutput = join(rootDir, state.outputFile);
    if (!existsSync(fullOutput)) {
      invalid.push(agent.id);
      continue;
    }
    const content = readFileSync(fullOutput, "utf-8");
    if (!outputHasRequiredSections(content)) invalid.push(agent.id);
    outputs.push({ agent, content });
  }

  return { outputs, invalid, incomplete };
}

function writeQuestions(rootDir, outputs) {
  const lines = ["# 用户确认问题", "", "从专家发散意见中提炼，最多回答前三个即可。", ""];
  let n = 1;
  for (const out of outputs) {
    const match = out.content.match(/## 必须追问用户的问题([\s\S]*?)(\n## |$)/);
    if (!match) continue;
    const candidates = match[1].split("\n").map((s) => s.trim()).filter(Boolean);
    for (const item of candidates) {
      if (n > 3) break;
      lines.push(`${n}. ${item.replace(/^[-\d.、\s]+/, "")}`);
      n += 1;
    }
    if (n > 3) break;
  }
  if (n === 1) lines.push("1. 请确认第一版 MVP 的核心使用场景是什么？");
  writeFileSync(join(forgeDir(rootDir), "questions.md"), `${lines.join("\n")}\n`);
}

function updateDivergeMetrics(session, outputs) {
  const joined = outputs.map((o) => o.content).join("\n");
  session.metrics = {
    ...defaultMetrics(),
    questions: (joined.match(/[？?]/g) || []).length,
    mustAnswerQuestions: 3,
    risks: (joined.match(/风险|漏洞|泄露|失败|阻塞/g) || []).length,
    mvpItems: (joined.match(/MVP|第一版|最小/g) || []).length,
    deferredItems: (joined.match(/不做|延后|暂不/g) || []).length,
    blockingIssues: 0,
  };
}

function stripSection(content, name) {
  const match = content.match(new RegExp(`## ${name}([\\s\\S]*?)(\\n## |$)`));
  return match ? match[1].trim() : "";
}

function buildRequirements(session, answers, outputs) {
  const lines = [
    "# Forge Requirements",
    "",
    "## 原始想法",
    "",
    session.idea,
    "",
    "## 用户确认",
    "",
    answers.trim(),
    "",
    "## 核心判断",
    "",
  ];

  for (const out of outputs) {
    const judgment = stripSection(out.content, "核心判断");
    if (judgment) lines.push(`### ${out.agent.role}`, "", judgment, "");
  }

  lines.push("## 隐性需求", "");
  for (const out of outputs) {
    const hidden = stripSection(out.content, "隐性需求");
    if (hidden) lines.push(`### ${out.agent.role}`, "", hidden, "");
  }

  lines.push("## 最大风险", "");
  for (const out of outputs) {
    const risks = stripSection(out.content, "最大风险");
    if (risks) lines.push(`### ${out.agent.role}`, "", risks, "");
  }

  lines.push("## 明确不做", "");
  for (const out of outputs) {
    const no = stripSection(out.content, "建议不做");
    if (no) lines.push(`### ${out.agent.role}`, "", no, "");
  }

  lines.push(
    "## 进入 STW 五阶段的任务描述",
    "",
    `基于需求炼金炉讨论，实现：${session.idea}。以用户确认内容为准，先做最小可交付版本，保留 .stw/forge/requirements.md 作为需求边界。`,
    "",
  );
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}


function buildAgentPrompt(session, agent) {
  return [
    `原始需求：${session.idea}`,
    `当前阶段：${session.phase}`,
    `你的角色：${agent.role}`,
    "",
    "你是需求炼金炉中的独立专家 agent。不要和其他 agent 聊天，只从你的角色独立产出新观点。",
    "限制：最多 800 字；不写客套话；不重复显而易见内容；反对范围膨胀。",
    "",
    "必须严格输出以下 Markdown 章节：",
    "## 核心判断",
    "## 必须追问用户的问题",
    "## 隐性需求",
    "## 最大风险",
    "## 建议不做",
  ].join("\n");
}

function defaultModelConfig(env = process.env) {
  return {
    apiKey: env.STW_LLM_API_KEY || env.OPENAI_API_KEY || env.DEEPSEEK_API_KEY,
    baseUrl: env.STW_LLM_BASE_URL || env.OPENAI_BASE_URL || env.DEEPSEEK_BASE_URL || "https://api.openai.com/v1",
    model: env.STW_LLM_MODEL || env.OPENAI_MODEL || env.DEEPSEEK_MODEL || "gpt-4o-mini",
  };
}

async function openAiCompatibleClient({ agent, session, prompt, env = process.env }) {
  const cfg = defaultModelConfig(env);
  if (!cfg.apiKey) throw new Error("缺少模型 API Key：请设置 STW_LLM_API_KEY / OPENAI_API_KEY / DEEPSEEK_API_KEY");
  const url = `${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: "system", content: `你是${agent.role}。只输出指定 Markdown 章节。` },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
    }),
  });
  if (!resp.ok) throw new Error(`模型调用失败 ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("模型响应为空。" );
  return content.trim();
}



function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function claudePrintClient({ agent, prompt, rootDir, spawn = spawnSync, model }) {
  const systemPrompt = `你是${agent.role}，需求炼金炉独立专家。必须只输出指定 Markdown 章节，不要进行互动式提问。`;

  if (process.platform === "win32") {
    const dir = mkdtempSync(join(tmpdir(), "stw-forge-"));
    const promptPath = join(dir, "prompt.txt");
    writeFileSync(promptPath, prompt, "utf-8");
    const modelArg = model ? ` --model ${psQuote(model)}` : "";
    const command = [
      "$OutputEncoding=[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new();",
      `$p=Get-Content -Raw -Encoding UTF8 -LiteralPath ${psQuote(promptPath)};`,
      `claude --bare --print --permission-mode bypassPermissions --system-prompt ${psQuote(systemPrompt)}${modelArg} $p`,
    ].join(" ");
    const result = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], { cwd: rootDir, encoding: "utf-8" });
    rmSync(dir, { recursive: true, force: true });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr || result.stdout || `claude --print failed for ${agent.id}`);
    const output = (result.stdout || "").trim();
    if (!output) throw new Error(`claude --print 输出为空：${agent.id}`);
    return output;
  }

  const args = ["--bare", "--print", "--permission-mode", "bypassPermissions", "--system-prompt", systemPrompt];
  if (model) args.push("--model", model);
  args.push(prompt);
  const result = spawn("claude", args, { cwd: rootDir, encoding: "utf-8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `claude --print failed for ${agent.id}`);
  const output = (result.stdout || "").trim();
  if (!output) throw new Error(`claude --print 输出为空：${agent.id}`);
  return output;
}function codexExecClient({ agent, session, prompt, rootDir, outputPath, spawn = spawnSync, model }) {
  const args = ["exec", "-C", rootDir, "--skip-git-repo-check", "-o", outputPath];
  if (model) args.push("-m", model);
  args.push(prompt);
  const cmd = process.platform === "win32" ? "codex.cmd" : "codex";
  const result = spawn(cmd, args, { cwd: rootDir, encoding: "utf-8", shell: process.platform === "win32" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `codex exec failed for ${agent.id}`);
  if (!existsSync(outputPath)) throw new Error(`codex exec 未生成输出文件：${outputPath}`);
  return readFileSync(outputPath, "utf-8").trim();
}
export async function runForgeAgents(rootDir, options = {}) {
  const session = readSession(rootDir);
  if (!session) return { ok: false, error: "没有活跃的需求炼金炉。" };
  if (session.status !== "running") return { ok: false, error: `炼金炉状态不是 running: ${session.status}` };
  if (session.phase !== "diverge") return { ok: false, error: `当前阶段暂不支持自动运行：${session.phase}` };

  const provider = options.provider || (options.client ? "custom" : "codex");
  const client = options.client || (provider === "api"
    ? ((args) => openAiCompatibleClient({ ...args, env: options.env || process.env }))
    : null);
  const wanted = new Set(options.only || AGENTS.map((a) => a.id));
  const completed = [];
  const invalid = [];
  const failed = [];

  for (const agent of AGENTS.filter((a) => wanted.has(a.id))) {
    const path = agentPath(rootDir, agent.id);
    const state = readJson(path);
    if (state.status === "completed" && !options.force) continue;

    state.status = "running";
    state.startedAt = new Date().toISOString();
    state.attempts += 1;
    writeJson(path, state);

    try {
      const prompt = buildAgentPrompt(session, agent);
      const fullOutputPath = join(rootDir, state.outputFile);
      const output = client
        ? await client({ agent, session, prompt, rootDir, outputPath: fullOutputPath })
        : provider === "claude"
          ? claudePrintClient({ agent, session, prompt, rootDir, spawn: options.spawn || spawnSync, model: options.model })
          : codexExecClient({ agent, session, prompt, rootDir, outputPath: fullOutputPath, spawn: options.spawn || spawnSync, model: options.model });
      writeFileSync(fullOutputPath, `${output.trim()}\n`);
      const valid = outputHasRequiredSections(output);
      state.finishedAt = new Date().toISOString();
      state.quality.schemaValid = valid;
      state.quality.hasNewPoints = output.trim().length > 80;
      state.quality.hasRisks = /风险|漏洞|泄露|失败|阻塞/.test(output);
      state.quality.scopeInflation = /都做|全量|完整平台|大而全/.test(output);
      state.status = valid ? "completed" : "invalid";
      if (valid) completed.push(agent.id);
      else invalid.push(agent.id);
    } catch (err) {
      state.status = "failed";
      state.finishedAt = new Date().toISOString();
      state.error = err.message;
      failed.push({ id: agent.id, error: err.message });
    }
    writeJson(path, state);
  }

  return {
    ok: invalid.length === 0 && failed.length === 0,
    completed: completed.length,
    invalid,
    failed,
  };
}
export function advanceForge(rootDir) {
  const session = readSession(rootDir);
  if (!session) return { ok: false, error: "没有活跃的需求炼金炉。" };
  if (session.status !== "running") return { ok: false, error: `炼金炉状态不是 running: ${session.status}` };

  if (session.phase === "diverge") {
    const { outputs, invalid, incomplete } = collectDiverge(rootDir);
    if (incomplete.length > 0) return { ok: false, error: `还有 agent 未完成：${incomplete.join(", ")}` };
    if (invalid.length > 0) return { ok: false, error: `agent 输出格式无效：${invalid.join(", ")}` };

    updateDivergeMetrics(session, outputs);
    writeQuestions(rootDir, outputs);
    session.phase = "user-confirm";
    session.gates.divergeComplete = true;
    session.currentRound += 1;
    writeJson(sessionPath(rootDir), session);
    return { ok: true, phase: session.phase, required: ".stw/forge/questions.md" };
  }

  const idx = PHASES.indexOf(session.phase);
  if (idx === -1 || idx >= PHASES.length - 1) return { ok: false, error: "无可推进的 forge 阶段。" };
  session.phase = PHASES[idx + 1];
  if (session.phase === "done") session.status = "done";
  session.currentRound += 1;
  writeJson(sessionPath(rootDir), session);
  return { ok: true, phase: session.phase };
}

export function acceptForge(rootDir, answers) {
  const session = readSession(rootDir);
  if (!session) return { ok: false, error: "没有活跃的需求炼金炉。" };
  if (session.status !== "running") return { ok: false, error: `炼金炉状态不是 running: ${session.status}` };
  if (session.phase !== "user-confirm") return { ok: false, error: "必须先完成发散并运行 stw forge next 生成确认问题。" };
  if (!answers || !answers.trim()) return { ok: false, error: "用户确认内容不能为空。" };
  if (getCurrentPhase(rootDir)) return { ok: false, error: "已有进行中的 STW 任务，不能重复启动。" };

  const { outputs, invalid, incomplete } = collectDiverge(rootDir);
  if (incomplete.length > 0) return { ok: false, error: `还有 agent 未完成：${incomplete.join(", ")}` };
  if (invalid.length > 0) return { ok: false, error: `agent 输出格式无效：${invalid.join(", ")}` };

  const acceptedAt = new Date().toISOString();
  writeFileSync(join(forgeDir(rootDir), "answers.md"), `# 用户确认\n\n${answers.trim()}\n`);
  const requirements = buildRequirements(session, answers, outputs);
  const requirementsPath = join(forgeDir(rootDir), "requirements.md");
  writeFileSync(requirementsPath, requirements);

  session.phase = "done";
  session.status = "done";
  session.acceptedAt = acceptedAt;
  session.requirementsFile = ".stw/forge/requirements.md";
  session.gates.userConfirmed = true;
  session.gates.requirementsDrafted = true;
  session.gates.reviewPassed = true;
  writeJson(sessionPath(rootDir), session);

  const taskDescription = `基于 .stw/forge/requirements.md 实现：${session.idea}`;
  const workflow = startSession(rootDir, taskDescription);
  return { ok: true, phase: session.phase, requirementsFile: session.requirementsFile, workflow };
}

export function abortForge(rootDir, reason = "未说明原因") {
  const session = readSession(rootDir);
  if (!session) return { ok: false, error: "没有活跃的需求炼金炉。" };
  session.status = "aborted";
  session.abortReason = reason;
  session.abortedAt = new Date().toISOString();
  writeJson(sessionPath(rootDir), session);
  return { ok: true, session };
}
