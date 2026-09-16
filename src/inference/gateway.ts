import { generateViaDaemon, DaemonGenerationError } from "../daemon/client";
import { LlamaRuntime } from "./LlamaRuntime";

/**
 * Single entry point the engine calls for generation. Always prefers the
 * resident session daemon (model loaded once, unloaded automatically when
 * the parent shell exits — see src/daemon). Falls back to loading the
 * model directly in this short-lived CLI process only if the daemon
 * itself is genuinely unreachable (couldn't spawn, socket errors, timeout)
 * — a real generation failure reported BY a reachable daemon (e.g. no
 * model file installed) is surfaced as-is, since retrying in-process would
 * hit the identical error.
 */
export async function generateCommand(prompt: string, debug?: boolean): Promise<string> {
  try {
    return await generateViaDaemon(prompt);
  } catch (err) {
    if (err instanceof DaemonGenerationError) {
      throw err;
    }
    if (debug) {
      console.error(`qaxs: daemon unreachable (${err instanceof Error ? err.message : err}), falling back to in-process inference`);
    }
    return LlamaRuntime.get().generate(prompt);
  }
}
