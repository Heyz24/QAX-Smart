const test = require("node:test");
const assert = require("node:assert/strict");
const { looksLikePromptEcho } = require("../../dist/core/prompt-echo");

test("REGRESSION: detects the exact echo pattern observed from the base model", () => {
  const prompt = 'TARGET SHELL: QAX\n\nQAX SHELL SYNTAX NOTES:\n- POSIX-style: $VAR, ${VAR}, $(cmd) or `cmd` for command substitution, $((expr)) for arithmetic.\n\nUSER REQUEST:\ncheck if config.json exists';
  const modelOutput = 'QAX SHELL SYNTAX NOTES:\n- POSIX-style: $VAR, ${VAR}, $(cmd) or `cmd` for command substitution, $((expr)) for arithmetic.';
  assert.equal(looksLikePromptEcho(prompt, modelOutput), true);
});

test("does not flag a real generated command as an echo", () => {
  const prompt = "TARGET SHELL: Bash\n\nUSER REQUEST:\nfind all pdfs in downloads";
  const modelOutput = 'find "$HOME/Downloads" -type f -name "*.pdf"';
  assert.equal(looksLikePromptEcho(prompt, modelOutput), false);
});

test("does not flag very short output (avoids false positives on trivial overlaps)", () => {
  const prompt = "TARGET SHELL: Bash\n\nUSER REQUEST:\nshow files";
  assert.equal(looksLikePromptEcho(prompt, "ls"), false);
});
