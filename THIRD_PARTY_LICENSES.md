# Third-Party Licenses

QAX-Smart's LICENSE.md governs QAX-Smart's own code and binary. It does
NOT — and legally cannot — relicense the third-party components below.
Each remains under its own original license, and each of those licenses
requires you to keep this notice (or an equivalent one) with the
software. Do not strip this file from a shipped build.

## Qwen2.5-Coder-0.5B-Instruct (the language model)

- License: **Apache License 2.0**
- Copyright: Alibaba Cloud / the Qwen team
- Source: https://huggingface.co/Qwen/Qwen2.5-Coder-0.5B-Instruct
- Apache 2.0 permits closed-source commercial redistribution, INCLUDING
  of a fine-tuned derivative (the QAX-specific LoRA fine-tune shipped as
  `qaxs-qwen2.5-coder-0.5b-lora-merged-q8_0.gguf` is a derivative work),
  provided you:
  1. Include a copy of the Apache 2.0 license text (see
     `THIRD_PARTY_LICENSES/apache-2.0.txt`).
  2. Retain this attribution notice.
  3. State that changes were made if distributing a modified version —
     the fine-tune counts; a short note like "fine-tuned from
     Qwen2.5-Coder-0.5B-Instruct for QAX shell command generation" in
     your model README/about screen satisfies this.
- No NOTICE file was published alongside the base model as of this
  writing; if Qwen publishes one later, check whether new attribution
  text needs to be added here.

## llama.cpp (inference engine, statically/dynamically linked via node-llama-cpp)

- License: **MIT**
- Copyright: Georgi Gerganov and contributors
- Source: https://github.com/ggerganov/llama.cpp
- MIT requires retaining the copyright notice and license text
  (see `THIRD_PARTY_LICENSES/mit-llama-cpp.txt`) in copies/substantial
  portions of the software — satisfied by shipping this file.

## node-llama-cpp (Node.js bindings)

- License: **MIT**
- Copyright: node-llama-cpp contributors (withcatai)
- Source: https://github.com/withcatai/node-llama-cpp
- Same MIT terms as above.

## commander.js (CLI argument parsing)

- License: **MIT**
- Copyright: TJ Holowaychuk and contributors
- Source: https://github.com/tj/commander.js

## Node.js runtime (if bundled into a standalone binary via pkg/SEA)

- License: **MIT** (Node.js itself; some bundled components under other
  permissive licenses — see Node.js's own `LICENSE` file, which the
  packaging step should carry forward if the runtime is embedded).

---

**Action item before your first public release**: run `npm run
build` then check `node_modules/.package-lock.json` or `npm ls
--all` for the full transitive dependency tree, since minor-version
bumps can add new transitive dependencies with their own licenses.
This file lists direct dependencies as of v0.1.0 — regenerate/review it
whenever `package-lock.json` changes materially (a `license-checker`
npm package can automate this).
