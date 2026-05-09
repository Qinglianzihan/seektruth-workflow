# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test                          # Run all 182 tests (node:test + assert)
node --test tests/engine/state-machine.test.js   # Run a single test file
npm link                          # Make `stw` globally available for manual testing
```

No build step — ESM source runs directly via Node.js ≥ 18.

## Architecture

Three-layer design, orchestrated from `bin/stw.js`:

```
bin/stw.js              # CLI entry point. Switch on command → calls engine modules directly.
src/scout/              # Reconnaissance layer. Pure readers that detect environment.
    project-detector.js   # Detects project type from package.json, etc.
    ai-tool-detector.js   # Detects Claude Code, Codex, Cursor, etc. via env vars + config dirs.
    mcp-scanner.js        # Reads .mcp.json, ~/.claude/settings.json for MCP server names.
    skill-scanner.js      # Reads .claude/skills/*.md frontmatter (name + description).
    report-generator.js   # Formats scout results into terminal output.
    mcp-deep-scanner.js   # Connects to MCP servers via @modelcontextprotocol/sdk, calls tools/list.
src/adapters/           # Configuration layer. Decision-making and file generation.
    rule-selector.js      # Enables/disables the 5 rules based on project type + AI tool.
    conflict-resolver.js  # Detects overlap between STW rules and existing user skills.
    config-schema.js      # Default .stw/config.json shape (createDefaultConfig).
    file-writer.js        # Central writeStwFiles(): templates → .stw/, plugin manifests, CLAUDE.md.
    tool-selector.js      # Interactive prompt to pick AI tools to integrate.
src/engine/             # Runtime layer. Core state machine and enforcement.
    state-machine.js      # THE core: 5-phase state machine. Reads/writes .stw/.progress.json.
                          # advancePhase() checks deliverables, confidence gate, file bounds, deps.
    confidence-gate.js    # assessConfidence() scores Analysis-Template.md (12 sections, ≥6/10).
    lockdown.js           # Parses ATTACK_ZONE comments from STW-Workspace.md.
                          # checkFileBounds() runs git diff and validates all changes are in-zone.
                          # checkChangePlan() / checkDepsChange() guard phase 3→4.
    forge.js              # Multi-agent requirement discussion (forge command) — diverge/converge/synthesize/confirm.
    report.js             # Archives Summary-Template.md → .stw/reports/, lists history.
    stats.js              # Token tracking and session stats.
    error-registry.js     # Cross-session error case registry (惩前毖后).
    messages.js           # Phase story text, error messages, all user-facing Chinese strings.
    mao-quotes.js         # Quotation bank. quote-injector.js loads from it.
templates/              # Markdown templates with {{PLACEHOLDERS}} filled at init time.
tests/                  # Mirror of src/, using node:test. test-helper.js provides temp dirs.
skills/                 # Native Claude Code skills (one per phase + using-stw + skill-maintenance).
```

## Key design rules

- **Zero runtime dependencies** except `@modelcontextprotocol/sdk` (used only in `mcp-deep-scanner.js`). Core logic uses `node:fs`, `node:path`, `node:child_process` only.
- **ESM only** (`"type": "module"`). `import`/`export`, no `require`.
- **Test framework**: Node.js built-in `node:test` + `assert`. Tests go in `tests/` mirroring `src/`. `test-helper.js` provides `freshDir()`, `writeStwFile()`, `writePassingAnalysis()`.
- **No TypeScript** — plain JavaScript.
- **All user-facing strings** live in `src/engine/messages.js` — never hardcode Chinese text in CLI logic.

## The 5-phase state machine (src/engine/state-machine.js)

This is the backbone. `.stw/.progress.json` tracks `{ phase, startedAt, completedPhases, iterations, taskDescription }`.

`advancePhase()` gating:
1. **1→2**: Confidence gate — `assessConfidence()` scores Analysis-Template.md (12 sections + ≥2 source citations). Default threshold 6/10.
2. **2→3**: Must have at least one `<!-- ATTACK_ZONE: ... -->` in STW-Workspace.md.
3. **3→4**: File bounds check (all `git diff` files must match an ATTACK_ZONE), change plan check (all changed files declared in Analysis-Template.md §4.5), dependency manifest warning (package.json etc. — warns, never blocks).
4. **4→5**: Must have `.stw/test-results.json` with `passed: true` or `.stw/test-passed` marker.
5. **5→complete**: Summary-Template.md must exist.

Rollback (`stw rollback`) records iteration in `.progress.json` and resets to phase 1.

## Template system

`templates/` files use `{{PLACEHOLDER}}` syntax. `file-writer.js` replaces them at init time with environment data (detected tools, MCP servers, skills, project type, conflict warnings). The `writeNativePluginFiles()` function copies native skills from `templates/native-skills/` to the project.

## Distribution

The npm package (`seektruth-workflow`) ships `bin/`, `src/`, `templates/`, `skills/`, `.codex-plugin/`, `.claude-plugin/`, and `.codex/INSTALL.md`. When users run `stw init`, it auto-detects their AI tool and injects the appropriate config files (CLAUDE.md, AGENTS.md, .cursorrules, etc.).

<!-- STW 工作流规范（由 stw init 自动生成） -->

## 求是工作流

开发类任务必须先使用原生 Skill `using-stw`。
若 Skill 未自动触发，先检测 `rtk`：可用则运行 `rtk stw status`，否则运行 `stw status`。无任务则按同一前缀执行 `start --desc "<用户需求>"`。
读取 `.stw/STW-Workspace.md`，严格按照五阶段规范执行所有任务。
对话中使用 `/stw status` 查看进度，`/stw next` 推进阶段；直接跑终端时优先用 `rtk stw ...`（若 rtk 可用），否则用 `stw ...`。
