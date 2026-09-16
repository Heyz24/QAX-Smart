/**
 * Small, tiny-parameter-count models occasionally treat a long instruction
 * block as text to continue rather than an instruction to follow, and
 * echo a chunk of the prompt back verbatim (observed in real testing with
 * the un-fine-tuned Qwen2.5-Coder-0.5B base model against the QAX syntax
 * hint block). This is a distinguishable failure mode worth catching
 * explicitly rather than feeding it through normalize/extract and getting
 * a confusing "unable to extract" for an unrelated-looking reason.
 *
 * Heuristic: take a meaningful prefix of the model's (normalized) output
 * and check whether that exact text appears verbatim inside the prompt
 * we sent. A real generated command essentially never does — commands
 * don't repeat the instruction wording.
 */
export function looksLikePromptEcho(prompt: string, modelOutput: string): boolean {
  const trimmed = modelOutput.trim();
  if (trimmed.length < 20) return false;

  const probeLength = Math.min(40, trimmed.length);
  const probe = trimmed.slice(0, probeLength);

  return prompt.includes(probe);
}
