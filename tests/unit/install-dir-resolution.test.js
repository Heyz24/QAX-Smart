const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { resolveInstallDir } = require("../../dist/inference/LlamaRuntime");

test("in normal (non-packaged) execution, resolves to the project root via __dirname", () => {
  const dir = resolveInstallDir();
  // Should be the qaxs project root - package.json lives there.
  const fs = require("fs");
  assert.ok(fs.existsSync(path.join(dir, "package.json")),
    `expected ${dir} to contain package.json (dev-mode resolution)`);
});

// REGRESSION: found by actually building a standalone binary with
// @yao-pkg/pkg and running it against a simulated real install layout
// (binary + sibling models/ folder in a fresh temp directory, NOT the
// build tree). Before the fix, this resolved to a virtual pkg snapshot
// path (/snapshot/qaxs/...) that doesn't exist on real disk, even though
// a real models/ folder sat right next to the actual executable - an
// fs.existsSync()-based packaging check was fooled because pkg's virtual
// filesystem shim makes snapshot paths report as "existing" too. Fixed
// by checking the real `process.pkg` marker instead. This test simulates
// the packaged case without needing an actual pkg binary, by directly
// setting the marker pkg itself sets.
test("REGRESSION: when process.pkg marker is present, resolves next to the real executable, not __dirname", () => {
  const originalPkg = process.pkg;
  const originalExecPath = process.execPath;
  try {
    process.pkg = { entrypoint: "fake" };
    Object.defineProperty(process, "execPath", { value: "/opt/qaxs/qaxs", configurable: true });
    // Force re-resolution by clearing any cached require of the module -
    // resolveInstallDir() itself is stateless per-call, so a fresh call
    // is enough without needing to bust require's cache.
    const dir = resolveInstallDir();
    assert.equal(dir, "/opt/qaxs", `expected the packaged-binary path to resolve to /opt/qaxs, got ${dir}`);
  } finally {
    process.pkg = originalPkg;
    Object.defineProperty(process, "execPath", { value: originalExecPath, configurable: true });
  }
});
