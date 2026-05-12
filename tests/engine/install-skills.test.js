import { test, describe, it } from "node:test";
import assert from "node:assert";
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  installSkills,
  INSTALL_SKILLS_MARKER,
} from "../../src/engine/install-skills.js";

function freshHome() {
  return join(tmpdir(), "stw-skills-test-" + Date.now() + "-" + Math.random().toString(36).slice(2));
}

function freshSourceWith(names) {
  const dir = join(tmpdir(), "stw-skills-src-" + Date.now() + "-" + Math.random().toString(36).slice(2));
  mkdirSync(dir, { recursive: true });
  for (const n of names) {
    const skillDir = join(dir, n);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), `---\nname: ${n}\n---\n# ${n}\n`);
  }
  return dir;
}

describe("install-skills", () => {
  it("Claude Code: installs every skill dir + .installed-by-stw marker", () => {
    const home = freshHome();
    const src = freshSourceWith(["using-stw", "stw-focus", "stw-lockdown"]);

    const r = installSkills({ tool: "Claude Code", targetHome: home, sourceDir: src });

    assert.equal(r.ok, true);
    assert.equal(r.targetDir, join(home, ".claude", "skills"));
    assert.deepEqual(r.installed.sort(), ["stw-focus", "stw-lockdown", "using-stw"]);

    for (const slug of ["using-stw", "stw-focus", "stw-lockdown"]) {
      const dest = join(home, ".claude", "skills", slug);
      assert.ok(existsSync(join(dest, "SKILL.md")), `SKILL.md missing for ${slug}`);
      assert.ok(existsSync(join(dest, INSTALL_SKILLS_MARKER)), `marker missing for ${slug}`);
    }
  });

  it("non-Claude tool returns skipped + reason", () => {
    const home = freshHome();
    const src = freshSourceWith(["using-stw"]);
    const r = installSkills({ tool: "Codex CLI", targetHome: home, sourceDir: src });

    assert.equal(r.ok, true);
    assert.equal(r.skipped, true);
    assert.ok(typeof r.reason === "string" && r.reason.length > 0);
    assert.ok(!existsSync(join(home, ".claude")), "must not touch home for skipped tools");
  });

  it("dryRun reports install set without writing files", () => {
    const home = freshHome();
    const src = freshSourceWith(["using-stw", "stw-focus"]);
    const r = installSkills({ tool: "Claude Code", targetHome: home, sourceDir: src, dryRun: true });

    assert.equal(r.ok, true);
    assert.equal(r.dryRun, true);
    assert.deepEqual(r.installed.sort(), ["stw-focus", "using-stw"]);
    assert.ok(!existsSync(join(home, ".claude", "skills", "using-stw")), "dryRun must not write");
  });

  it("second run overwrites silently when marker is present", () => {
    const home = freshHome();
    const src = freshSourceWith(["using-stw"]);

    const first = installSkills({ tool: "Claude Code", targetHome: home, sourceDir: src });
    assert.equal(first.ok, true);

    // Mutate source to detect overwrite
    writeFileSync(join(src, "using-stw", "SKILL.md"), "# updated\n");
    const second = installSkills({ tool: "Claude Code", targetHome: home, sourceDir: src });

    assert.equal(second.ok, true);
    assert.deepEqual(second.installed, ["using-stw"]);
    const content = readFileSync(join(home, ".claude", "skills", "using-stw", "SKILL.md"), "utf-8");
    assert.ok(content.includes("updated"), "second install must overwrite SKILL.md");
  });

  it("existing dir WITHOUT marker blocks install (prevents clobbering user skill)", () => {
    const home = freshHome();
    const src = freshSourceWith(["using-stw", "stw-focus"]);
    const userOwnedDir = join(home, ".claude", "skills", "stw-focus");
    mkdirSync(userOwnedDir, { recursive: true });
    writeFileSync(join(userOwnedDir, "SKILL.md"), "# user's own stw-focus skill\n");

    const r = installSkills({ tool: "Claude Code", targetHome: home, sourceDir: src });

    assert.equal(r.ok, false);
    assert.ok(Array.isArray(r.skippedDirs));
    assert.ok(r.skippedDirs.includes("stw-focus"), "must list the unprotected dir");
    assert.ok(/force/i.test(r.error || ""), "error must mention --force");
    // User's file preserved
    assert.equal(
      readFileSync(join(userOwnedDir, "SKILL.md"), "utf-8"),
      "# user's own stw-focus skill\n",
      "must NOT overwrite the unmarked dir"
    );
  });

  it("--force overrides the no-marker guard and overwrites", () => {
    const home = freshHome();
    const src = freshSourceWith(["using-stw"]);
    const userDir = join(home, ".claude", "skills", "using-stw");
    mkdirSync(userDir, { recursive: true });
    writeFileSync(join(userDir, "SKILL.md"), "# user old\n");

    const r = installSkills({
      tool: "Claude Code",
      targetHome: home,
      sourceDir: src,
      force: true,
    });

    assert.equal(r.ok, true);
    assert.ok(r.installed.includes("using-stw"));
    assert.ok(existsSync(join(userDir, INSTALL_SKILLS_MARKER)), "marker written after --force");
  });

  it("source dir missing returns ok=false with explicit error", () => {
    const home = freshHome();
    const r = installSkills({
      tool: "Claude Code",
      targetHome: home,
      sourceDir: join(tmpdir(), "stw-nonexistent-" + Date.now()),
    });

    assert.equal(r.ok, false);
    assert.ok(r.error && r.error.length > 0);
    assert.ok(!existsSync(join(home, ".claude")), "must not create target on source error");
  });

  it("real templates/native-skills dir ships all 9 skills", () => {
    // smoke test against the real repo source (not mock)
    const home = freshHome();
    const r = installSkills({ tool: "Claude Code", targetHome: home });
    assert.equal(r.ok, true);
    assert.ok(r.installed.length >= 9, `expected ≥9 skills, got ${r.installed.length}: ${r.installed.join(", ")}`);
    assert.ok(r.installed.includes("using-stw"), "using-stw must ship");

    const dirs = readdirSync(join(home, ".claude", "skills"));
    assert.ok(dirs.length >= 9);
  });
});

test("install-skills tests loaded", () => assert.ok(true));
