const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { checkReferencedPaths } = require("../../dist/core/path-sanity");

function makeEnv(cwd, home) {
  return {
    os: "linux",
    shell: "Bash",
    cwd,
    home,
    downloads: path.join(home, "Downloads"),
    documents: path.join(home, "Documents"),
    desktop: path.join(home, "Desktop"),
    username: "user",
  };
}

test("warns when a 'cat'-style command references a file that doesn't exist", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qaxs-path-test-"));
  try {
    const env = makeEnv(dir, dir);
    const warnings = checkReferencedPaths("cat notes.txt", env);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /notes\.txt/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("does NOT warn when the referenced file actually exists", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qaxs-path-test-"));
  try {
    fs.writeFileSync(path.join(dir, "notes.txt"), "hi");
    const env = makeEnv(dir, dir);
    const warnings = checkReferencedPaths("cat notes.txt", env);
    assert.equal(warnings.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("REGRESSION: never warns on mkdir - the whole point is the path doesn't exist yet", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qaxs-path-test-"));
  try {
    const env = makeEnv(dir, dir);
    const warnings = checkReferencedPaths("mkdir brand-new-project-folder", env);
    assert.equal(warnings.length, 0, "mkdir targets are expected to not exist - warning here would be actively wrong");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("REGRESSION: never warns on touch, for the same reason", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qaxs-path-test-"));
  try {
    const env = makeEnv(dir, dir);
    const warnings = checkReferencedPaths("touch brand-new-file.txt", env);
    assert.equal(warnings.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("never warns on a plain, unscoped command (e.g. ls, pwd) - out of scope entirely", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qaxs-path-test-"));
  try {
    const env = makeEnv(dir, dir);
    assert.equal(checkReferencedPaths("ls -la", env).length, 0);
    assert.equal(checkReferencedPaths("pwd", env).length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("skips tokens with wildcards or shell variables - can't resolve those locally without real expansion", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qaxs-path-test-"));
  try {
    const env = makeEnv(dir, dir);
    assert.equal(checkReferencedPaths("cat *.txt", env).length, 0);
    assert.equal(checkReferencedPaths("cat $HOME/notes.txt", env).length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("warns on rm targeting a nonexistent file (a real, useful case - likely means the model hallucinated the filename)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qaxs-path-test-"));
  try {
    const env = makeEnv(dir, dir);
    const warnings = checkReferencedPaths("rm old-report-v2.pdf", env);
    assert.equal(warnings.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("resolves ~/ against the home directory", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qaxs-path-test-"));
  try {
    fs.mkdirSync(path.join(dir, "Documents"));
    fs.writeFileSync(path.join(dir, "Documents", "report.md"), "hi");
    const env = makeEnv(dir, dir);
    assert.equal(checkReferencedPaths("cat ~/Documents/report.md", env).length, 0);
    assert.equal(checkReferencedPaths("cat ~/Documents/missing.md", env).length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
