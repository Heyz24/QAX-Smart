# QAX-Smart (`qaxs`) — Handoff Notes

This is the "how it's built and why" document, in the same spirit as
QAX's own HANDOFF.md. Read `SPEC.md` first for the product requirements —
this file is about the engineering decisions made while implementing them,
and what to check before extending anything.

## What's real vs. what's scaffolded (as of v0.2.0)

**Real and tested in this environment:**
- The full non-execution pipeline: env resolver → prompt builder →
  normalizer → extractor → shell validator → semantic validator →
  security policy. Exercised via 51 automated regression tests
  (`tests/unit/*.test.js`, run with `node --test`) plus manual adversarial
  `--dry-run` checks. Three real bugs were found and fixed this way (a
  regex-precedence bug in the directory-creation rule, the missing `[`
  builtin, and rejected function-definition syntax) — none hypothetical,
  all caught by tests actually failing.
- **A real Windows production bug, fixed and regression-tested.** Running
  on actual Windows 11 cmd.exe surfaced a shell-misdetection bug
  (PSModulePath is set even in cmd.exe) that, combined with cmd.exe's
  quoting behavior, crashed a PowerShell subprocess. Fixed at two levels
  (real parent-process detection via `tasklist`, plus a shell-agnostic
  unmatched-quote rejection in the extractor) and covered by
  `tests/unit/cli-windows-quoting-regression.test.js`, which reproduces
  the exact argv shape cmd.exe produced, deterministically, on any OS.
- The session daemon's process lifecycle: spawns on first use, responds
  over a socket, and detects when its parent shell process dies and
  unloads the model + deletes its socket within one poll interval. See
  `tests/daemon-smoke.js` (rewritten to be cross-platform after an
  earlier version depended on the Unix `sleep` binary and broke on
  Windows).
- `qaxs` as an actual global command via `npm link`, verified on both
  Linux (this environment) and real Windows (per user testing).
- The dataset generator (`training/generate_dataset.py`) — runs, produces
  valid JSONL, syntax cross-checked against QAXAdapter.ts automatically
  (`tests/check_qax_syntax_consistency.py`).
- **The training notebook's GPU-independent logic**, tested live against
  the actual notebook file (`tests/test_notebook_logic.py` re-extracts
  and executes the prompt-building and semantic-eval code straight from
  `qaxs_finetune.ipynb` on every run — it can't silently go stale
  relative to notebook edits the way a separately-maintained copy could).
- **The training notebook's external dependencies, validated against
  live sources, not assumptions** (`tests/verify_notebook_dependencies.py`
  plus manual verification this session): confirmed via PyPI metadata
  that `unsloth` is real and current, and that its declared trl
  compatibility range postdates several breaking trl API changes the
  notebook now correctly accounts for (`processing_class` instead of the
  removed `tokenizer` kwarg, `max_length` instead of the silently-ignored
  `max_seq_length`). Confirmed by actually cloning `ggml-org/llama.cpp`
  in this environment and building `llama-quantize` from source that its
  Makefile build was removed and replaced by CMake — the notebook's
  original `make llama-quantize` command would have failed outright.

**Scaffolded but NOT run against a real model in this environment**,
because this sandbox's network allowlist doesn't include Hugging Face
(only npm/pypi/github domains are reachable), and it has no GPU:
- Actual generation quality from Qwen2.5-Coder-0.5B, base or fine-tuned —
  one real data point exists (the base model echoing the QAX syntax hint
  back verbatim instead of generating a command, observed on real
  Windows hardware), which is exactly the kind of failure fine-tuning is
  meant to fix, but the fine-tune itself hasn't been run yet.
- The Colab fine-tuning notebook's actual training/eval/export cells —
  every line has been syntax-checked, and every external API call and
  build command has been verified against real current documentation or
  by actually running the equivalent command where possible (see above),
  but the GPU-dependent training loop itself has not executed end to end.
- Any real latency/benchmark numbers (spec section 19/29).

**Do this first on your machine**, in order:
1. `npm install` (pulls `node-llama-cpp`'s prebuilt native binary for
   your platform).
2. Download `Qwen2.5-Coder-0.5B-Instruct-Q8_0.gguf` and place it at
   `models/qwen2.5-coder-0.5b-q8_0.gguf` (see `models/README.md`).
3. `npm run build && npm link`, then try `qaxs "list files in downloads"`
   for real and see what the base model actually produces — this tells
   you how much the fine-tune in `training/` actually needs to fix.
4. Run `node tests/daemon-smoke.js` again — this time the "generate" step
   should succeed instead of returning "Model not found".
5. Run the full regression suite (`node --test tests/unit/*.test.js`,
   `python3 tests/check_qax_syntax_consistency.py`,
   `python3 tests/test_notebook_logic.py`) on your own machine too —
   it's cheap insurance against anything that behaves differently
   outside this sandbox.

## Why a per-session daemon instead of one long-lived service

The spec's non-goals explicitly rule out anything resembling persistent
state or a background assistant. A single system-wide daemon would need
either (a) a way to know when to unload state per-session, which reduces
to reimplementing per-session daemons anyway, or (b) accepting that state
silently outlives the shell that created it, which is the thing that was
explicitly asked to be avoided ("as soon as shell or exit is run all
previous data is deleted and the model is offloaded"). Scoping the socket
path to the parent shell's pid gets both requirements for free: isolation
between terminals, and automatic cleanup tied to something the OS already
tracks (process liveness) rather than something qaxs would have to invent.

Trade-off: opening two terminals means two resident models if both are
used. On a 0.5B Q8 model this is a few hundred MB each, judged acceptable
against the alternative of building session tracking on top of a shared
daemon. Revisit if the model size grows.

## Why generation is stateless per-call even though the model stays loaded

`LlamaChatSession` accumulates conversation history if reused across
`.prompt()` calls. `LlamaRuntime.generate()` deliberately creates a new
context sequence + chat session per call and disposes it afterward — only
the model weights and the llama.cpp context (the expensive parts) persist.
This matches spec section 3 ("stateless", "no persistent AI memory")
without sacrificing the load-once performance requirement in section 18.
If you ever change this to reuse a session for a performance win, you are
reintroducing exactly the persistent-memory behavior the spec forbids —
don't, without re-reading section 3 and 30 (non-goals) first.

## QAXAdapter syntax rules — where they came from

`src/shells/QAXAdapter.ts`'s `UNSUPPORTED_SYNTAX` list and `QAX_BUILTINS`
set are taken directly from the QAX v3.0.0 user manual's "Feature scope"
section (what QAX deliberately does NOT support) and the built-in command
tables in sections 5 and 10. If QAX gains a feature (e.g. `case/esac`
gets added in a future QAX version), this file — and the corresponding
line in `training/generate_dataset.py`'s doc comment — need to be updated
together, or the fine-tuned model and the validator will disagree with
each other about what's valid.

## The reliability layer (v0.4.0)

Four independent techniques, each targeting a different failure mode
observed or predicted in real testing. They're independent by design —
disabling any one doesn't break the others, and each is tested in
isolation:

1. **Grammar-constrained decoding** (`src/core/grammar.ts`) — prevents
   FORMAT failures (markdown fences, multi-line output) by construction.
   Verified against the real llama.cpp grammar parser.
2. **Few-shot examples** (`src/core/prompt.ts`) — improves the model's
   odds of following QAX's unfamiliar syntax in the first place, directly
   motivated by the real prompt-echo bug found earlier.
3. **Retry/self-repair ladder** (`src/core/engine.ts`) — catches what
   grammar constraints structurally cannot: a well-formatted command that
   doesn't match the request. Never retries past a security block or a
   hard generation error — see its doc comment for why both would be
   actively wrong to retry.
4. **Local path-sanity warnings** (`src/core/path-sanity.ts`) — a cheap,
   local, non-blocking check for hallucinated filenames, deliberately
   scoped to a narrow command allowlist after an early draft would have
   falsely warned on `mkdir`/`touch` (see its doc comment).

None of these were added speculatively — each has either a citation to
an established technique (grammar constraints: llama.cpp's own GBNF
docs; few-shot prompting: standard in-context-learning practice) or a
direct link to a real bug found in this project's own testing (the
prompt-echo motivating few-shot examples; the mkdir false-positive
caught while building path-sanity). If you add a fifth technique here,
hold it to the same bar: verify it against a real source or a real
observed failure before shipping it, not just because it sounds
plausible.

## Extending to a new shell

1. Add the shell to `ShellName` in `src/core/types.ts`.
2. Implement a new adapter extending `BaseShellAdapter`
   (`src/shells/ShellAdapter.ts`) — `detect()`, `validateCommand()`,
   `execute()`.
3. Wire it into `buildAdapter()` in `src/cli.ts` and `detectShell()`'s
   normalization map in `src/core/shell-detect.ts`.
4. Add a `SHELL_CONFIG` entry + a handful of templates to
   `training/generate_dataset.py` so the fine-tune actually sees examples
   for it — a new adapter with zero training examples will validate
   correctly-formatted garbage just as readily as correct output.

## Packaging status

**Major finding this project went through: single-binary packaging via
`pkg`/`@yao-pkg/pkg` does not work for qaxs, confirmed by actually
building one.** `node-llama-cpp` is ESM-only (`"type": "module"` in its
package.json, no CJS entry point at all). `pkg` runs bundled code inside
a `vm` execution context that never wires up Node's dynamic-import
callback, so any `import()` of an ESM package — regardless of whether
it's bundled into the snapshot or referenced from real disk — throws
`ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`. This is not speculative: an
actual pkg binary of qaxs was built in this project and hit exactly this
error, and a web search turned up multiple unrelated projects (Puppeteer,
pinojs/thread-stream, webpack-cli, others) hitting the identical error
with pkg for the identical underlying reason. There is no configuration
flag or workaround for this — it's a structural gap in how pkg executes
code, not a qaxs bug.

**The fix: `scripts/build-portable.sh`**, which produces a folder
containing the compiled app, real production `node_modules` (so ESM
dynamic import behaves exactly like an ordinary `node script.js`
invocation, because it is one), a bundled Node.js binary, and a launcher
script. This achieves the spec's actual goal (end users need no system
Node.js installation) through a different, legitimate mechanism.

This was verified rigorously, not just built and eyeballed:
- `tests/portable-build-smoke.sh` builds the real distribution, then
  **physically moves the build machine's own `/usr/bin/node` out of the
  way** (not a PATH manipulation — the file itself is temporarily
  relocated) and confirms the bundled copy still runs the full pipeline,
  including a real native-module load that gets far enough to attempt
  parsing a placeholder GGUF file — proving the actual llama.cpp native
  binary loaded and executed correctly with zero system Node.js present.
- **A real `.deb` package was built and installed.** `dpkg -i` was run
  for real in this project's own Ubuntu environment, `qaxs` was
  confirmed to resolve on PATH through the symlink dpkg creates
  (`/usr/local/bin/qaxs -> /usr/local/lib/qaxs/qaxs`), the full pipeline
  was exercised with system Node absent, and the package was cleanly
  removed with `dpkg --remove qaxs` afterward.
- This install cycle caught a real bug: the launcher's original
  `dirname "${BASH_SOURCE[0]}"` doesn't follow symlinks, so invoking it
  through dpkg's symlink looked for sibling files in the wrong
  directory. Fixed to resolve through symlinks first, and
  `tests/portable-build-smoke.sh` now has a dedicated check for exactly
  this invocation path so it can't silently regress.
- **A real AppImage was also built and run.** `appimagetool` was
  downloaded and (since this sandbox has no FUSE) extracted with
  `--appimage-extract` and run directly from the extracted `AppRun` —
  it built a genuine `.AppImage` from the portable folder, which was
  then confirmed to actually execute (`--appimage-extract-and-run
  --version` printed the correct version).

`installer/windows/qaxs-installer.nsi`, `installer/linux/snap/
snapcraft.yaml`, `installer/linux/build-appimage.sh`, and
`installer/macos/build-app.sh` have all been updated to package the
portable folder (following `build-deb.sh`'s proven pattern) rather than
the old single-pkg-binary plan. NSIS and Snap still need their
respective platform tooling (a Windows machine or NSIS+Wine; a real
Ubuntu/multipass/LXD environment for `snapcraft`, which is itself
distributed as a snap and needs `snapd`) to actually build and test —
neither is available in this sandbox. See `installer/README.md`'s
status table for the current per-target picture: 3 of 5 targets
(portable folder, `.deb`, AppImage) are genuinely verified end-to-end;
NSIS and Snap are updated-but-unbuilt, which is real remaining work but
a smaller, more mechanical task now that the underlying distribution
model itself is proven, not an open question about whether it'll work
at all.
