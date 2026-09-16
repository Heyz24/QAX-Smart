const test = require("node:test");
const assert = require("node:assert/strict");
const { extractCommand } = require("../../dist/core/extractor");

test("extracts a single clean command", () => {
  const r = extractCommand('find . -name "*.pdf"', "Bash");
  assert.equal(r.ok, true);
  assert.equal(r.command, 'find . -name "*.pdf"');
});

test("REGRESSION: rejects a fragment starting with an unmatched single quote", () => {
  // This is exactly what reached execution in real Windows testing:
  // cmd.exe split 'echo test' into two argv tokens because it doesn't
  // treat single quotes as grouping characters, and the resulting
  // fragment "'echo" slipped through validation and crashed the
  // PowerShell adapter it got routed to. It must now be rejected here,
  // shell-agnostically, before any adapter ever sees it.
  const r = extractCommand("'echo", "CMD");
  assert.equal(r.ok, false);
  assert.match(r.reason, /unbalanced quote/);
});

test("REGRESSION: rejects an unmatched leading double quote the same way", () => {
  const r = extractCommand('"echo', "PowerShell");
  assert.equal(r.ok, false);
});

test("does NOT false-positive on a legitimate command containing an apostrophe mid-string", () => {
  // A naive "count all quote characters, reject if odd" check would wrongly
  // reject this - only a *leading, unmatched* quote is treated as garbage.
  const r = extractCommand('echo "it\'s fine"', "Bash");
  assert.equal(r.ok, true);
});

test("does NOT false-positive on a command that starts with a properly closed quote", () => {
  const r = extractCommand('"$(Get-Date)" | Out-File log.txt', "PowerShell");
  assert.equal(r.ok, true);
});

test("drops a trailing explanation line and keeps the command", () => {
  const r = extractCommand('find . -name "*.pdf"\nThis command searches for PDF files.', "Bash");
  assert.equal(r.ok, true);
  assert.equal(r.command, 'find . -name "*.pdf"');
});

test("rejects multiple independent command lines rather than guessing", () => {
  const r = extractCommand("cd Downloads\nls", "Bash");
  assert.equal(r.ok, false);
  assert.match(r.reason, /multiple independent lines/);
});

test("does NOT reject a single line containing ';' chaining (not a multi-line split)", () => {
  const r = extractCommand('mkdir build; cd build', "Bash");
  assert.equal(r.ok, true);
});

test("rejects empty output", () => {
  const r = extractCommand("", "Bash");
  assert.equal(r.ok, false);
});

test("rejects output that is only prose with no shell syntax after explanation-stripping", () => {
  const r = extractCommand("Here is what you asked for.", "Bash");
  assert.equal(r.ok, false);
});
