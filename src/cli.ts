#!/usr/bin/env node
import * as readline from "readline";
import * as path from "path";
import { Command } from "commander";
import { resolveEnvironment } from "./core/environment";
import { detectShell } from "./core/shell-detect";
import { runPipeline } from "./core/engine";
import { ShellAdapter } from "./core/types";
import { QAXAdapter } from "./shells/QAXAdapter";
import { BashAdapter, ZshAdapter } from "./shells/BashAdapter";
import { PowerShellAdapter, CMDAdapter } from "./shells/PowerShellAdapter";
import { stopDaemonForCurrentSession } from "./daemon/client";
import { startWaitIndicator } from "./cli-wait-indicator";
import { checkReferencedPaths } from "./core/path-sanity";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require(path.join(__dirname, "..", "package.json"));

function buildAdapter(shell: ReturnType<typeof detectShell>, env: ReturnType<typeof resolveEnvironment>): ShellAdapter {
  switch (shell) {
    case "QAX":
      return new QAXAdapter(env);
    case "Bash":
      return new BashAdapter(env);
    case "Zsh":
      return new ZshAdapter(env);
    case "PowerShell":
      return new PowerShellAdapter(env);
    case "CMD":
      return new CMDAdapter(env);
  }
}

async function confirm(promptText: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(promptText, (answer: string) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === "y" || normalized === "yes");
    });
  });
}

async function runRequest(request: string, opts: Record<string, any>) {
  const shell = detectShell(opts.shell);
  const env = resolveEnvironment(shell);
  const adapter = buildAdapter(shell, env);

  const stopWaiting = opts.dryRun ? () => {} : startWaitIndicator();
  const result = await runPipeline(env, adapter, request, {
    debug: Boolean(opts.debug),
    dryRun: Boolean(opts.dryRun),
    mockCommand: opts.dryRun,
  });
  stopWaiting();

  if (opts.debug && result.trace) {
    console.error("---- qaxs debug trace ----");
    console.error(`total attempts: ${result.attempts ?? 1}`);
    console.error(JSON.stringify(result.trace, null, 2));
    console.error("---------------------------");
  }

  const { outcome } = result;

  if (outcome.status !== "ok") {
    console.error(outcome.message);
    process.exitCode = 1;
    return;
  }

  const command = outcome.command!;
  console.log(command);

  if (result.security && result.security.riskLevel === "medium") {
    console.log(`\u26A0 ${result.security.reason} (medium risk)`);
  }

  // Local, deterministic, non-blocking: warns if the command references
  // a path that doesn't appear to exist (catches the model hallucinating
  // a filename) without ever affecting whether execution proceeds - the
  // user still decides. See src/core/path-sanity.ts for the (narrow,
  // deliberately conservative) scope of what this checks.
  for (const note of checkReferencedPaths(command, env)) {
    console.log(note);
  }

  let shouldExecute = Boolean(opts.yes);
  if (!shouldExecute) {
    shouldExecute = await confirm("\nExecute? [Y/n] ");
  }
  if (!shouldExecute) return;

  const execResult = await adapter.execute(command);
  if (execResult.stdout) process.stdout.write(execResult.stdout);
  if (execResult.stderr) process.stderr.write(execResult.stderr);
  process.exitCode = execResult.exitCode;
}

async function main() {
  const program = new Command();
  program
    .name("qaxs")
    .description("Offline natural-language to shell-command compiler")
    .version(pkg.version, "-v, --version")
    .option("--shell <shell>", "override shell detection (QAX|PowerShell|CMD|Bash|Zsh)")
    .option("--debug", "show internal pipeline state (never shown by default)")
    .option("--yes", "skip confirmation and execute immediately (use with care)")
    .option("--dry-run <command>", "skip inference, pipe this literal string through the pipeline (testing only)")
    .argument("[request...]", "natural language request, e.g. \"find all pdfs in downloads\"")
    .action(async (requestParts: string[], opts) => {
      // `qaxs` with no request at all -> show help, same as `qaxs help`.
      if (!requestParts || requestParts.length === 0) {
        program.outputHelp();
        return;
      }
      await runRequest(requestParts.join(" "), opts);
    });

  program
    .command("help")
    .description("show usage")
    .action(() => program.outputHelp());

  program
    .command("stop")
    .alias("exit")
    .description("stop this shell session's qaxs daemon now and unload the model from memory")
    .action(async () => {
      const stopped = await stopDaemonForCurrentSession();
      if (!stopped) {
        // Nothing was running for this session - not an error.
        process.exitCode = 0;
      }
    });

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error("qaxs: unexpected error:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
