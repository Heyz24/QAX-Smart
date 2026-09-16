const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeModelOutput } = require("../../dist/core/normalizer");

test("passes through a clean single command unchanged", () => {
  assert.equal(normalizeModelOutput('find . -name "*.pdf"'), 'find . -name "*.pdf"');
});

test("strips a conversational prefix on the first line", () => {
  assert.equal(
    normalizeModelOutput('Sure, here is the command:\nfind . -name "*.pdf"'),
    'find . -name "*.pdf"'
  );
});

test("strips matching markdown fences", () => {
  assert.equal(
    normalizeModelOutput('```bash\nfind . -name "*.pdf"\n```'),
    'find . -name "*.pdf"'
  );
});

test("strips llama.cpp/ollama metadata lines wherever they appear", () => {
  const raw = 'ls -la\ntotal duration: 1.2s\nload duration: 0.3s\nprompt eval count: 12\neval rate: 40 tok/s';
  assert.equal(normalizeModelOutput(raw), "ls -la");
});

test("handles an unterminated fence conservatively (drops opener, keeps content)", () => {
  const raw = '```bash\nfind . -name "*.pdf"';
  assert.equal(normalizeModelOutput(raw), 'find . -name "*.pdf"');
});

test("empty input stays empty", () => {
  assert.equal(normalizeModelOutput(""), "");
});

test("whitespace-only input becomes empty", () => {
  assert.equal(normalizeModelOutput("   \n  \n"), "");
});

test("does not mangle a command that legitimately contains the word 'command'", () => {
  // regression: an overly broad "command:" strip pattern could eat real content
  assert.equal(
    normalizeModelOutput('echo "run this command: ls"'),
    'echo "run this command: ls"'
  );
});
