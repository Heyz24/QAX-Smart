import { execSync } from "child_process";
import { ShellName } from "./types";

/**
 * Determines which shell qaxs is running inside of. Priority:
 *   1. Explicit --shell flag (handled by cli.ts, passed in as override)
 *   2. QAXS_SHELL environment variable (set by QAX itself when it launches qaxs)
 *   3. QAX-specific markers (QAX_VERSION / QAX_SHELL_PID)
 *   4. Real parent-process inspection (Windows: tasklist; POSIX: SHELL env var)
 *   5. Platform default, only as a last resort
 *
 * This MUST run before any model inference. The model is never asked to
 * guess the shell.
 *
 * IMPORTANT (found via real-world Windows testing): PSModulePath is NOT a
 * reliable PowerShell-vs-cmd.exe signal. Windows 10/11 sets it as a
 * system-wide environment variable for module discovery, and it is
 * inherited by plain cmd.exe sessions too — checking for it alone
 * misdetects cmd.exe as PowerShell. Never reintroduce that check as the
 * primary signal; see detectWindowsShellFromParentProcess below instead.
 */
export function detectShell(override?: string): ShellName {
  if (override) {
    const normalized = normalizeShellName(override);
    if (normalized) return normalized;
  }

  const envShell = process.env.QAXS_SHELL;
  if (envShell) {
    const normalized = normalizeShellName(envShell);
    if (normalized) return normalized;
  }

  // QAX sets this when it spawns a child process, per its Environment.* module.
  // If present, trust it over generic heuristics.
  if (process.env.QAX_SHELL_PID || process.env.QAX_VERSION) {
    return "QAX";
  }

  if (process.platform === "win32") {
    const fromParent = detectWindowsShellFromParentProcess();
    if (fromParent) return fromParent;
    // Last-resort fallback only if the parent-process check itself failed
    // (e.g. tasklist unavailable / permissions). CMD is the safer default:
    // its syntax is closer to what a naive script produces, and guessing
    // PowerShell wrongly is what caused the original bug.
    return "CMD";
  }

  // POSIX: SHELL env var reflects the user's login/interactive shell.
  const shellPath = process.env.SHELL ?? "";
  if (shellPath.endsWith("zsh")) return "Zsh";
  return "Bash";
}

/**
 * Asks Windows directly what process launched us, via tasklist against
 * process.ppid. This is slightly slower than an env-var check (spawns a
 * subprocess) but is actually correct, which an env-var heuristic here is
 * not — see the doc comment above.
 */
function detectWindowsShellFromParentProcess(): ShellName | undefined {
  try {
    const ppid = process.ppid;
    if (!ppid) return undefined;
    const output = execSync(`tasklist /FI "PID eq ${ppid}" /FO CSV /NH`, {
      encoding: "utf8",
      timeout: 2000,
      windowsHide: true,
    });
    const firstField = output.split(",")[0]?.replace(/"/g, "").trim().toLowerCase();
    if (!firstField) return undefined;
    if (firstField.includes("pwsh") || firstField.includes("powershell")) {
      return "PowerShell";
    }
    if (firstField.includes("cmd.exe")) {
      return "CMD";
    }
    // Parent might be a terminal host (Windows Terminal, ConHost) one
    // level up rather than the shell itself in some launch configurations
    // — not worth chasing further; fall through to the CMD default.
    return undefined;
  } catch {
    return undefined;
  }
}

function normalizeShellName(value: string): ShellName | undefined {
  const v = value.trim().toLowerCase();
  switch (v) {
    case "qax":
      return "QAX";
    case "powershell":
    case "pwsh":
      return "PowerShell";
    case "cmd":
      return "CMD";
    case "bash":
      return "Bash";
    case "zsh":
      return "Zsh";
    default:
      return undefined;
  }
}
