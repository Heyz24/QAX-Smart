/**
 * Strips conversational filler and inference-runtime metadata from raw
 * model output. Deliberately conservative: it only removes lines/prefixes
 * it recognizes with high confidence. It never rewrites the command body.
 */

const CONVERSATIONAL_PREFIXES = [
  /^sure,?\s+here('?s| is)( the)? command:?/i,
  /^here('?s| is)( the)? command:?/i,
  /^command:?/i,
  /^you can use:?/i,
  /^to (find|do|list|create|remove|search|check).*?[:,]\s*/i,
  /^the command( you (need|want))? is:?/i,
];

// llama.cpp / ollama CLI stat lines that must never reach a shell.
const METADATA_LINE = /^(total duration|load duration|prompt eval (count|duration|rate)|eval (count|duration|rate)):/i;

const FENCE_OPEN = /^```(bash|sh|zsh|powershell|ps1|cmd|batch|qax|shell)?\s*$/i;
const FENCE_CLOSE = /^```\s*$/;

export function normalizeModelOutput(raw: string): string {
  let lines = raw
    .split(/\r?\n/)
    .filter((line) => !METADATA_LINE.test(line.trim()));

  // Strip a single leading conversational prefix line, if present.
  if (lines.length > 0) {
    const first = lines[0];
    for (const pattern of CONVERSATIONAL_PREFIXES) {
      if (pattern.test(first.trim())) {
        lines[0] = first.replace(pattern, "").trim();
        break;
      }
    }
  }

  // Strip matching markdown fences (open + close), keep interior lines only.
  const openIdx = lines.findIndex((l) => FENCE_OPEN.test(l.trim()));
  if (openIdx !== -1) {
    const closeIdx = lines.findIndex(
      (l, i) => i > openIdx && FENCE_CLOSE.test(l.trim())
    );
    if (closeIdx !== -1) {
      lines = lines.slice(openIdx + 1, closeIdx);
    } else {
      // Unterminated fence: drop just the opening marker, keep the rest —
      // safer than discarding content the extractor might still salvage.
      lines = [...lines.slice(0, openIdx), ...lines.slice(openIdx + 1)];
    }
  }

  return lines
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n")
    .trim();
}
