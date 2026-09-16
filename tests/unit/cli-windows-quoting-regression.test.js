const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { spawnSync } = require("child_process");

const CLI = path.join(__dirname, "..", "..", "dist", "cli.js");

/**
 * REGRESSION TEST for the exact real-world failure reported from a
 * Windows cmd.exe session:
 *
 *   qaxs --dry-run 'echo test' "say hello"
 *
 * cmd.exe does not treat single quotes as a grouping character (unlike
 * bash/PowerShell/QAX), so it split this into FIVE separate argv tokens
 * rather than three: ["--dry-run", "'echo", "test'", "say", "hello"].
 * Node's child_process.spawn with an argument ARRAY (no shell:true)
 * passes tokens through exactly as given, with no re-tokenization -
 * which is exactly equivalent to what cmd.exe had already handed to
 * node in the real failure. This lets the exact bug be reproduced
 * deterministically in CI on any OS, without needing a Windows machine
 * or cmd.exe itself.
 *
 * Before the fix: this reached the (wrongly-detected) PowerShell
 * adapter's execute() with the fragment "'echo" and crashed with a
 * PowerShell parser error. After the fix: extractCommand's leading
 * -unmatched-quote check rejects it before any adapter is even
 * consulted, with a clear message and no attempt to execute anything.
 */
test("REGRESSION: cmd.exe's un-grouped single-quote tokenization no longer reaches execution", () => {
  const result = spawnSync(process.execPath, [
    CLI,
    "--dry-run", "'echo",
    "test'", "say", "hello",
  ], { encoding: "utf8", timeout: 10000 });

  assert.equal(result.status, 1, "should exit non-zero, never reach a Y/n prompt");
  assert.match(result.stderr, /Unable to extract a valid command/);
  assert.doesNotMatch(result.stdout, /Execute\?/, "must never offer to execute the malformed fragment");
});

test("sanity check: a properly single-token dry-run command still works end to end", () => {
  const result = spawnSync(process.execPath, [
    CLI,
    "--dry-run", "echo hello",
    "say", "hello",
  ], { encoding: "utf8", input: "n\n", timeout: 10000 });

  assert.match(result.stdout, /echo hello/);
  assert.match(result.stdout, /Execute\?/);
});
