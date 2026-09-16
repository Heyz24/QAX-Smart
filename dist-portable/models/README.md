# models/

qaxs is offline-first and will never download a model automatically
(spec section 3). Put the GGUF file(s) here yourself:

## Base model (required)

```
models/qwen2.5-coder-0.5b-q8_0.gguf
```

Download `Qwen2.5-Coder-0.5B-Instruct` in GGUF Q8_0 quantization from
Hugging Face (search "Qwen2.5-Coder-0.5B-Instruct-GGUF") and place it
here under exactly that filename. This sandbox's network allowlist
doesn't include Hugging Face, so this step has to happen on your machine.

## Fine-tuned model (optional, preferred when present)

```
models/qaxs-qwen2.5-coder-0.5b-lora-merged-q8_0.gguf
```

Produced by `training/qaxs_finetune.ipynb` (merge LoRA adapter into base
weights, then export/quantize to GGUF Q8_0 — the notebook's last cell
does this). `src/inference/ModelManager.ts` prefers this file over the
base model automatically if it's present, so you can drop it in without
touching any code.

## Verifying the model works before shipping anything

```
npm run build && npm link
qaxs "find all pdfs in downloads"
qaxs --debug "find the process using port 8080"   # --debug shows the raw prompt/output for inspection
node tests/daemon-smoke.js                          # should now show a successful generation, not "Model not found"
```

Compare base-model output against `training/qaxs_dataset.eval.jsonl`
(the held-out split from the dataset generator) before deciding whether
the fine-tune is actually needed for your accuracy bar, and again after
fine-tuning to measure the improvement — that comparison is the whole
point of `training/qaxs_finetune.ipynb`'s eval cell.
