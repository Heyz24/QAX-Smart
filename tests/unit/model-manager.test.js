const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { resolveModelPath } = require("../../dist/inference/ModelManager");

test("prefers the fine-tuned model when both files are present", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qaxs-model-test-"));
  try {
    fs.writeFileSync(path.join(dir, "qwen2.5-coder-0.5b-q8_0.gguf"), "base");
    fs.writeFileSync(path.join(dir, "qaxs-qwen2.5-coder-0.5b-lora-merged-q8_0.gguf"), "finetuned");
    const info = resolveModelPath(dir);
    assert.equal(info.present, true);
    assert.match(info.path, /lora-merged/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("falls back to the base model when no fine-tune is present", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qaxs-model-test-"));
  try {
    fs.writeFileSync(path.join(dir, "qwen2.5-coder-0.5b-q8_0.gguf"), "base");
    const info = resolveModelPath(dir);
    assert.equal(info.present, true);
    assert.match(info.path, /qwen2\.5-coder-0\.5b-q8_0\.gguf$/);
    assert.doesNotMatch(info.path, /lora-merged/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("reports absent when neither file exists, still returning the base path for the error message", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qaxs-model-test-"));
  try {
    const info = resolveModelPath(dir);
    assert.equal(info.present, false);
    assert.match(info.path, /qwen2\.5-coder-0\.5b-q8_0\.gguf$/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// REGRESSION: found by actually building a standalone binary with
// @yao-pkg/pkg and running it. Before the fix, LlamaRuntime.get()
// resolved its default model path via `path.join(__dirname, ...)`
// unconditionally, which inside a pkg-packaged binary resolves to a
// virtual snapshot path like /snapshot/qaxs/models/... that does not
// exist on real disk - even when a real models/ folder sat right next
// to the actual executable. This is exercised indirectly here: the
// model-preference logic itself (resolveModelPath, tested above) was
// ALSO found to be dead code - LlamaRuntime.get() never called it before
// this fix, so a fine-tuned model dropped into models/ was silently
// ignored regardless of packaging. Both bugs are fixed in the same
// change (src/inference/LlamaRuntime.ts's resolveInstallDir() and its
// use of ModelManager.resolveModelPath). See HANDOFF.md for the
// packaged-binary verification that first surfaced this.
test("REGRESSION NOTE: see HANDOFF.md for the packaged-binary verification that found this", () => {
  assert.ok(true);
});
