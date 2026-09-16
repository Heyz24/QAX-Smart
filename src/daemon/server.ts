import * as net from "net";
import * as fs from "fs";
import { socketPathFor, DaemonRequest, DaemonResponse, IDLE_SHUTDOWN_MS, PARENT_CHECK_INTERVAL_MS } from "./protocol";
import { LlamaRuntime } from "../inference/LlamaRuntime";

/**
 * Entry point for the background qaxs daemon (spawned detached by
 * cli.ts's daemon client on first use in a shell session). Never invoked
 * directly by the user.
 *
 * Lifecycle:
 *   - Loads the model lazily on the FIRST real "generate" request (not at
 *     daemon startup) — a shell session that never calls qaxs never pays
 *     the load cost.
 *   - Watches the parent shell's pid. When that process is gone, this
 *     process unloads the model, removes the socket file, and exits.
 *   - Also self-terminates after IDLE_SHUTDOWN_MS with no requests, as a
 *     safety net in case parent-pid tracking ever fails (e.g. pid reuse).
 */
function main() {
  const shellPid = Number(process.argv[2]);
  if (!shellPid || Number.isNaN(shellPid)) {
    console.error("qaxs-daemon: missing shell pid argument");
    process.exit(1);
  }

  const socketPath = socketPathFor(shellPid);
  // Stale socket from a crashed previous daemon for this pid (unlikely
  // since pids aren't reused quickly, but cheap to guard).
  if (process.platform !== "win32" && fs.existsSync(socketPath)) {
    try {
      fs.unlinkSync(socketPath);
    } catch {
      /* ignore */
    }
  }

  let idleTimer: NodeJS.Timeout;
  const resetIdleTimer = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => shutdown("idle timeout"), IDLE_SHUTDOWN_MS);
  };

  const server = net.createServer((socket) => {
    let buffer = "";
    socket.on("data", async (chunk) => {
      buffer += chunk.toString();
      if (!buffer.includes("\n")) return; // wait for full line-delimited message
      const line = buffer.trim();
      buffer = "";

      let msg: DaemonRequest;
      try {
        msg = JSON.parse(line);
      } catch {
        socket.end(JSON.stringify({ ok: false, error: "malformed request" } as DaemonResponse) + "\n");
        return;
      }

      if (msg.type === "ping") {
        socket.end(JSON.stringify({ ok: true } as DaemonResponse) + "\n");
        return;
      }

      if (msg.type === "shutdown") {
        socket.end(JSON.stringify({ ok: true } as DaemonResponse) + "\n");
        await shutdown("explicit stop");
        return;
      }

      resetIdleTimer();
      try {
        const rawOutput = await LlamaRuntime.get().generate(msg.request ?? "");
        socket.end(JSON.stringify({ ok: true, rawOutput } as DaemonResponse) + "\n");
      } catch (err) {
        socket.end(
          JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) } as DaemonResponse) + "\n"
        );
      }
    });
  });

  server.listen(socketPath, () => {
    resetIdleTimer();
  });

  const parentWatcher = setInterval(() => {
    if (!isProcessAlive(shellPid)) {
      shutdown("parent shell exited");
    }
  }, PARENT_CHECK_INTERVAL_MS);

  let shuttingDown = false;
  async function shutdown(_reason: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(parentWatcher);
    clearTimeout(idleTimer);
    server.close();
    // Unload the model from memory — nothing about this session should
    // outlive the shell that started it.
    await LlamaRuntime.get().shutdown();
    if (process.platform !== "win32") {
      try {
        fs.unlinkSync(socketPath);
      } catch {
        /* already gone */
      }
    }
    process.exit(0);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

function isProcessAlive(pid: number): boolean {
  try {
    // Signal 0 performs no-op existence/permission check on both POSIX
    // and Windows via Node's libuv shim; throws ESRCH if the pid is gone.
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

main();
