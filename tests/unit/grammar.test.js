const test = require("node:test");
const assert = require("node:assert/strict");
const { SINGLE_LINE_COMMAND_GBNF } = require("../../dist/core/grammar");

// These tests call the REAL node-llama-cpp/llama.cpp grammar parser -
// confirmed to work without needing an actual GGUF model file, since
// grammar compilation is independent of any loaded model. This means the
// grammar's syntactic validity is genuinely verified here, not just
// hand-inspected.

test("the shipped grammar is accepted by the real llama.cpp grammar parser", async () => {
  const { getLlama } = await import("node-llama-cpp");
  const llama = await getLlama();
  const grammar = await llama.createGrammar({ grammar: SINGLE_LINE_COMMAND_GBNF });
  assert.ok(grammar.grammar.length > 0);
});

test("REGRESSION: an obviously malformed grammar is rejected by the real parser (proves the check above is meaningful, not a rubber stamp)", async () => {
  const { getLlama } = await import("node-llama-cpp");
  const llama = await getLlama();
  await assert.rejects(
    () => llama.createGrammar({ grammar: "root ::= undefined_rule_reference_xyz\n" }),
    /Failed to parse grammar/
  );
});

test("grammar source forbids newline and backtick characters by construction", () => {
  // Sanity check on the grammar text itself: both restricted characters
  // must appear in a negated character class ([^...]), not as literals
  // the grammar would otherwise accept.
  assert.match(SINGLE_LINE_COMMAND_GBNF, /\[\^[^\]]*\\n[^\]]*\]/);
  assert.match(SINGLE_LINE_COMMAND_GBNF, /\[\^[^\]]*`[^\]]*\]/);
});
