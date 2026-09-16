const test = require("node:test");
const assert = require("node:assert/strict");
const { checkSemanticIntent } = require("../../dist/core/semantic-validator");

test("rejects a PDF request answered with a bare directory listing", () => {
  const r = checkSemanticIntent("find all pdfs in downloads", "dir Downloads");
  assert.equal(r.valid, false);
});

test("accepts a PDF request answered with an actual PDF filter", () => {
  const r = checkSemanticIntent("find all pdfs in downloads", 'find Downloads -name "*.pdf"');
  assert.equal(r.valid, true);
});

test("rejects a process-lookup request with no process-querying command", () => {
  const r = checkSemanticIntent("find the process using port 8080", "echo hello");
  assert.equal(r.valid, false);
});

test("accepts a process-lookup request answered with ps", () => {
  const r = checkSemanticIntent("show all running processes", "ps aux");
  assert.equal(r.valid, true);
});

test("rejects a delete request with no deletion verb in the command", () => {
  const r = checkSemanticIntent("delete the build folder", "ls build");
  assert.equal(r.valid, false);
});

test("does not fire any rule on an unrelated request (no false positive)", () => {
  const r = checkSemanticIntent("show current directory", "pwd");
  assert.equal(r.valid, true);
});
