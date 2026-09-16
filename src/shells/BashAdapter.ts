import { BaseShellAdapter } from "./ShellAdapter";
import { ExecutionResult, ShellName, ValidationResult } from "../core/types";

const WINDOWS_ONLY_TOKENS = /\b(dir\s+\/[a-z]|%[A-Za-z_][A-Za-z0-9_]*%|Get-ChildItem|Get-Process)\b/i;

export class BashAdapter extends BaseShellAdapter {
  getName(): ShellName {
    return "Bash";
  }
  detect(): boolean {
    return this.env.os !== "windows" && (process.env.SHELL ?? "").endsWith("bash");
  }
  validateCommand(command: string): ValidationResult {
    if (WINDOWS_ONLY_TOKENS.test(command)) {
      return { valid: false, reason: "command uses Windows-only syntax in a Bash context" };
    }
    return { valid: true };
  }
  async execute(command: string): Promise<ExecutionResult> {
    return this.runViaBinary("bash", ["-c", command]);
  }
}

export class ZshAdapter extends BaseShellAdapter {
  getName(): ShellName {
    return "Zsh";
  }
  detect(): boolean {
    return this.env.os !== "windows" && (process.env.SHELL ?? "").endsWith("zsh");
  }
  validateCommand(command: string): ValidationResult {
    if (WINDOWS_ONLY_TOKENS.test(command)) {
      return { valid: false, reason: "command uses Windows-only syntax in a Zsh context" };
    }
    return { valid: true };
  }
  async execute(command: string): Promise<ExecutionResult> {
    return this.runViaBinary("zsh", ["-c", command]);
  }
}
