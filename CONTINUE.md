# qaxs — continue-here brief for a new chat

Paste this whole file as your first message in a new conversation
(along with the unzipped project, or just this file if the assistant
already has the project in its working directory) to resume work with
full context, without re-deriving everything from scratch.

## What this project is

QAX-Smart (`qaxs`): an offline natural-language → shell-command compiler
for QAX (a custom shell), Bash, Zsh, PowerShell, and CMD. Built against
`SPEC.md`, a full product specification. Uses Qwen2.5-Coder-0.5B via
llama.cpp/`node-llama-cpp`, always requires explicit user confirmation
before executing anything the model generates, and is designed to be
fully offline, stateless, and security-first.

## Current version: 0.5.0

Read these three files first, in this order, before doing anything else:
1. **`HANDOFF.md`** — what's actually built, tested, and verified vs.
   what's scaffolded. This is the most important file in the repo for
   picking up work correctly. It documents several real bugs found via
   testing on real hardware (not hypothetical) and explains WHY certain
   architectural decisions were made (e.g. why packaging uses a portable
   Node.js bundle instead of a single `pkg` binary — `pkg` is confirmed,
   not assumed, to be incompatible with this project's ESM-only native
   dependency).
2. **`CHANGELOG.md`** — line-by-line history of every fix and feature,
   in QAX's own documentation convention. Shows exactly what shipped in
   each version and why.
3. **`SHIP.md`** — the release checklist, if the next task is getting
   closer to an actual public release rather than more development.

## Ground rules this project has been built under (keep following them)

- **Test everything you claim, don't assume.** Every fix in this
  project's history was verified with a real, runnable test — TS tests
  via `node --test tests/unit/*.test.js`, Python cross-checks in
  `tests/`, or (for packaging) actually building and running real
  artifacts (a real `.deb` installed via `dpkg -i`, a real AppImage
  built with `appimagetool`, a real pkg binary that proved pkg doesn't
  work). If you can't test something in your environment, say so
  explicitly rather than presenting it as verified — this project's
  documentation is careful about that distinction throughout, and it
  should stay that way.
- **Validate library/API claims against real, current sources** —
  package APIs drift. This project caught real, non-obvious breaking
  changes this way (trl's `max_seq_length` -> `max_length` rename, which
  doesn't even error, it silently misbehaves; llama.cpp's Makefile build
  being fully replaced by CMake). Check PyPI metadata, actual installed
  `node_modules/*/dist/*.d.ts` files, or clone-and-build the real repo
  rather than trusting training-data memory for anything version-
  sensitive.
- **Run the full regression suite before considering anything done**:
  ```
  npm install && npm run build
  node --test tests/unit/*.test.js          # should show 80 passing
  node tests/daemon-smoke.js
  python3 tests/check_qax_syntax_consistency.py
  python3 tests/test_notebook_logic.py
  python3 tests/verify_notebook_dependencies.py
  ```
- **Never claim a GPU-dependent result you haven't run.** No sandbox
  this project has been built in has had GPU or Hugging Face access.
  The fine-tuning notebook (`training/qaxs_finetune.ipynb`) has been
  validated line-by-line (syntax, API correctness, dependency
  compatibility) but never actually executed. If the next session has
  real GPU access and runs it, that's the first time real fine-tuning
  results will exist for this project — treat that as a big deal worth
  documenting carefully in `HANDOFF.md`, not a routine update.

## What's genuinely done and tested (as of 0.5.0)

- Full pipeline (env resolve -> prompt -> normalize -> extract ->
  validate -> security -> confirm -> execute), 80 passing TS tests.
- A session-scoped daemon that keeps the model resident and auto-unloads
  when the parent shell exits — real lifecycle-tested.
- Four independent reliability features: grammar-constrained decoding
  (verified against the real llama.cpp parser), few-shot prompting,
  a retry/self-repair ladder, and local path-sanity warnings.
- Real Windows bugs found and fixed (shell misdetection, a cmd.exe
  quoting crash) with permanent regression tests.
- Packaging: a portable Node.js-bundle distribution (proven — system
  Node physically removed during testing and it still worked), a real
  `.deb` built and installed via `dpkg -i`, a real AppImage built and
  run. NSIS and Snap scripts are updated to the same pattern but unbuilt
  (need Windows/Ubuntu-with-snapcraft respectively).
- A closed-source `LICENSE.md` plus `THIRD_PARTY_LICENSES.md` covering
  the Apache 2.0 (Qwen model) and MIT (llama.cpp, node-llama-cpp,
  commander) obligations that come with bundling those dependencies.

## What's NOT done — pick up here

In roughly the order they'd naturally come up:

1. **Run the actual fine-tune.** Requires a real Colab GPU session and
   Hugging Face access (this sandbox has had neither). Steps are in
   `training/qaxs_finetune.ipynb` itself — get the base model running
   first (`models/README.md`), look at real `--debug` output, decide if
   the fine-tune is even necessary before investing GPU time.
2. **Build and test the Windows NSIS installer** on an actual Windows
   machine, and the **Snap package** on a real Ubuntu box or CI runner.
3. **Wire up CI** (GitHub Actions matrix: windows-latest, macos-latest,
   ubuntu-latest) so all five packaging targets get built and
   smoke-tested automatically per tagged release — `installer/README.md`
   suggests this explicitly as the next step.
4. **Replace the placeholder AppImage icon** (`qaxs.png` is currently an
   empty file) with a real one.
5. **Codesign + notarize the macOS `.app`** once it's actually built —
   requires an Apple Developer account.
6. Consider whether any of the four reliability features need real-model
   tuning once actual generations are available (e.g., is 3 retry
   attempts the right number? Does the grammar need loosening or
   tightening once you see real base-model output against it?).

## If the person just says "continue" with no other context

Read `HANDOFF.md` fully, run the regression suite above to confirm
nothing broke since the last session, then pick the highest-value item
from the "what's NOT done" list above — almost certainly either (1)
running the real fine-tune if GPU access is available, or (3) CI wiring
if it isn't.
