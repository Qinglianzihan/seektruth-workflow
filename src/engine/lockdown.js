import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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
