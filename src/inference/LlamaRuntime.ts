import * as path from "path";
import * as fs from "fs";
import { resolveModelPath } from "./ModelManager";
import { SINGLE_LINE_COMMAND_GBNF } from "../core/grammar";

/**
 * Resolves the real, on-disk directory qaxs is installed in. Deliberately
 * does NOT just use `path.join(__dirname, "..", "..")` unconditionally -
 * when qaxs is packaged into a standalone binary (e.g. via @yao-pkg/pkg,
 * see SHIP.md), __dirname resolves to a path inside pkg's virtual
 * snapshot filesystem (e.g. /snapshot/qaxs/...), which does not exist on
 * real disk. Confirmed by actually building and running a packaged
 * binary: without this check, model loading failed with "Model not
 * found at /snapshot/qaxs/models/..." even though the real models/
 * folder sat right next to the actual executable.
 */
export function resolveInstallDir(): string {
  // IMPORTANT: do not use fs.existsSync(devPath) to detect packaging.
  // pkg's virtual filesystem shim intercepts fs calls so that paths
  // INSIDE the snapshot (e.g. /snapshot/qaxs/...) report as existing
  // even though they aren't real, on-disk paths - confirmed by actually
  // building a packaged binary: an existsSync-based check here was
  // fooled every time and never fell through to the real-disk branch.
  // `process.pkg` is the actual marker pkg injects into packaged
  // processes; checking that directly is reliable.
  const isPkged = typeof (process as any).pkg !== "undefined";
  if (!isPkged) {
    return path.join(__dirname, "..", "..");
  }
  // Packaged binary: the real, on-disk location is next to the actual
  // executable, not inside the virtual snapshot.
  return path.dirname(process.execPath);
}

/**
 * Wraps node-llama-cpp so the model is loaded exactly once per daemon
 * process and kept resident (spec section 18: never spawn a fresh
 * llama-cli process per request). See src/daemon/server.ts for the
 * process that owns this instance across multiple `qaxs "..."` calls
 * within one shell session, and for the shutdown-on-parent-exit logic
 * that ensures the model is unloaded and no state outlives the session.
 */
export class LlamaRuntime {
  private static instance: LlamaRuntime | null = null;
  private model: any = null;
  private context: any = null;
  private grammar: any = null;
  private modelPath: string;

  private constructor(modelPath: string) {
    this.modelPath = modelPath;
  }

  static get(modelPath?: string): LlamaRuntime {
    if (!LlamaRuntime.instance) {
      let resolved = modelPath;
      if (!resolved) {
        // Delegate to ModelManager so the fine-tuned-model preference
        // (see models/README.md) is actually honored - this was
        // previously dead code, never called from here, so a fine-tuned
        // GGUF dropped into models/ was silently ignored in favor of the
        // base model regardless. Found and fixed while validating the
        // packaged-binary model path above.
        const modelsDir = path.join(resolveInstallDir(), "models");
        resolved = resolveModelPath(modelsDir).path;
      }
      LlamaRuntime.instance = new LlamaRuntime(resolved);
    }
    return LlamaRuntime.instance;
  }

  isModelPresent(): boolean {
    return fs.existsSync(this.modelPath);
  }

  isLoaded(): boolean {
    return this.model !== null;
  }

  private async ensureLoaded() {
    if (this.model && this.context) return;
    if (!this.isModelPresent()) {
      throw new Error(
        `Model not found at ${this.modelPath}. Place the GGUF file there (see models/README.md) — ` +
          `qaxs will not fetch it automatically (offline-first per spec section 3).`
      );
    }

    // Lazy import: keeps `qaxs --dry-run` usable on machines without the
    // native module built yet, and keeps startup fast when unused.
    const { getLlama } = await import("node-llama-cpp");
    const llama = await getLlama();
    this.model = await llama.loadModel({ modelPath: this.modelPath });
    // The context (KV cache etc.) is the other expensive-to-create piece.
    // Both model and context are loaded ONCE and held for the lifetime of
    // this process (the daemon) — see spec section 18.
    this.context = await this.model.createContext();
    // Compiled once and reused for every request (grammar compilation has
    // real cost - no reason to redo it per call since the grammar itself
    // never changes). See src/core/grammar.ts for what this constrains
    // and why.
    this.grammar = await llama.createGrammar({ grammar: SINGLE_LINE_COMMAND_GBNF });
  }

  /**
   * Runs one generation. Deliberately STATELESS between calls: a fresh
   * chat session (and fresh context sequence) is created per call and
   * discarded afterward, so no conversation history or "AI memory"
   * persists across requests (spec section 3: "No persistent AI memory",
   * "Stateless"). Only the expensive model weights + context stay resident.
   *
   * Grammar-constrained by default (src/core/grammar.ts): the model is
   * sampled so it CANNOT produce a newline or backtick character at all,
   * eliminating markdown-fence and multi-line-explanation failures by
   * construction rather than relying solely on catching them after the
   * fact in normalizer.ts/extractor.ts. Pass `grammar: false` to disable
   * for a specific call (e.g. comparative benchmarking against
   * unconstrained output).
   */
  async generate(
    prompt: string,
    opts?: { maxTokens?: number; temperature?: number; grammar?: false }
  ): Promise<string> {
    await this.ensureLoaded();
    const { LlamaChatSession } = await import("node-llama-cpp");
    const sequence = this.context.getSequence();
    const session = new LlamaChatSession({ contextSequence: sequence });
    try {
      const response = await session.prompt(prompt, {
        maxTokens: opts?.maxTokens ?? 64,
        temperature: opts?.temperature ?? 0.1,
        grammar: opts?.grammar === false ? undefined : this.grammar,
      });
      return response;
    } finally {
      // Drop this call's sequence/session so no state carries into the
      // next request. The model + context (the actually expensive part)
      // are left resident. dispose() returns a Promise - awaited here so
      // a rapid next request can't race with this sequence still being
      // torn down (confirmed via node-llama-cpp's actual type
      // definitions that dispose() is async, not fire-and-forget).
      try {
        await sequence?.dispose?.();
      } catch {
        /* best-effort */
      }
    }
  }

  /**
   * Fully unloads the model from memory and releases the llama.cpp
   * context. Called by the daemon on shutdown (parent shell exited, or an
   * explicit `qaxs stop`/`qaxs exit`) — per requirement, nothing about a
   * shell session should outlive that session.
   */
  async shutdown(): Promise<void> {
    try {
      await this.context?.dispose?.();
    } catch {
      /* best-effort */
    }
    try {
      await this.model?.dispose?.();
    } catch {
      /* best-effort */
    }
    this.context = null;
    this.model = null;
    this.grammar = null;
  }
}

