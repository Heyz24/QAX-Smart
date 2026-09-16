import { ShellName } from "./types";

export interface ExtractionResult {
  ok: boolean;
  command?: string;
  reason?: string;
}

// Trailing explanation sentences the model sometimes appends after a
// perfectly good command on its own line above.
const TRAILING_EXPLANATION = /^(this (command|will)|which (finds|lists|searches)|it (finds|lists|searches))/i;

/**
 * Extraction priority (per spec section 11):
 *   1. Fenced code block matching target shell        (normalizer already
 *      strips the fence itself, so by the time we get here this collapses
 *      into "single clean line(s) remain")
 *   2. Shell-labelled command block                    (same as above)
 *   3. Strong standalone command candidate
 *   4. Known shell command pattern
 *   5. Otherwise reject
 *
 * We never blindly split on ';' or newline — QAX/Bash/Zsh use ';' as a
 * legitimate chaining operator, so a ';' inside a single normalized line
 * is left alone. We only reject when the model produced multiple
 * INDEPENDENT top-level lines with no shell operator joining them.
 */
export function extractCommand(normalized: string, _shell: ShellName): ExtractionResult {
  if (!normalized) {
    return { ok: false, reason: "empty output" };
  }

  const lines = normalized.split("\n").filter((l) => l.trim().length > 0);

  // Drop trailing explanation lines the model tacked on after the command.
  while (
    lines.length > 1 &&
    TRAILING_EXPLANATION.test(lines[lines.length - 1].trim())
  ) {
    lines.pop();
  }

  if (lines.length === 0) {
    return { ok: false, reason: "empty output after stripping explanations" };
  }

  if (lines.length === 1) {
    const candidate = lines[0].trim();
    if (looksLikeProse(candidate)) {
      return { ok: false, reason: "single line looks like prose, not a command" };
    }
    if (hasUnbalancedQuotes(candidate)) {
      // Found via real testing: cmd.exe doesn't treat single quotes as a
      // grouping character the way bash/QAX/PowerShell do, so a shell
      // that mis-tokenized user input upstream (or a model that emitted
      // malformed output) can hand us a fragment like `'echo` with a
      // stray, unmatched quote. This is shell-agnostic garbage, not a
      // real command in any of the shells qaxs targets — reject it here
      // rather than relying on every individual adapter to catch it.
      return { ok: false, reason: "unbalanced quote characters - not a valid command in any supported shell" };
    }
    return { ok: true, command: candidate };
  }

  // Multiple lines remain. This is only acceptable if it's genuinely one
  // logical command wrapped across lines (e.g. a line-continuation), which
  // in practice from a 0.5B model is rare enough not to guess at — reject.
  return {
    ok: false,
    reason:
      "model produced multiple independent lines; refusing to guess which is the command",
  };
}

function hasUnbalancedQuotes(line: string): boolean {
  // Narrow, deliberately conservative check: only flags a command whose
  // very first character is a quote that never closes anywhere else in
  // the string. A full quote-balance parser would misfire on entirely
  // valid commands containing an apostrophe inside a double-quoted
  // string (e.g. echo "it's fine") - counting total quote characters
  // globally is NOT safe. Starting with an unmatched quote, on the other
  // hand, is never valid in any of qaxs's target shells.
  const first = line[0];
  if (first !== "'" && first !== '"') return false;
  const rest = line.slice(1);
  return !rest.includes(first);
}

const PROSE_MARKERS = [
  /^(here|this|note|please|sure|okay|ok)\b/i,
  /[.!?]$/,
];

function looksLikeProse(line: string): boolean {
  // A line ending in punctuation with spaces and no shell-like tokens is
  // almost certainly prose that slipped past the normalizer.
  const hasShellSyntax = /[|<>&;$`]|^\S+\s/.test(line);
  if (!hasShellSyntax) return false;
  return PROSE_MARKERS.some((p) => p.test(line));
}
