import { BaseShellAdapter } from "./ShellAdapter";
import { ExecutionResult, ShellName, ValidationResult } from "../core/types";

const POSIX_ONLY_TOKENS = /\b(find\s+\S+\s+-type|grep\s+-|ls\s+-[a-z]*l)\b/i;

export class PowerShellAdapter extends BaseShellAdapter {
  getName(): ShellName {
    return "PowerShell";
  }
  detect(): boolean {
    return this.env.os === "windows" && Boolean(process.env.PSModulePath);
  }
  validateCommand(command: string): ValidationResult {
    if (POSIX_ONLY_TOKENS.test(command)) {
      return { valid: false, reason: "command uses POSIX-only syntax in a PowerShell context" };
    }
    return { valid: true };
  }
  async execute(command: string): Promise<ExecutionResult> {
    return this.runViaBinary("powershell", ["-NoProfile", "-NonInteractive", "-Command", command]);
  }
}

export class CMDAdapter extends BaseShellAdapter {
  getName(): ShellName {
    return "CMD";
  }
  detect(): boolean {
    return this.env.os === "windows" && !process.env.PSModulePath;
  }
  validateCommand(command: string): ValidationResult {
    if (POSIX_ONLY_TOKENS.test(command)) {
      return { valid: false, reason: "command uses POSIX-only syntax in a CMD context" };
    }
    // cmd.exe has no $(...) or -Recurse; catch the most common LLM slip-ups.
    if (/\$\(.*\)/.test(command)) {
      return { valid: false, reason: "cmd.exe does not support $(...) command substitution" };
    }
    return { valid: true };
  }
  async execute(command: string): Promise<ExecutionResult> {
    return this.runViaBinary("cmd", ["/c", command]);
  }
}
