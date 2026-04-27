import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { spawnSync } from "node:child_process";

/**
 * Parse ATTACK_ZONE declarations from STW-Workspace.md.
 * Lines outside code blocks matching: <!-- ATTACK_ZONE: <glob> -->
 */
export function parseAttackZones(rootDir) {
  const wsPath = join(rootDir, ".stw", "STW-Workspace.md");
  if (!existsSync(wsPath)) return [];

  const content = readFileSync(wsPath, "utf-8");
  const zones = [];
  let inCodeBlock = false;

  for (const line of content.split("\n")) {
    if (line.trimStart().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = line.match(/<!--\s*ATTACK_ZONE\s*:\s*(\S+)\s*-->/);
    if (match) {
      zones.push(match[1]);
    }
  }

  return zones;
}

/**
 * Generate lockdown.json from parsed attack zones.
 */
export function generateLockdown(rootDir) {
  const zones = parseAttackZones(rootDir);

  const lockdown = {
    generatedAt: new Date().toISOString(),
    attackZones: zones,
    rule: "AI 不得修改任何不在 ATTACK_ZONE 声明内的文件。",
  };

  const lockdownPath = join(rootDir, ".stw", "lockdown.json");
  writeFileSync(lockdownPath, JSON.stringify(lockdown, null, 2));

  return lockdown;
}

/**
 * Convert a simple glob pattern (using *, **) to a RegExp.
 */
function globToRegex(pattern) {
  let escaped = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        escaped += ".*";
        i++;
      } else {
        escaped += "[^/\\\\]*";
      }
    } else if (ch === "?") {
      escaped += "[^/\\\\]";
    } else if (".+^${}()|[]\\".includes(ch)) {
      escaped += "\\" + ch;
    } else {
      escaped += ch;
    }
  }
  return new RegExp("^" + escaped + "$", "i");
}

/**
 * Check whether a file path matches any attack zone pattern.
 */
function matchesZone(filePath, zones) {
  const normalized = filePath.replace(/\\/g, "/");
  for (const zone of zones) {
    if (!zone.includes("*")) {
      if (normalized.startsWith(zone) || normalized.startsWith(zone + "/")) return true;
      const base = normalized.split("/").pop();
      if (zone.endsWith("/" + base)) return true;
      continue;
    }
    const re = globToRegex(zone);
    if (re.test(normalized)) return true;
    if (zone.includes("/")) {
      const prefix = zone.slice(0, zone.indexOf("*"));
      if (normalized.startsWith(prefix)) return true;
    }
  }
  return false;
}

/**
 * Run git diff + ls-files to collect all changed/untracked files.
 */
function getChangedFiles(rootDir) {
  const files = new Set();

  const diffResult = spawnSync("git", ["diff", "--name-only", "HEAD"], {
    cwd: rootDir, encoding: "utf-8", timeout: 5000,
  });
  if (diffResult.status === 0 && diffResult.stdout) {
    for (const line of diffResult.stdout.trim().split("\n")) {
      if (line) files.add(line.trim());
    }
  }

  const untrackedResult = spawnSync("git", ["ls-files", "--others", "--exclude-standard"], {
    cwd: rootDir, encoding: "utf-8", timeout: 5000,
  });
  if (untrackedResult.status === 0 && untrackedResult.stdout) {
    for (const line of untrackedResult.stdout.trim().split("\n")) {
      if (line) files.add(line.trim());
    }
  }

  return files;
}

/**
 * Run git diff to find all modified files and check against attack zones.
 * Returns { ok, violations, totalFiles }.
 */
export function checkFileBounds(rootDir) {
  const zones = parseAttackZones(rootDir);
  if (zones.length === 0) {
    return { ok: false, violations: [], totalFiles: 0, error: "未声明 ATTACK_ZONE，无法进行越界检查。" };
  }

  const changedFiles = getChangedFiles(rootDir);
  const violations = [];
  for (const file of changedFiles) {
    const normalized = file.replace(/\\/g, "/");
    if (normalized.startsWith(".stw/") || normalized === ".stw") continue;
    if (!matchesZone(file, zones)) {
      violations.push(file);
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    totalFiles: changedFiles.size,
    zones,
  };
}

/** Find end of a markdown section so we can read its body. */
function findNextSection(content, from) {
  const m = content.slice(from).match(/\n## /);
  return m ? from + m.index : content.length;
}

/**
 * Parse change plan from Analysis-Template.md section "## 4.5 变更计划声明".
 * Returns [{ file, type, reason }].
 */
export function parseChangePlan(rootDir) {
  const analysisPath = join(rootDir, ".stw", "Analysis-Template.md");
  if (!existsSync(analysisPath)) return [];

  const content = readFileSync(analysisPath, "utf-8");
  const marker = "## 4.5 变更计划声明";
  const idx = content.indexOf(marker);
  if (idx === -1) return [];

  const endIdx = findNextSection(content, idx + marker.length);
  const section = content.slice(idx, endIdx);

  const entries = [];
  for (const line of section.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) continue;
    const cells = trimmed.split("|").map((c) => c.trim()).filter(Boolean);
    if (cells.length < 3) continue;
    const [file, type, reason] = cells;
    if (file.startsWith("-") || file === "文件") continue;
    // Require at least a plausible filename and non-empty reason
    if (file.includes(".") || file.includes("/")) {
      entries.push({ file, type, reason });
    }
  }
  return entries;
}

/** Fuzzy match a file path against a plan entry's file field. */
function matchesPlan(filePath, plan) {
  const normalized = filePath.replace(/\\/g, "/");
  for (const entry of plan) {
    const pf = entry.file.replace(/\\/g, "/");
    if (normalized === pf || normalized.endsWith("/" + pf) || normalized.includes(pf)) return true;
    // Basename match
    if (pf.split("/").pop() === normalized.split("/").pop()) return true;
  }
  return false;
}

/**
 * Check that all git changes are declared in the change plan.
 * Returns { ok, unplanned }.
 */
export function checkChangePlan(rootDir) {
  const plan = parseChangePlan(rootDir);
  if (plan.length === 0) {
    return { ok: false, error: "未声明变更计划。请在 Analysis-Template.md 中填写「变更计划声明」。", unplanned: [] };
  }

  const changedFiles = getChangedFiles(rootDir);
  const unplanned = [];
  for (const file of changedFiles) {
    const normalized = file.replace(/\\/g, "/");
    if (normalized.startsWith(".stw/") || normalized === ".stw") continue;
    if (!matchesPlan(file, plan)) {
      unplanned.push(file);
    }
  }

  return { ok: unplanned.length === 0, unplanned, planFiles: plan.map((e) => e.file) };
}

const DEPS_FILES = [
  "package.json", "package-lock.json", "yarn.lock",
  "requirements.txt", "Cargo.toml", "Gemfile", "go.mod", "pyproject.toml",
];

/**
 * Detect changes to dependency manifest files.
 * Returns { ok: true, changed: [], warning } — never blocks, only warns.
 */
export function checkDepsChange(rootDir) {
  const changed = getChangedFiles(rootDir);
  const depChanges = [];
  for (const f of changed) {
    const normalized = f.replace(/\\/g, "/");
    if (normalized.startsWith(".stw/")) continue;
    const basename = normalized.split("/").pop();
    if (DEPS_FILES.includes(basename)) {
      depChanges.push(f);
    }
  }
  return {
    ok: true,
    changed: depChanges,
    warning: depChanges.length > 0
      ? `${depChanges.join(", ")} — 依赖文件变更，请确保在变更计划中已声明理由。`
      : null,
  };
}

/**
 * Check if the working tree is dirty (has uncommitted changes).
 * Returns { dirty, files[], stwResidue: bool }.
 */
export function checkDirtyTree(rootDir) {
  const result = spawnSync("git", ["status", "--porcelain"], {
    cwd: rootDir, encoding: "utf-8", timeout: 5000,
  });
  if (result.status !== 0) {
    return { dirty: false, files: [], stwResidue: false, notGit: true };
  }
  const lines = result.stdout.trim().split("\n").filter(Boolean);
  const files = lines.map((l) => l.slice(3).trim());
  const stwResidue = files.some((f) => f.startsWith(".stw/") || f === ".stw");
  return { dirty: lines.length > 0, files, stwResidue, notGit: false };
}
