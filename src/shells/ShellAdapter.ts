import { spawn } from "child_process";
import { EnvironmentContext, ExecutionResult, ShellAdapter, ShellName, ValidationResult } from "../core/types";

export abstract class BaseShellAdapter implements ShellAdapter {
  constructor(protected env: EnvironmentContext) {}

  abstract getName(): ShellName;
  abstract detect(): boolean;
  abstract validateCommand(command: string): ValidationResult;

  getEnvironment(): EnvironmentContext {
    return this.env;
  }

  getPromptContext(): Record<string, string> {
    return {
      TARGET_SHELL: this.getName(),
      OS: this.env.os,
      CWD: this.env.cwd,
      HOME: this.env.home,
      DOWNLOADS: this.env.downloads,
      DOCUMENTS: this.env.documents,
      DESKTOP: this.env.desktop,
    };
  }

  /** Shared spawn helper: runs `binary args...` with the command as a single
   * argument the target shell interprets itself — never string-concatenated
   * into a parent shell's command line. */
  protected async runViaBinary(binary: string, args: string[]): Promise<ExecutionResult> {
    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      const child = spawn(binary, args, { cwd: this.env.cwd });
      child.stdout?.on("data", (d) => (stdout += d.toString()));
      child.stderr?.on("data", (d) => (stderr += d.toString()));
      child.on("close", (code) => {
        resolve({ stdout, stderr, exitCode: code ?? 1 });
      });
      child.on("error", (err) => {
        resolve({ stdout, stderr: stderr + String(err), exitCode: 1 });
      });
    });
  }

  abstract execute(command: string): Promise<ExecutionResult>;
}
