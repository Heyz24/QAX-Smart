const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPrompt, buildQaxPrompt, QAX_SYNTAX_HINT } = require("../../dist/core/prompt");

function makeEnv(overrides = {}) {
  return {
    os: "linux",
    shell: "Bash",
    cwd: "/home/user",
    home: "/home/user",
    downloads: "/home/user/Downloads",
    documents: "/home/user/Documents",
    desktop: "/home/user/Desktop",
    username: "user",
    ...overrides,
  };
}

test("buildPrompt injects the request text and environment values", () => {
  const env = makeEnv();
  const prompt = buildPrompt(env, "find all pdfs in downloads");
  assert.match(prompt, /find all pdfs in downloads/);
  assert.match(prompt, /TARGET SHELL: Bash/);
  assert.match(prompt, /DOWNLOADS: \/home\/user\/Downloads/);
});

test("buildPrompt never includes the QAX hint for non-QAX shells", () => {
  const env = makeEnv({ shell: "PowerShell" });
  const prompt = buildPrompt(env, "list files");
  assert.doesNotMatch(prompt, /QAX SHELL:/);
});

test("buildQaxPrompt includes the QAX syntax hint and few-shot examples", () => {
  const env = makeEnv({ shell: "QAX" });
  const prompt = buildQaxPrompt(env, "check if config exists");
  assert.match(prompt, /QAX SHELL:/);
  // The few-shot examples themselves - added specifically because a long,
  // purely descriptive hint block was what the base model echoed back
  // verbatim instead of generating a command (see prompt-echo.test.js).
  assert.match(prompt, /Request: check if notes\.txt exists/);
  assert.match(prompt, /Command: \[ -f notes\.txt \]/);
});

test("QAX_SYNTAX_HINT itself never exceeds a reasonable length for a 0.5B model's context budget", () => {
  // Not a hard science, but a canary: if this block grows dramatically
  // (e.g. someone reverts to the old long bullet-list version), this
  // test should prompt a second look rather than silently regressing
  // the exact failure mode that motivated shortening it.
  assert.ok(QAX_SYNTAX_HINT.length < 600, `QAX_SYNTAX_HINT is ${QAX_SYNTAX_HINT.length} chars - investigate before growing this further`);
});

test("examples never hardcode a real-looking Downloads/Documents/Desktop path, to avoid anchoring the model away from the real supplied paths", () => {
  assert.doesNotMatch(QAX_SYNTAX_HINT, /\/home\/\w+\/(Downloads|Documents|Desktop)/);
});
