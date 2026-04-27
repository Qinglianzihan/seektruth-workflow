#!/usr/bin/env node

import { existsSync } from "node:fs";
import { join } from "node:path";
import { detectProject } from "../src/scout/project-detector.js";
import { detectAiTools } from "../src/scout/ai-tool-detector.js";
import { scanMcpConfigs, getBuiltinMcpServers } from "../src/scout/mcp-scanner.js";
import { scanSkills } from "../src/scout/skill-scanner.js";
import { generateReport } from "../src/scout/report-generator.js";
import { resolveConflicts } from "../src/adapters/conflict-resolver.js";
import { writeStwFiles } from "../src/adapters/file-writer.js";
import { getCurrentPhase, PHASES, startSession, advancePhase } from "../src/engine/state-machine.js";
import { generateLockdown } from "../src/engine/lockdown.js";
import { archiveReport, listReports, getRecentSummaries } from "../src/engine/report.js";
import { getStats, generateStatsReport, logTokens } from "../src/engine/stats.js";
import { deepScanMcp } from "../src/scout/mcp-deep-scanner.js";

const command = process.argv[2];

const help = () => {
  console.log("Usage: stw <command>");
  console.log("");
  console.log("Commands:");
  console.log("  init           初始化求是工作流");
  console.log("  init --deep    初始化 + 深度扫描 MCP 工具详情");
  console.log("  start          开始新任务");
  console.log("  status         查看当前阶段和进度");
  console.log("  next           推进到下一阶段");
  console.log("  report         存档当前总结报告");
  console.log("  stats          查看统计报告");
};

const cmdInit = async (deep) => {
  const rootDir = process.cwd();

  console.log("🔍 侦察中...\n");

  const project = detectProject(rootDir);
  const aiTools = detectAiTools();
  const mcpConfigs = scanMcpConfigs(rootDir);
  const builtinMcp = getBuiltinMcpServers(aiTools);
  const mcpConfigsWithBuiltin = [...mcpConfigs, ...builtinMcp];
  const skills = scanSkills(rootDir);

  const environment = { project, aiTools, mcpConfigs: mcpConfigsWithBuiltin, skills };

  let deepMcpResult = null;
  if (deep) {
    console.log("  深度扫描 MCP 服务器 (tools/list)...\n");
    deepMcpResult = await deepScanMcp(rootDir);
  }

  const report = generateReport(environment);
  console.log(report);

  // Display deep scan results if available
  if (deepMcpResult) {
    console.log(`  ${"=".repeat(40)}`);
    console.log("  📡 MCP 深度扫描\n");
    console.log(`  ${deepMcpResult.summary}\n`);
    for (const s of deepMcpResult.servers) {
      if (s.status === "ok" && s.tools.length > 0) {
        console.log(`  ${s.name} (${s.source}):`);
        for (const t of s.tools) {
          console.log(`    · ${t.name} — ${t.description || "无描述"}`);
        }
        console.log("");
      } else if (s.status === "error") {
        console.log(`  ${s.name} (${s.source}): ❌ ${s.error}\n`);
      }
    }
  }

  // 冲突解决
  const conflicts = resolveConflicts(skills);
  if (conflicts.warnings.length > 0) {
    console.log("\n⚠️  检测到潜在冲突：");
    for (const w of conflicts.warnings) {
      console.log(`  · ${w.message}`);
      console.log(`    建议: ${w.suggestion}`);
    }
  }

  // 生成 .stw/ 文件
  const stwDir = writeStwFiles(rootDir, environment, conflicts);
  console.log(`\n✅ 求是工作流已初始化: ${stwDir}`);
  console.log("   下一步：将 .stw/STW-Workspace.md 内容作为 AI 系统提示。");
};

const cmdStatus = () => {
  const rootDir = process.cwd();
  const current = getCurrentPhase(rootDir);

  if (!current) {
    console.log("📭 当前没有活跃的任务。运行 stw start 开始一个新任务。");
    return;
  }

  const { phase, phaseInfo, startedAt, completedPhases } = current;
  console.log(`\n📊 当前进度\n`);
  console.log(`  开始时间: ${new Date(startedAt).toLocaleString()}`);

  if (phase === "complete") {
    console.log(`\n  ✅ 所有阶段已完成！`);
    return;
  }

  console.log(`  当前阶段: ${phase}/${PHASES.length}`);

  for (const p of PHASES) {
    const done = completedPhases.includes(p.id);
    const active = p.id === phase;
    const icon = done ? "✅" : active ? "▶️ " : "⏳";
    console.log(`  ${icon} 阶段 ${p.id}: ${p.name}${active ? ` (${p.deliverable})` : ""}`);
  }
};

const cmdStart = () => {
  const rootDir = process.cwd();
  const stwDir = join(rootDir, ".stw");

  if (!existsSync(stwDir)) {
    console.log("❌ 未初始化。请先运行 stw init。");
    return;
  }

  // Start or resume session
  const current = getCurrentPhase(rootDir);
  if (current) {
    console.log("📋 已有进行中的任务。运行 stw status 查看当前进度。");
    return;
  }

  startSession(rootDir);
  const phase1 = PHASES[0];

  console.log(`\n🚀 新任务已开始 — 阶段 1：${phase1.name}\n`);

  // Load recent summaries as "历史经验"
  const recent = getRecentSummaries(rootDir, 3);
  if (recent.length > 0) {
    console.log("   📚 历史经验（最近总结报告摘要）：");
    for (const r of recent) {
      console.log(`      · ${r.title}`);
      if (r.snippet) console.log(`        ${r.snippet}`);
    }
    console.log("");
  }

  console.log("   请将 .stw/STW-Workspace.md 的全部内容作为系统提示提供给 AI 编程助手。");
  console.log("   AI 应首先完成「调查研究」阶段，填写 .stw/Analysis-Template.md。\n");
  console.log("   完成阶段 1 后，运行 stw next 进入阶段 2。");
};

const phaseGuidance = {
  1: "完成调查研究后，在 STW-Workspace.md 中使用 `<!-- ATTACK_ZONE: path/* -->` 声明作战区域作为任务聚焦声明。",
  2: "已在 STW-Workspace.md 中声明 ATTACK_ZONE，专注封锁清单自动生成。AI 不得修改封锁区域外的任何文件。",
  3: "运行测试套件验证修改的正确性，确保全部通过。",
  4: "填写 .stw/Summary-Template.md 中的总结报告，记录认知迭代。",
};

const cmdNext = () => {
  const rootDir = process.cwd();
  const current = getCurrentPhase(rootDir);

  if (!current) {
    console.log("📭 当前没有活跃的任务。运行 stw start 开始。");
    return;
  }

  if (current.phase === "complete") {
    console.log("✅ 所有阶段已完成。运行 stw start 开始新任务。");
    return;
  }

  const result = advancePhase(rootDir);

  if (!result.ok) {
    console.log(`\n❌ ${result.error}`);
    if (result.required) {
      console.log(`   需要: ${result.required}`);
    }
    return;
  }

  if (result.done) {
    console.log(`\n🎉 所有阶段已完成！`);
    console.log("   运行 stw report 生成总结报告。");
    return;
  }

  const next = result.phase;
  const guide = phaseGuidance[next.id];

  console.log(`\n✅ 阶段 ${next.id - 1} 完成！`);
  console.log(`\n🚀 进入阶段 ${next.id}：${next.name}\n`);

  // Auto-generate lockdown.json when entering phase 3
  if (next.id === 3) {
    const lockdown = generateLockdown(rootDir);
    const zones = lockdown.attackZones;
    if (zones.length > 0) {
      console.log(`   🔒 专注封锁已生成 (${lockdown.attackZones.length} 个作战区域):`);
      for (const z of zones) {
        console.log(`      · ${z}`);
      }
      console.log(`     封锁文件: .stw/lockdown.json`);
      console.log(`     ⚠️  AI 不得修改 ATTACK_ZONE 声明外的任何文件！`);
      console.log("");
    } else {
      console.log(`   ⚠️  未检测到 ATTACK_ZONE 声明。请确保在 STW-Workspace.md 中声明作战区域。\n`);
    }
  }

  if (guide) {
    console.log(`   👉 ${guide}`);
  }
  console.log(`\n   完成阶段 ${next.id} 后，运行 stw next 继续。`);
};

const cmdStats = () => {
  const rootDir = process.cwd();
  const sub = process.argv[3];

  if (sub === "--log-tokens") {
    const amount = parseInt(process.argv[4], 10);
    if (isNaN(amount) || amount <= 0) {
      console.log("用法: stw stats --log-tokens <数量> [备注]");
      return;
    }
    const note = process.argv.slice(5).join(" ") || "";
    logTokens(rootDir, amount, note);
    console.log(`✅ 已记录 ${amount} tokens${note ? ` (${note})` : ""}`);
    return;
  }

  console.log(generateStatsReport(rootDir));
};

const cmdReport = () => {
  const rootDir = process.cwd();

  const result = archiveReport(rootDir);
  if (!result.ok) {
    console.log(`\n❌ ${result.error}`);
    return;
  }

  const allReports = listReports(rootDir);
  console.log(`\n📝 总结报告已存档: ${result.name}`);
  console.log(`   存档数量: ${allReports.length}`);
};

switch (command) {
  case "init":
    cmdInit(process.argv[3] === "--deep").catch((err) => {
      console.error(`\n❌ init 失败: ${err.message}`);
      process.exit(1);
    });
    break;
  case "start":
    cmdStart();
    break;
  case "status":
    cmdStatus();
    break;
  case "next":
    cmdNext();
    break;
  case "report":
    cmdReport();
    break;
  case "stats":
    cmdStats();
    break;
  case "--help":
  case "-h":
    help();
    break;
  default:
    if (command) {
      console.log(`Unknown command: ${command}`);
      console.log("");
    }
    help();
    break;
}
