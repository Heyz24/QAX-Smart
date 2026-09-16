import * as fs from "fs";
import * as path from "path";
import { EnvironmentContext } from "./types";

/**
 * A cheap, purely local, non-blocking sanity check: does this command
 * reference a specific file/path that clearly doesn't exist on disk?
 * Small models occasionally hallucinate a plausible-looking filename
 * (e.g. "architecture.md" when the real file is "ARCHITECTURE.md"). This
 * only ever produces a warning shown alongside the command before
 * confirmation — never a rejection. The user still decides.
 *
 * DELIBERATELY SCOPED to an allowlist of "consumption" commands (read,
 * navigate to, open, or delete something that should already exist).
 * Commands whose entire purpose is creating something that does NOT yet
 * exist (mkdir, touch, cp/mv destinations, New-Item, redirection
 * targets) are excluded entirely — warning "doesn't exist" on
 * `mkdir newproject` would be actively wrong, not just unhelpful, since
 * that command not existing yet is the expected, correct case. Getting
 * this allowlist wrong in the other direction (too broad) is worse than
 * not having the feature at all, so it stays narrow on purpose.
 */
const CONSUMPTION_COMMANDS = new Set([
  "cat", "type", "less", "more", "cd", "open", "start", "edit", "nano",
  "source", ".", "rm", "del",
]);

export function checkReferencedPaths(command: string, env: EnvironmentContext): string[] {
  const firstWord = command.trim().split(/\s+/)[0]?.toLowerCase();
  if (!firstWord || !CONSUMPTION_COMMANDS.has(firstWord)) {
    return [];
  }

  const warnings: string[] = [];
  for (const token of extractPathLikeTokens(command)) {
    const resolved = resolveAgainstEnv(token, env);
    if (resolved && !fs.existsSync(resolved)) {
      warnings.push(`note: '${token}' does not appear to exist`);
    }
  }
  return warnings;
}

const SKIP_CHARS = /[$%*?{}[\]<>|&;`]/;

function extractPathLikeTokens(command: string): string[] {
  const tokens = command.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  return tokens
    .slice(1)
    .map((t) => t.replace(/^["']|["']$/g, ""))
    .filter((t) => !SKIP_CHARS.test(t))
    .filter((t) => /[\\/]/.test(t) || /\.\w{1,5}$/.test(t))
    .filter((t) => !t.startsWith("-"));
}

function resolveAgainstEnv(token: string, env: EnvironmentContext): string | null {
  if (path.isAbsolute(token)) return token;
  if (token.startsWith("~/")) return path.join(env.home, token.slice(2));
  return path.join(env.cwd, token);
}
