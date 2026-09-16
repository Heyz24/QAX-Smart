import { EnvironmentContext, PipelineOutcome, ShellAdapter, SecurityVerdict } from "./types";
import { buildPrompt, buildQaxPrompt } from "./prompt";
import { normalizeModelOutput } from "./normalizer";
import { extractCommand } from "./extractor";
import { checkSemanticIntent } from "./semantic-validator";
import { evaluateSecurity } from "./security";
import { generateCommand } from "../inference/gateway";
import { looksLikePromptEcho } from "./prompt-echo";

export type GenerateFn = (prompt: string, debug?: boolean) => Promise<string>;

export interface EngineOptions {
  debug?: boolean;
  dryRun?: boolean; // skip inference, use a supplied mock command (testing only)
  mockCommand?: string;
  generateFn?: GenerateFn; // dependency injection point for tests - defaults to the real gateway
  maxAttempts?: number; // defaults to 3; see the retry-ladder note below
}

export interface DebugTrace {
  shell: string;
  os: string;
  prompt: string;
  rawModelOutput: string;
  normalized: string;
  extracted: string | null;
  shellValidation: string;
  semanticValidation: string;
  security: SecurityVerdict;
  attempt: number;
}

export interface EngineResult {
  outcome: PipelineOutcome;
  security?: SecurityVerdict;
  trace?: DebugTrace;
  attempts?: number;
}

const DEFAULT_MAX_ATTEMPTS = 3;

const REPAIR_REMINDER =
  "\n\n(Your previous attempt was invalid or did not exactly match the request. " +
  "Re-read the instructions above and output exactly ONE valid command, nothing else.)";

/**
 * USER REQUEST -> ENV RESOLVER (already done by caller) -> PROMPT BUILDER ->
 * MODEL -> NORMALIZER -> EXTRACTOR -> SHELL VALIDATOR -> SEMANTIC VALIDATOR
 * -> SECURITY POLICY -> (caller handles confirmation + execution)
 *
 * This function stops BEFORE confirmation/execution. cli.ts owns the
 * interactive [Y/n] prompt and the actual adapter.execute() call — the
 * model is never able to influence that boundary.
 *
 * RETRY / SELF-REPAIR LADDER: grammar-constrained decoding
 * (src/core/grammar.ts) prevents most FORMAT failures (markdown fences,
 * multi-line output) by construction. It cannot prevent SEMANTIC
 * failures (a well-formatted command that doesn't match the request) or
 * a model regurgitating the prompt itself — those are independent
 * problems (see grammar.ts's doc comment). For those, this function
 * retries generation up to `maxAttempts` times, appending an escalating
 * reminder to the prompt each time, before giving up. It never retries
 * past a security block (a "blocked" verdict is a complete, correct
 * answer — retrying would just be fishing for a way around it) and never
 * retries a hard generation error (a missing model file fails the same
 * way every time; retrying only adds latency to an already-failed call).
 */
export async function runPipeline(
  env: EnvironmentContext,
  adapter: ShellAdapter,
  request: string,
  opts: EngineOptions = {}
): Promise<EngineResult> {
  const basePrompt = env.shell === "QAX" ? buildQaxPrompt(env, request) : buildPrompt(env, request);
  const maxAttempts = opts.dryRun ? 1 : opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const generate = opts.generateFn ?? generateCommand;

  let lastResult: EngineResult | null = null;
  let currentPrompt = basePrompt;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let rawOutput: string;
    if (opts.dryRun) {
      rawOutput = opts.mockCommand ?? "";
    } else {
      try {
        rawOutput = await generate(currentPrompt, opts.debug);
      } catch (err) {
        // Hard generation errors (e.g. no model file) fail identically on
        // every attempt - retrying adds latency with no chance of success.
        return {
          outcome: { status: "generation_failed", message: "Unable to generate a safe command." },
          attempts: attempt,
          trace: opts.debug ? partialTrace(env, currentPrompt, String(err), attempt) : undefined,
        };
      }
    }

    const attemptResult = evaluateAttempt(env, adapter, request, currentPrompt, rawOutput, attempt, opts.debug);
    lastResult = attemptResult;

    // A successful command, or a definitive security verdict, is a
    // complete answer either way - stop here in both cases.
    if (attemptResult.outcome.status === "ok" || attemptResult.outcome.status === "blocked") {
      return { ...attemptResult, attempts: attempt };
    }

    if (attempt < maxAttempts) {
      currentPrompt = basePrompt + REPAIR_REMINDER;
    }
  }

  return { ...lastResult!, attempts: maxAttempts };
}

function evaluateAttempt(
  env: EnvironmentContext,
  adapter: ShellAdapter,
  request: string,
  prompt: string,
  rawOutput: string,
  attempt: number,
  debug?: boolean
): EngineResult {
  const normalized = normalizeModelOutput(rawOutput);

  // Found via real testing against the un-fine-tuned base model: a small
  // model given a long instruction block sometimes just continues/repeats
  // the prompt text instead of following it (most often the QAX syntax
  // hint). Treat that as a distinct, clearly-labeled failure rather than
  // letting the extractor try to salvage a command out of syntax-notes
  // text — it never contains one.
  if (looksLikePromptEcho(prompt, normalized)) {
    return {
      outcome: { status: "generation_failed", message: "Unable to generate a safe command." },
      trace: debug
        ? traceWith(env, prompt, rawOutput, normalized, "<rejected: model echoed the prompt instead of generating>", "skipped", "skipped", { allowed: false, riskLevel: "low" }, attempt)
        : undefined,
    };
  }

  const extraction = extractCommand(normalized, env.shell);

  if (!extraction.ok || !extraction.command) {
    return {
      outcome: { status: "extraction_failed", message: "Unable to extract a valid command." },
      trace: debug
        ? {
            shell: env.shell,
            os: env.os,
            prompt,
            rawModelOutput: rawOutput,
            normalized,
            extracted: null,
            shellValidation: "skipped",
            semanticValidation: "skipped",
            security: { allowed: false, riskLevel: "low" },
            attempt,
          }
        : undefined,
    };
  }

  const command = extraction.command;

  const shellValidation = adapter.validateCommand(command);
  if (!shellValidation.valid) {
    return {
      outcome: { status: "validation_failed", message: "Unable to validate generated command." },
      trace: debug ? traceWith(env, prompt, rawOutput, normalized, command, shellValidation.reason ?? "invalid", "skipped", { allowed: false, riskLevel: "low" }, attempt) : undefined,
    };
  }

  const semanticValidation = checkSemanticIntent(request, command);
  if (!semanticValidation.valid) {
    return {
      outcome: { status: "validation_failed", message: "Unable to validate generated command." },
      trace: debug ? traceWith(env, prompt, rawOutput, normalized, command, "valid", semanticValidation.reason ?? "invalid", { allowed: false, riskLevel: "low" }, attempt) : undefined,
    };
  }

  const security = evaluateSecurity(command);
  if (!security.allowed) {
    return {
      outcome: { status: "blocked", message: "Command blocked by safety policy.", command },
      security,
      trace: debug ? traceWith(env, prompt, rawOutput, normalized, command, "valid", "valid", security, attempt) : undefined,
    };
  }

  return {
    outcome: { status: "ok", command },
    security,
    trace: debug ? traceWith(env, prompt, rawOutput, normalized, command, "valid", "valid", security, attempt) : undefined,
  };
}

function traceWith(
  env: EnvironmentContext,
  prompt: string,
  raw: string,
  normalized: string,
  extracted: string,
  shellValidation: string,
  semanticValidation: string,
  security: SecurityVerdict,
  attempt: number
): DebugTrace {
  return {
    shell: env.shell,
    os: env.os,
    prompt,
    rawModelOutput: raw,
    normalized,
    extracted,
    shellValidation,
    semanticValidation,
    security,
    attempt,
  };
}

function partialTrace(env: EnvironmentContext, prompt: string, error: string, attempt: number): DebugTrace {
  return {
    shell: env.shell,
    os: env.os,
    prompt,
    rawModelOutput: `<generation error: ${error}>`,
    normalized: "",
    extracted: null,
    shellValidation: "skipped",
    semanticValidation: "skipped",
    security: { allowed: false, riskLevel: "low" },
    attempt,
  };
}
