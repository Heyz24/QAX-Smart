export type ShellName = "QAX" | "PowerShell" | "CMD" | "Bash" | "Zsh";

export interface EnvironmentContext {
  os: "windows" | "macos" | "linux";
  shell: ShellName;
  cwd: string;
  home: string;
  downloads: string;
  documents: string;
  desktop: string;
  username: string;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface SecurityVerdict {
  allowed: boolean;
  reason?: string;
  riskLevel: "low" | "medium" | "high" | "critical";
}

export interface PipelineOutcome {
  status: "ok" | "generation_failed" | "extraction_failed" | "validation_failed" | "blocked";
  command?: string;
  message?: string;
}

export interface ShellAdapter {
  getName(): ShellName;
  detect(): boolean;
  getEnvironment(): EnvironmentContext;
  getPromptContext(): Record<string, string>;
  validateCommand(command: string): ValidationResult;
  execute(command: string): Promise<ExecutionResult>;
}
