/**
 * qaxs must never dump internal processing details (spec section 25), but
 * total silence while the model loads for the first time in a session is
 * its own bug — a real user hit this and (reasonably) killed the process
 * assuming it had hung. This shows a generic, content-free heartbeat on
 * stderr (so it never pollutes stdout's single-line command output) and
 * clears itself the moment work finishes.
 */
export function startWaitIndicator(): () => void {
  const isTTY = process.stderr.isTTY;
  if (!isTTY) {
    // Non-interactive (piped/redirected) output: a spinner would just be
    // noise in a log file. Stay silent.
    return () => {};
  }

  const frames = ["|", "/", "-", "\\"];
  let i = 0;
  const interval = setInterval(() => {
    process.stderr.write(`\r${frames[i % frames.length]} working...`);
    i++;
  }, 120);

  return () => {
    clearInterval(interval);
    // Clear the line.
    process.stderr.write("\r" + " ".repeat(20) + "\r");
  };
}
