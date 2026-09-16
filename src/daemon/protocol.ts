import * as os from "os";
import * as path from "path";

/**
 * The daemon is scoped to ONE shell session, identified by the pid of the
 * shell that invoked qaxs (process.ppid on the very first invocation).
 * Socket path is derived from that pid, so:
 *   - Two different terminal windows never share a daemon or its state.
 *   - When that shell process exits, the daemon (which watches the same
 *     pid) notices and shuts itself down — unloading the model and
 *     deleting the socket. Nothing survives past the session that started
 *     it, per the "stateless / no persistent AI memory" requirement.
 */
export function socketPathFor(shellPid: number): string {
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\qaxs-${shellPid}`;
  }
  return path.join(os.tmpdir(), `qaxs-${shellPid}.sock`);
}

export interface DaemonRequest {
  type: "generate" | "ping" | "shutdown";
  request?: string;
  shell?: string;
  cwd?: string;
}

export interface DaemonResponse {
  ok: boolean;
  rawOutput?: string;
  error?: string;
}

export const IDLE_SHUTDOWN_MS = 15 * 60 * 1000; // unload if unused for 15 min
export const PARENT_CHECK_INTERVAL_MS = 2000;
