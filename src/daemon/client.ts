import * as net from "net";
import * as path from "path";
import { spawn } from "child_process";
import { socketPathFor, DaemonRequest, DaemonResponse } from "./protocol";

/**
 * qaxs invocations are one-shot CLI calls (`qaxs "find pdfs"`), but the
 * model must not reload every time. This client:
 *   1. Identifies the current shell session by process.ppid (the shell
 *      process that spawned this qaxs invocation).
 *   2. Tries to talk to an already-running daemon for that pid.
 *   3. If none is running, spawns one detached (survives after this CLI
 *      process exits) and retries briefly while it comes up.
 *
 * If the daemon can't be reached at all (spawn failed, socket errors),
 * callers should fall back to loading the model in-process for that one
 * call — slower, but never a hard failure just because the daemon is
 * unavailable.
 *
 * NOTE: the default "generate" timeout is intentionally generous
 * (2 minutes). The FIRST call in a session also has to load the model
 * (disk read + llama.cpp context init) before it can generate anything,
 * which on a slow disk / loaded machine can take well past a typical
 * request-timeout value. cli.ts shows a "please wait" indicator during
 * this window so it's never mistaken for a hang.
 */
export class DaemonGenerationError extends Error {}

export async function generateViaDaemon(request: string, timeoutMs = 120000): Promise<string> {
  const shellPid = process.ppid;
  const socketPath = socketPathFor(shellPid);

  const alreadyRunning = await ping(socketPath).catch(() => false);
  if (!alreadyRunning) {
    spawnDaemon(shellPid);
    await waitForDaemon(socketPath, 5000);
  }

  const response = await sendRequest(socketPath, { type: "generate", request }, timeoutMs);
  if (!response.ok) {
    // The daemon IS reachable — it just failed to generate (e.g. no model
    // file present). This is a real failure to surface, not a reason to
    // retry in-process; the in-process path would hit the exact same
    // error.
    throw new DaemonGenerationError(response.error ?? "daemon generation failed");
  }
  return response.rawOutput ?? "";
}

export async function stopDaemonForCurrentSession(): Promise<boolean> {
  const socketPath = socketPathFor(process.ppid);
  try {
    await sendRequest(socketPath, { type: "shutdown" }, 5000);
    return true;
  } catch {
    return false;
  }
}

function spawnDaemon(shellPid: number) {
  const serverScript = path.join(__dirname, "server.js");
  const child = spawn(process.execPath, [serverScript, String(shellPid)], {
    detached: true,
    stdio: "ignore",
    // Without this, Windows pops a visible console window for the
    // detached daemon process (confirmed via real testing) — the daemon
    // has no interactive UI of its own, so it should never be visible.
    windowsHide: true,
  });
  child.unref();
}

async function waitForDaemon(socketPath: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const alive = await ping(socketPath).catch(() => false);
    if (alive) return;
    await sleep(150);
  }
  throw new Error("timed out waiting for qaxs daemon to start");
}

function ping(socketPath: string): Promise<boolean> {
  return sendRequest(socketPath, { type: "ping" }, 1000).then((r) => r.ok);
}

function sendRequest(socketPath: string, req: DaemonRequest, timeoutMs: number): Promise<DaemonResponse> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let buffer = "";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("daemon request timed out"));
    }, timeoutMs);

    socket.on("connect", () => {
      socket.write(JSON.stringify(req) + "\n");
    });
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
    });
    socket.on("end", () => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(buffer.trim()));
      } catch (err) {
        reject(err);
      }
    });
    socket.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
