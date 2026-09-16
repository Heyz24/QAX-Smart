const test = require("node:test");
const assert = require("node:assert/strict");
const { detectShell } = require("../../dist/core/shell-detect");

test("explicit --shell override wins over everything else", () => {
  assert.equal(detectShell("bash"), "Bash");
  assert.equal(detectShell("PowerShell"), "PowerShell");
  assert.equal(detectShell("qax"), "QAX");
});

test("override is case-insensitive", () => {
  assert.equal(detectShell("BASH"), "Bash");
  assert.equal(detectShell("Zsh"), "Zsh");
});

test("an unrecognized override falls through to other detection rather than throwing", () => {
  assert.doesNotThrow(() => detectShell("not-a-real-shell"));
});

test("QAXS_SHELL env var is honored when no override is given", () => {
  const prev = process.env.QAXS_SHELL;
  process.env.QAXS_SHELL = "zsh";
  try {
    assert.equal(detectShell(), "Zsh");
  } finally {
    if (prev === undefined) delete process.env.QAXS_SHELL;
    else process.env.QAXS_SHELL = prev;
  }
});

test("QAX_VERSION marker forces QAX shell detection", () => {
  const prevV = process.env.QAX_VERSION;
  const prevQS = process.env.QAXS_SHELL;
  delete process.env.QAXS_SHELL;
  process.env.QAX_VERSION = "3.0.0";
  try {
    assert.equal(detectShell(), "QAX");
  } finally {
    if (prevV === undefined) delete process.env.QAX_VERSION; else process.env.QAX_VERSION = prevV;
    if (prevQS !== undefined) process.env.QAXS_SHELL = prevQS;
  }
});

// REGRESSION NOTE: an earlier version of detectShell() used
// `if (process.env.PSModulePath) return "PowerShell"` as its Windows
// heuristic. This is NOT tested here with a mock because the fix
// (src/core/shell-detect.ts) now shells out to `tasklist` for a real
// answer, which requires an actual Windows process tree to test
// meaningfully - not something a unit test can fake cheaply. The
// regression to prevent is structural: PSModulePath must never again be
// used as the PRIMARY Windows-shell signal. See the comment at the top of
// shell-detect.ts for why, and confirm on real Windows hardware after any
// change to that file (see HANDOFF.md's testing notes).
