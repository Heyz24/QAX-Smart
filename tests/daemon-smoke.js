const net = require("net");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { spawn } = require("child_process");

function socketPathFor(pid) {
  if (process.platform === "win32") return `\\\\.\\pipe\\qaxs-${pid}`;
  return path.join(os.tmpdir(), `qaxs-${pid}.sock`);
}

function sendRequest(socketPath, req, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let buffer = "";
    const timer = setTimeout(() => { socket.destroy(); reject(new Error("timeout")); }, timeoutMs);
    socket.on("connect", () => socket.write(JSON.stringify(req) + "\n"));
    socket.on("data", (c) => (buffer += c.toString()));
    socket.on("end", () => { clearTimeout(timer); try { resolve(JSON.parse(buffer.trim())); } catch (e) { reject(e); } });
    socket.on("error", (e) => { clearTimeout(timer); reject(e); });
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

// Cross-platform "kill this process (and its children if any)".
function killProcessTree(pid) {
  if (process.platform === "win32") {
    try {
      spawn("taskkill", ["/PID", String(pid), "/F", "/T"], { stdio: "ignore", windowsHide: true });
    } catch { /* best-effort */ }
  } else {
    try {
      process.kill(-pid, "SIGKILL"); // negative pid = whole process group (POSIX only)
    } catch {
      try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ }
    }
  }
}

async function main() {
  console.log("--- spawning a fake 'shell' process to act as the parent session ---");
  // Node itself, running an indefinite loop, works identically on every
  // platform this project targets - no reliance on a Unix-only binary
  // like `sleep` (that dependency was a real bug in an earlier version
  // of this test, caught by running it on Windows).
  const fakeShell = spawn(
    process.execPath,
    ["-e", "setInterval(() => {}, 1000)"],
    { detached: process.platform !== "win32" }
  );
  const shellPid = fakeShell.pid;
  console.log("fake shell pid:", shellPid);
  if (!shellPid) throw new Error("failed to spawn fake shell process");

  const socketPath = socketPathFor(shellPid);
  console.log("--- spawning qaxs daemon watching that pid ---");
  const daemon = spawn(
    process.execPath,
    [path.join(__dirname, "..", "dist", "daemon", "server.js"), String(shellPid)],
    { detached: true, stdio: "inherit", windowsHide: true }
  );
  daemon.unref();

  console.log("--- waiting for daemon socket to come up ---");
  let up = false;
  for (let i = 0; i < 50; i++) {
    try {
      const r = await sendRequest(socketPath, { type: "ping" });
      if (r.ok) { up = true; break; }
    } catch { /* retry */ }
    await sleep(150);
  }
  console.log("daemon responded to ping:", up);
  if (!up) throw new Error("daemon never came up");

  console.log("--- sending a generate request (expect either a real command back, or a clean 'Model not found' - both prove the round-trip works) ---");
  const genResult = await sendRequest(socketPath, { type: "generate", request: "find all pdfs in downloads" }, 120000);
  console.log("generate response:", genResult);
  if (!genResult.ok && !/Model not found/.test(genResult.error || "")) {
    throw new Error("unexpected failure shape: " + genResult.error);
  }

  console.log("--- killing the fake shell process (simulates the user's terminal closing) ---");
  killProcessTree(shellPid);
  await sleep(4000); // daemon polls parent liveness every 2s; give it margin

  const daemonStillRunning = isAlive(daemon.pid);
  console.log("daemon process still running after parent death:", daemonStillRunning);
  if (daemonStillRunning) {
    killProcessTree(daemon.pid);
    throw new Error("FAIL: daemon did not shut down when its parent shell exited");
  }

  if (process.platform !== "win32") {
    const socketStillExists = fs.existsSync(socketPath);
    console.log("socket file still exists after shutdown:", socketStillExists);
    if (socketStillExists) throw new Error("FAIL: daemon left its socket file behind");
  }
  // Windows named pipes have no on-disk file to check - liveness of the
  // daemon process itself (checked above) is the meaningful signal there.

  console.log("\nALL DAEMON LIFECYCLE CHECKS PASSED");
}

main().catch((err) => {
  console.error("DAEMON SMOKE TEST FAILED:", err.message);
  process.exit(1);
});
