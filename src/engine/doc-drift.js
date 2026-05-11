import { existsSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";

const STALE_KEYWORDS = ["候选", "未实现", "计划中", "**半**", "未落地", "待补", "待做", "半完成", "部分完成"];

const DEFAULT_SOURCES = ["HARNESS_ENGINEERING.md", "毛选方法论.md"];

const T_ANYWHERE = /\bT(\d{1,3})\b/g;
const COMPLETED_ENTRY = /^-\s+\[x\]\s+\*\*T(\d+)\b[^\n]*/gm;
const PENDING_ENTRY = /^-\s+\[ \]\s+\*\*T(\d+)\b[^\n]*/gm;

function extractWithLine(content, regex) {
  const lines = content.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const re = new RegExp(regex.source, regex.flags.replace("g", ""));
    const m = lines[i].match(re);
    if (m) {
      out.push({ t: parseInt(m[1], 10), lineNum: i + 1, line: lines[i] });
    }
  }
  return out;
}

function extractCompletedTs(content) {
  return extractWithLine(content, COMPLETED_ENTRY).map((x) => ({
    t: x.t,
    lineNum: x.lineNum,
    title: x.line.replace(/^-\s+\[x\]\s+/, "").trim(),
  }));
}

function extractPendingTs(content) {
  return extractWithLine(content, PENDING_ENTRY).map((x) => ({
    t: x.t,
    lineNum: x.lineNum,
    title: x.line.replace(/^-\s+\[ \]\s+/, "").trim(),
  }));
}

function findTInSource(content, t) {
  const lines = content.split("\n");
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const re = new RegExp(`\\bT${t}\\b(?!\\d)`);
    if (re.test(lines[i])) {
      hits.push({ lineNum: i + 1, line: lines[i] });
    }
  }
  return hits;
}

function buildParenMask(line) {
  const mask = new Array(line.length).fill(false);
  let depth = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "(" || ch === "（") depth++;
    if (depth > 0) mask[i] = true;
    if (ch === ")" || ch === "）") depth = Math.max(0, depth - 1);
  }
  return mask;
}

function matchStaleNearT(line, tTarget) {
  const mask = buildParenMask(line);
  const tMatches = [];
  const tRe = /\bT(\d{1,3})\b/g;
  let tm;
  while ((tm = tRe.exec(line)) !== null) {
    tMatches.push({
      t: parseInt(tm[1], 10),
      pos: tm.index,
      inParen: mask[tm.index],
    });
  }
  const eligible = tMatches.filter((m) => !m.inParen);
  if (eligible.length === 0) return null;

  for (const kw of STALE_KEYWORDS) {
    let idx = line.indexOf(kw);
    while (idx !== -1) {
      let nearest = eligible[0];
      let nearestDist = Math.abs(nearest.pos - idx);
      for (const tm2 of eligible) {
        const d = Math.abs(tm2.pos - idx);
        if (d < nearestDist) {
          nearest = tm2;
          nearestDist = d;
        }
      }
      if (nearest.t === tTarget) return kw;
      idx = line.indexOf(kw, idx + 1);
    }
  }
  return null;
}

function collectAllTsInSource(content) {
  const lines = content.split("\n");
  const tsInSource = new Set();
  const firstSeen = new Map();
  for (let i = 0; i < lines.length; i++) {
    T_ANYWHERE.lastIndex = 0;
    let mm;
    while ((mm = T_ANYWHERE.exec(lines[i])) !== null) {
      const n = parseInt(mm[1], 10);
      tsInSource.add(n);
      if (!firstSeen.has(n)) firstSeen.set(n, { lineNum: i + 1, line: lines[i] });
    }
  }
  return { tsInSource, firstSeen };
}

export function detectDocDrift(rootDir, opts = {}) {
  const roadmapPath = opts.roadmapPath || join(rootDir, ".stw", "roadmap.md");
  const sourcePaths = opts.sourcePaths
    || DEFAULT_SOURCES.map((n) => join(rootDir, n));

  if (!existsSync(roadmapPath)) {
    return {
      ok: true,
      issues: [],
      scanned: { completedInRoadmap: 0, sources: sourcePaths.map((p) => ({ path: p, exists: existsSync(p) })) },
      skipped: "roadmap.md 不存在",
    };
  }

  const roadmap = readFileSync(roadmapPath, "utf-8");
  const completed = extractCompletedTs(roadmap);
  const pending = extractPendingTs(roadmap);
  const allTsInRoadmap = new Set([
    ...completed.map((c) => c.t),
    ...pending.map((p) => p.t),
  ]);

  if (completed.length === 0) {
    return {
      ok: true,
      issues: [],
      scanned: { completedInRoadmap: 0, sources: sourcePaths.map((p) => ({ path: p, exists: existsSync(p) })) },
      skipped: "roadmap 里没有 [x] T{N} 完成条目",
    };
  }

  const issues = [];
  const sourceInfo = [];

  for (const sp of sourcePaths) {
    if (!existsSync(sp)) {
      sourceInfo.push({ path: sp, exists: false });
      continue;
    }
    sourceInfo.push({ path: sp, exists: true });
    const content = readFileSync(sp, "utf-8");

    for (const { t, lineNum: rmLineNum, title } of completed) {
      for (const m of findTInSource(content, t)) {
        const staleNearby = matchStaleNearT(m.line, t);
        if (staleNearby) {
          issues.push({
            type: "stale-source",
            tNum: t,
            tTitle: title,
            source: sp,
            sourceLineNum: m.lineNum,
            sourceLine: m.line.trim(),
            roadmapLineNum: rmLineNum,
            matchedKeyword: staleNearby,
          });
        }
      }
    }

    const { tsInSource, firstSeen } = collectAllTsInSource(content);
    for (const n of tsInSource) {
      if (!allTsInRoadmap.has(n)) {
        const fs = firstSeen.get(n);
        issues.push({
          type: "unregistered",
          tNum: n,
          source: sp,
          sourceLineNum: fs.lineNum,
          sourceLine: fs.line.trim(),
        });
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    scanned: {
      completedInRoadmap: completed.length,
      sources: sourceInfo,
    },
  };
}

export function formatDocDriftOutput(result) {
  const sources = result.scanned?.sources || [];
  const existingSources = sources.filter((s) => s.exists).map((s) => basename(s.path));
  const missingSources = sources.filter((s) => !s.exists).map((s) => basename(s.path));

  if (result.skipped) {
    return `⊘ 派生文档反向校验已跳过：${result.skipped}`;
  }

  if (existingSources.length === 0) {
    return `⊘ 未找到根文档（${sources.map((s) => basename(s.path)).join(" / ")}），跳过反向校验`;
  }

  if (result.ok) {
    return `✅ 派生文档与 roadmap 一致（扫描 [x] ${result.scanned.completedInRoadmap} 条，源文档 ${existingSources.join(" + ")}）`;
  }

  const lines = [
    `📚 派生文档漂移检测：roadmap.md [x] 扫描 ${result.scanned.completedInRoadmap} 条，发现 ${result.issues.length} 处漂移`,
  ];
  if (missingSources.length > 0) {
    lines.push(`   （源文档缺失：${missingSources.join(" / ")}，已跳过）`);
  }
  lines.push("");

  for (let i = 0; i < result.issues.length; i++) {
    const issue = result.issues[i];
    const srcName = basename(issue.source);
    lines.push(`漂移 ${i + 1}：T${issue.tNum}${issue.tTitle ? `  ${issue.tTitle.slice(0, 60)}` : ""}`);
    lines.push(`  源 ${srcName}:${issue.sourceLineNum} — "${issue.sourceLine.slice(0, 120)}"`);
    if (issue.type === "stale-source") {
      lines.push(`  类型：stale-source（roadmap 已 [x]，源文档仍挂 "${issue.matchedKeyword}"）`);
    } else if (issue.type === "unregistered") {
      lines.push(`  类型：unregistered（T${issue.tNum} 在源文档出现，但 roadmap 完全未登记）`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
