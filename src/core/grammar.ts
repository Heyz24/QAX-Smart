/**
 * Grammar-constrained decoding (GBNF, llama.cpp's native constrained-
 * sampling format). This is a well-established technique for structured
 * LLM output — see llama.cpp's own grammars/README.md and the broader
 * constrained-decoding literature (llguidance, Outlines, XGrammar) — not
 * something invented for this project. What IS specific to qaxs is
 * applying it to shell-command generation: forcing the model's output to
 * be mechanically incapable of containing the exact failure patterns
 * `normalizer.ts`/`extractor.ts` were built to detect after the fact
 * (markdown fences, multi-line "here's the command\n...\nthis does X"
 * output).
 *
 * The key shift this represents: normalizer.ts and extractor.ts are a
 * DETECTION layer — they catch bad output after generation and reject
 * it. This grammar is a PREVENTION layer — the model is sampled
 * token-by-token with the offending tokens masked out, so it becomes
 * structurally impossible to produce a newline or a backtick at all, not
 * just likely to be caught if it does. Both layers stay in place:
 * grammar constraining reduces how often generation-level failures
 * happen; normalizer/extractor/validators/security still run on
 * whatever comes out, because format correctness and semantic/security
 * correctness are independent problems (a grammar-valid single line can
 * still be `rm -rf /`).
 *
 * Verified against the actual installed node-llama-cpp/llama.cpp
 * grammar parser in this project's own build environment — not just
 * hand-written and assumed correct. See tests/unit/grammar.test.js.
 */

/**
 * Forces output to be exactly one line (no \n at all - this alone makes
 * markdown fences and "command on one line, explanation on the next"
 * patterns structurally impossible to produce), with no backtick
 * characters (blocks inline code spans and fence delimiters), and no
 * leading whitespace/tab (blocks indented or padded output).
 *
 * Deliberately does NOT try to constrain which command names are valid -
 * GBNF's alternation doesn't have real word-boundary semantics, so a
 * "must start with a builtin name" rule would need to be far more
 * complex to add real value over what the existing shell/semantic
 * validators already do. This grammar solves FORMAT; the rest of the
 * pipeline still solves CORRECTNESS and SAFETY.
 */
export const SINGLE_LINE_COMMAND_GBNF = [
  "root ::= first rest",
  "first ::= [^ \\t\\n`]",
  "rest ::= [^\\n`]*",
].join("\n") + "\n";
