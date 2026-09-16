const test = require("node:test");
const assert = require("node:assert/strict");
const { runPipeline } = require("../../dist/core/engine");
const { BashAdapter } = require("../../dist/shells/BashAdapter");

function makeEnv() {
  return {
    os: "linux",
    shell: "Bash",
    cwd: "/home/user",
    home: "/home/user",
    downloads: "/home/user/Downloads",
    documents: "/home/user/Documents",
    desktop: "/home/user/Desktop",
    username: "user",
  };
}

test("succeeds on the first attempt without retrying when the first output is already valid", async () => {
  let callCount = 0;
  const generateFn = async () => {
    callCount++;
    return 'find "$HOME/Downloads" -type f -name "*.pdf"';
  };
  const env = makeEnv();
  const result = await runPipeline(env, new BashAdapter(env), "find all pdfs in downloads", { generateFn });
  assert.equal(result.outcome.status, "ok");
  assert.equal(result.attempts, 1);
  assert.equal(callCount, 1);
});

test("retries after a garbled first attempt and succeeds on the second", async () => {
  let callCount = 0;
  const generateFn = async () => {
    callCount++;
    if (callCount === 1) {
      return "dir Downloads"; // semantically wrong for a pdf request
    }
    return 'find "$HOME/Downloads" -type f -name "*.pdf"';
  };
  const env = makeEnv();
  const result = await runPipeline(env, new BashAdapter(env), "find all pdfs in downloads", { generateFn });
  assert.equal(result.outcome.status, "ok");
  assert.equal(result.attempts, 2);
  assert.equal(callCount, 2);
});

test("gives up cleanly after maxAttempts consecutive failures, does not retry forever", async () => {
  let callCount = 0;
  const generateFn = async () => {
    callCount++;
    return "dir Downloads";
  };
  const env = makeEnv();
  const result = await runPipeline(env, new BashAdapter(env), "find all pdfs in downloads", {
    generateFn,
    maxAttempts: 3,
  });
  assert.equal(result.outcome.status, "validation_failed");
  assert.equal(result.attempts, 3);
  assert.equal(callCount, 3);
});

test("does NOT retry past a security block - a blocked verdict is a complete, final answer", async () => {
  let callCount = 0;
  const generateFn = async () => {
    callCount++;
    return "rm -rf /";
  };
  const env = makeEnv();
  const result = await runPipeline(env, new BashAdapter(env), "delete everything", {
    generateFn,
    maxAttempts: 3,
  });
  assert.equal(result.outcome.status, "blocked");
  assert.equal(result.attempts, 1);
  assert.equal(callCount, 1, "must not retry after a security block");
});

test("does NOT retry a hard generation error (e.g. missing model) - fails fast on attempt 1", async () => {
  let callCount = 0;
  const generateFn = async () => {
    callCount++;
    throw new Error("Model not found");
  };
  const env = makeEnv();
  const result = await runPipeline(env, new BashAdapter(env), "find all pdfs", {
    generateFn,
    maxAttempts: 3,
  });
  assert.equal(result.outcome.status, "generation_failed");
  assert.equal(callCount, 1, "a hard generation error should not be retried");
});

test("retry attempts receive an escalating repair reminder appended to the prompt", async () => {
  const promptsSeen = [];
  const generateFn = async (prompt) => {
    promptsSeen.push(prompt);
    return promptsSeen.length === 1 ? "dir Downloads" : 'find "$HOME/Downloads" -name "*.pdf"';
  };
  const env = makeEnv();
  await runPipeline(env, new BashAdapter(env), "find all pdfs in downloads", { generateFn });
  assert.equal(promptsSeen.length, 2);
  assert.doesNotMatch(promptsSeen[0], /previous attempt was invalid/);
  assert.match(promptsSeen[1], /previous attempt was invalid/);
});

test("dry-run mode never retries, even with maxAttempts set high", async () => {
  const env = makeEnv();
  const result = await runPipeline(env, new BashAdapter(env), "find pdfs", {
    dryRun: true,
    mockCommand: "dir Downloads",
    maxAttempts: 5,
  });
  assert.equal(result.attempts, 1);
});
