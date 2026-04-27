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
 * Run git diff to find all modified files and check against attack zones.
 * Returns { ok, violations, totalFiles }.
 */
export function checkFileBounds(rootDir) {
  const zones = parseAttackZones(rootDir);
  if (zones.length === 0) {
    return { ok: false, violations: [], totalFiles: 0, error: "未声明 ATTACK_ZONE，无法进行越界检查。" };
  }

  const changedFiles = new Set();

  const diffResult = spawnSync("git", ["diff", "--name-only", "HEAD"], {
    cwd: rootDir, encoding: "utf-8", timeout: 5000,
  });
  if (diffResult.status === 0 && diffResult.stdout) {
    for (const line of diffResult.stdout.trim().split("\n")) {
      if (line) changedFiles.add(line.trim());
    }
  }

  const untrackedResult = spawnSync("git", ["ls-files", "--others", "--exclude-standard"], {
    cwd: rootDir, encoding: "utf-8", timeout: 5000,
  });
  if (untrackedResult.status === 0 && untrackedResult.stdout) {
    for (const line of untrackedResult.stdout.trim().split("\n")) {
      if (line) changedFiles.add(line.trim());
    }
  }

  const violations = [];
  for (const file of changedFiles) {
    // Skip .stw/ meta files — they are managed by the CLI, not by AI
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
