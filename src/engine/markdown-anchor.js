/**
 * 共享 markdown 章节切段 util。
 *
 * 由 T11.bis+T12.bis+T15.bis 合并维护轮抽出：lockdown.parseChangePlan 与
 * evidence.sectionBody 原本各自实现同一套 indexOf 章节锚逻辑，lockdown 的
 * `indexOf(marker)` 在 2026-05-11 被两次实证（T12 / T15）撞反引号字面。
 * 根治路径是把"必须独立行"约束（`\n##` 前缀 + 文件首部兜底）收拢到唯一实现。
 *
 * 依赖：无。纯字符串。
 */

/**
 * Find the start of a `## <marker>` section body, or -1 if absent.
 * Requires the marker to sit on its own line (either at file start, or after
 * a newline). Prevents matches against the literal inside code blocks or
 * inline backticks (e.g. `` `## 4.5 ...` `` inside a sentence).
 */
export function findSection(content, marker) {
  if (!content || typeof content !== "string") return -1;
  const needle = "\n" + marker;
  const idx = content.indexOf(needle);
  if (idx !== -1) return idx + 1;
  return content.startsWith(marker) ? 0 : -1;
}

/** Find end of a markdown section so callers can read its body. */
export function findNextSection(content, from) {
  const m = content.slice(from).match(/\n## /);
  return m ? from + m.index : content.length;
}

/**
 * Return the body text of the `## <marker>` section (marker line excluded),
 * or null if the section is absent.
 */
export function sectionBody(content, marker) {
  const idx = findSection(content, marker);
  if (idx === -1) return null;
  const endIdx = findNextSection(content, idx + marker.length);
  return content.slice(idx + marker.length, endIdx);
}
