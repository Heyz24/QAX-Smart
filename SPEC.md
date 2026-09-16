# QAX-Smart (`qaxs`) — Full Build Specification

> Kept verbatim in-repo (as supplied) so implementation and spec never
> drift without a visible diff. See `HANDOFF.md` for what's actually
> implemented/tested vs. scaffolded as of the current version, and
> `CHANGELOG.md` for what shipped when.

You are building **QAX-Smart**, a tiny, fast, offline, cross-platform AI command generator.

Do not turn this into a chatbot. The product is a **natural-language → shell-command compiler**.

## 1. Product

**Name:** QAX-Smart
**Global command:** `qaxs`

Examples:

```
qaxs "find all pdfs in my downloads"
qaxs "show files larger than 1GB"
qaxs "create a folder called projects"
qaxs "find the process using port 8080"
```

The application should:
1. Detect the user's OS and current shell.
2. Collect minimal runtime environment information.
3. Pass the request + hidden environment context to the local model.
4. Generate exactly one shell command.
5. Normalize/extract the command.
6. Validate it.
7. Run deterministic security checks.
8. Show the command to the user.
9. Ask `Execute? [Y/n]`.
10. Execute only after explicit confirmation.

The user should never see the internal AI prompt, environment variables,
model metadata, inference statistics, or internal processing.

## 2. Important distinction

**QAX** is the shell/interpreter. **QAX-Smart** (`qaxs`) is the AI
command-generation layer. QAX must be treated as a first-class shell, not
converted through CMD or PowerShell. Supported shells: QAX, PowerShell,
CMD, Bash, Zsh — architecture must allow more to be added later.

## 3. Core philosophy

Offline, fast, stateless, small, cross-platform, deterministic around
execution, security-first, simple, native-feeling. No cloud API, no web
search, no persistent AI memory, no unnecessary UI, no chatbot
conversation. The model is an **untrusted command generator** — never
`model output → shell` directly. Pipeline:

```
USER REQUEST → ENVIRONMENT RESOLVER → SHELL DETECTION → FIXED PROMPT →
LOCAL QWEN MODEL → RAW OUTPUT → NORMALIZER → EXTRACTOR → SHELL VALIDATOR
→ SEMANTIC VALIDATOR → SECURITY POLICY → USER CONFIRMATION →
SHELL ADAPTER → EXECUTION
```

## 4. Model

Qwen2.5-Coder-0.5B, Q8_0 GGUF, via llama.cpp, fully local. No Ollama, no
Python/Node/CUDA/ROCm requirement for the end user. Distributed as a
standalone native executable.

## 5–7. Runtime architecture, shell adapters, environment context

TypeScript/JS main application; `ShellAdapter` interface implemented per
shell; shell detection happens **before** inference, never delegated to
the model. Environment context (OS, shell, cwd, home, downloads,
documents, desktop, username) is generated on demand, never persisted,
never displayed, never used to justify scanning the whole filesystem.

## 8. Prompt

One fixed developer-controlled prompt; only runtime variables and the
user's request change. Never shown to the user. (See `src/core/prompt.ts`
for the exact text in use.)

## 9–12. Model output is hostile; normalization; extraction; one-command rule

Model output must be treated as untrusted/possibly malformed. Normalizer
must be conservative (no giant blind regex). Extraction must reject
rather than guess on ambiguity. Exactly one command is the normal
contract; a pipeline counts as one command; independent multi-line output
should normally be rejected — but chaining via `;`/`&&`/`||`/newline
inside legitimate shell syntax must not be blindly split on.

## 13–14. Shell-specific and semantic validation

Validation must understand the target shell (no one-size-fits-all regex).
Syntax validity isn't enough — lightweight deterministic semantic checks
for common intents (PDF search, recursive search, process lookup, port
lookup, directory creation, file deletion). No LLM judge initially. When
semantic validation can't confidently establish correctness, don't
execute.

## 15. Security layer

Independent of the model, deterministic, cannot be bypassed by it. Blocks
recursive deletion, deleting system directories, disk formatting,
partition manipulation, destructive disk commands, privilege escalation,
credential extraction, suspicious remote downloads, executing downloaded
payloads, encoded payload execution, disabling security controls,
dangerous registry/system modifications, destructive redirections, shell
injection/chaining, commands targeting critical OS locations. Runs after
generation, before confirmation.

## 16–17. Confirmation and execution

`Execute? [Y/n]` — only real user input controls execution, never the
model. Execution always goes through the detected shell's adapter, never
a bare `exec(modelOutput)`. Capture stdout/stderr/exit code; no chatbot
explanations layered on top.

## 18–19. Inference runtime and performance

Do NOT spawn a fresh `llama-cli` process per command — load the model
once, keep it resident, serve many requests. Optimize for low latency:
short prompt, short output, low max tokens, low temperature, native
llama.cpp integration, hardware acceleration where available, minimal
IPC, avoid unnecessary filesystem work / model context. Benchmark cold
startup, warm startup, model load, prompt processing, generation,
extraction, validation, total latency.

## 20. Fine-tuning

Base model eventually fine-tuned via LoRA/QLoRA for: natural-language
request → exactly one shell command, across Bash/Zsh/PowerShell/CMD/QAX,
Windows/Linux/macOS, filesystem/process/networking/git/archive/env-var/
developer-workflow operations. Dataset uses placeholders (`{HOME}`,
`{DOWNLOADS}`, `{DOCUMENTS}`, `{DESKTOP}`, `{CWD}`), never real
user-specific paths — injected at runtime. Fine-tuning improves
reliability/formatting; it does NOT replace validation or security.

## 21–24. Packaging, model packaging, hardware/backend selection, installation

Standalone binaries for Windows x64, Linux x64, macOS x64/ARM64 (ARM64
Linux potentially later); no system Node install required. GGUF model is
a static asset, not rebuilt when app code changes. Detect available
hardware/backend at install/runtime (CPU/CUDA/ROCm/Metal/Vulkan), don't
assume an integrated GPU has dedicated VRAM. Installer adds `qaxs` to
PATH so it runs from any terminal; no external package manager mandatory.

## 25–27. CLI UX, error handling, debug mode

Feels like a native shell utility — never prints internal
model/tokens/prompt/OS/shell/inference/latency/context info by default.
Fixed user-facing error strings for generation/extraction/validation/
security failures. A `--debug` mode (developer-only) may reveal internal
state; normal mode hides all of it.

## 28–29. Testing and benchmarking

Automated suite covering generation-formatting edge cases, shell
correctness, semantic correctness, security (dangerous commands must
never reach execution), and regressions from observed base-model
failures. Offline benchmark harness comparing base vs. fine-tuned model
and different inference settings.

## 30. Non-goals

Not a chatbot, not general-purpose, not RAG/cloud/multi-agent/
persistent-memory/terminal-replacement, and never auto-executes without
confirmation.

## 31. Development order

Phase 1 (core) → Phase 2 (output pipeline) → Phase 3 (execution) →
Phase 4 (performance/persistent runtime) → Phase 5 (distribution) →
Phase 6 (model fine-tuning). See `CHANGELOG.md` for what's landed.

## 32–33. Engineering judgment and final architecture

Don't blindly follow the model, and don't blindly follow this spec either
if a technically superior implementation is identified — but preserve
the product requirements, especially: an incorrect or malicious model
output must never be able to directly execute.
