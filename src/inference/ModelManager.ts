import * as fs from "fs";
import * as path from "path";

export interface ModelInfo {
  path: string;
  present: boolean;
  sizeBytes?: number;
}

const DEFAULT_MODEL_FILENAME = "qwen2.5-coder-0.5b-q8_0.gguf";
const FINETUNED_MODEL_FILENAME = "qaxs-qwen2.5-coder-0.5b-lora-merged-q8_0.gguf";

/**
 * Prefers a fine-tuned QAX-aware model if present (see /training), falls
 * back to the base Qwen2.5-Coder-0.5B. Never downloads anything — model
 * distribution is handled by the installer (spec section 21-22).
 */
export function resolveModelPath(modelsDir: string): ModelInfo {
  const finetuned = path.join(modelsDir, FINETUNED_MODEL_FILENAME);
  if (fs.existsSync(finetuned)) {
    return { path: finetuned, present: true, sizeBytes: fs.statSync(finetuned).size };
  }
  const base = path.join(modelsDir, DEFAULT_MODEL_FILENAME);
  if (fs.existsSync(base)) {
    return { path: base, present: true, sizeBytes: fs.statSync(base).size };
  }
  return { path: base, present: false };
}
