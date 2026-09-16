const test = require("node:test");
const assert = require("node:assert/strict");
const { QAXAdapter } = require("../../dist/shells/QAXAdapter");

function makeAdapter() {
  return new QAXAdapter({
    os: "linux",
    shell: "QAX",
    cwd: "/home/user",
    home: "/home/user",
    downloads: "/home/user/Downloads",
    documents: "/home/user/Documents",
    desktop: "/home/user/Desktop",
    username: "user",
  });
}

test("accepts documented QAX built-ins", () => {
  const a = makeAdapter();
  assert.equal(a.validateCommand('find "$HOME/Downloads" -type f -name "*.pdf"').valid, true);
  assert.equal(a.validateCommand("mkdir -p projects").valid, true);
  assert.equal(a.validateCommand("[ -f config.json ]").valid, true);
});

test("rejects [[ ]] extended test syntax (QAX does not support it per manual)", () => {
  const a = makeAdapter();
  const r = a.validateCommand("[[ -f config.json ]] && echo found");
  assert.equal(r.valid, false);
  assert.match(r.reason, /\[\[/);
});

test("rejects (( )) as a standalone arithmetic command", () => {
  const a = makeAdapter();
  const r = a.validateCommand("(( x = 1 + 2 ))");
  assert.equal(r.valid, false);
});

test("accepts $((...)) arithmetic EXPANSION inside another command (this is supported)", () => {
  const a = makeAdapter();
  const r = a.validateCommand("echo $((1 + 2))");
  assert.equal(r.valid, true);
});

test("rejects bash's 'function name {}' spelling", () => {
  const a = makeAdapter();
  const r = a.validateCommand('function greet { echo "hi"; }');
  assert.equal(r.valid, false);
});

test("accepts QAX's own name() {} function form", () => {
  const a = makeAdapter();
  const r = a.validateCommand('greet() { echo "hi $1"; }');
  assert.equal(r.valid, true);
});

test("rejects brace ranges", () => {
  const a = makeAdapter();
  const r = a.validateCommand("echo {1..5}");
  assert.equal(r.valid, false);
});

test("rejects case/esac", () => {
  const a = makeAdapter();
  const r = a.validateCommand('case "$x" in a) echo A;; esac');
  assert.equal(r.valid, false);
});

test("rejects a command whose first token isn't a builtin or plausible program name", () => {
  const a = makeAdapter();
  const r = a.validateCommand("'echo hello");
  assert.equal(r.valid, false);
});
