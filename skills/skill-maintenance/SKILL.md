---
name: skill-maintenance
description: Use when editing, syncing, or reviewing STW skills or native skill templates, or when a workflow change must be reflected across skill files without hardcoding behavior.
---

# Skill Maintenance

## Goal

Keep skills thin, discoverable, and synchronized with the CLI truth.

## Source of Truth

1. CLI behavior in `src/`
2. User-facing docs in `README.md` and `.stw/STW-Workspace.md`
3. Shared skill templates in `templates/native-skills/`
4. Packaged skill files in `skills/`

## Rules

- Skills should say **when to use** them, not freeze workflow internals.
- Do not hardcode version numbers, release notes, or environment-specific assumptions.
- If command behavior changes, update CLI/docs first, then skills.
- Prefer one short skill over duplicated command tables.
- Keep `rtk` optional; the canonical command remains `stw`.

## Sync Order

1. Edit the template or source doc.
2. Mirror the change into `skills/`.
3. Search for stale phrasing or duplicate command mappings.
4. Run tests if behavior changed.

## Common Drift

- duplicated command tables
- pinned versions
- stale `rtk` assumptions
- workflow logic duplicated inside skills

## Good Pattern

- skill = trigger + minimal action
- CLI/docs = actual workflow behavior

