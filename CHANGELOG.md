# Changelog

All notable changes to QAX-Smart (`qaxs`) are recorded here, line by line,
following the same convention as QAX's own CHANGELOG.md. Versions follow
semver: **MAJOR.MINOR.PATCH**.

- MAJOR: breaking changes to the CLI surface, the daemon protocol, or the
  on-disk model/dataset format.
- MINOR: new capability (a new shell adapter, a new semantic rule, a new
  packaging target) that's backward compatible.
- PATCH: bug fixes, prompt/dataset tweaks, security-rule additions.

Use `scripts/bump-version.sh <patch|minor|major>` to bump — it updates
`package.json`, `VERSION`, and inserts a dated section header here so this
file never falls out of sync with what actually shipped.

---

## [Unreleased]

- **Real AppImage icon** (`installer/linux/qaxs.png`, a 256x256
  terminal-prompt glyph generated with Pillow) replaces the empty
  placeholder file `build-appimage.sh` used to `touch` into existence —
  item 4 on the remaining-work list. Verified for real, not just wired
  up: rebuilt the portable folder and the AppImage from scratch,
  confirmed `appimagetool` accepts the icon with no new warnings,
  extracted the built `.AppImage` and confirmed the embedded
  `qaxs.png` is a genuine 2548-byte 256x256 RGBA PNG (not the old
  0-byte file), and confirmed `--appimage-extract-and-run --version`
  still returns `0.5.0`.

- **GitHub Actions CI wired up** (`.github/workflows/ci.yml`,
  `.github/workflows/release.yml`), per `installer/README.md`'s
  "Suggested next step".
  - `ci.yml` runs the exact regression suite documented above (build +
    80 unit tests + daemon smoke test + all 3 Python checks) on every
    push/PR, matrixed across Node 20.x and 22.x. Also exposed as a
    reusable workflow (`workflow_call`) so `release.yml` can gate on it.
  - `release.yml` builds and smoke-tests all 5 packaging targets on
    real per-OS runners, triggered on `v*` tags. Before writing it,
    re-verified the 3 already-proven targets are still good on this
    machine: rebuilt the portable folder, reran the full
    `tests/portable-build-smoke.sh` (system Node physically removed,
    all 4 checks passed), rebuilt and reinstalled the `.deb` via a real
    `dpkg -i`/`dpkg --remove` cycle, and rebuilt the AppImage
    (downloaded `appimagetool`, extracted it since neither this sandbox
    nor typical CI runners have FUSE, ran it, confirmed
    `--appimage-extract-and-run --version` returns `0.5.0`) — nothing
    regressed since v0.5.0.
  - Also exercised `installer/macos/build-app.sh`'s shell logic for the
    first time (it's plain bash with no macOS-only commands): built a
    real `.app` bundle structure against a stand-in portable folder,
    confirmed the `Info.plist` is well-formed and the
    `Contents/MacOS/qaxs` wrapper correctly resolves
    `../Resources/qaxs` and returns the right version. This is *not* a
    substitute for running on real macOS (only the bundle-assembly
    logic was exercised, not real Mach-O execution or Gatekeeper
    behavior) but it's real verification of the one part that could be
    verified here.
  - **Honesty note, matching how NSIS/Snap are already flagged
    elsewhere in this file**: the `nsis` and `snap` jobs in
    `release.yml` are written to the same proven pattern as the
    already-verified `deb`/`appimage` jobs (`snapcore/action-build`
    genuinely resolves the snapd/LXD blocker noted in the v0.5.0 entry
    below — that's a real fix, not a workaround) but have **not** been
    run on an actual GitHub Actions runner — no Windows machine or
    snapd/LXD environment was available to do that from. Their first
    real run on a tag push is the actual verification, the same way
    the `.deb` job's `dpkg -i` was first proven for real.
  - One real bug caught before it could fail in CI: `makensis` does
    **not** create its `OutFile`'s target directory (confirmed via
    NSIS's own bug tracker/forums — it fails with "Can't open output
    file" on a missing dir), unlike the other 4 packaging scripts which
    all `mkdir -p` their own `dist-installers/`. Added the missing
    `mkdir -p` as a workflow step rather than editing the `.nsi` script
    itself (out of scope for this change).
  - Action versions (`actions/checkout@v7`, `actions/setup-node@v7`,
    `actions/setup-python@v6`, `actions/upload-artifact@v7`,
    `actions/download-artifact@v8`) and runner labels
    (`macos-15-intel` rather than the now-retired `macos-13`) checked
    against current GitHub sources as of 2026-09-14, not assumed from
    training data — GitHub removed the Node 20 actions runtime on
    2026-09-16, two days after this was written, so anything pinned to
    older majors would start failing almost immediately.
  - Validated both workflow files with `actionlint` v1.7.11 (a real
    GitHub Actions static checker, not just a YAML parser) — 0 issues.

## [0.5.0] — Remaining installers updated; AppImage built and run for real

- `installer/windows/qaxs-installer.nsi`, `installer/linux/snap/
  snapcraft.yaml`, `installer/linux/build-appimage.sh`, and
  `installer/macos/build-app.sh` all updated to package the portable
  distribution (following `installer/linux/build-deb.sh`'s
  already-proven pattern), replacing stale references to the
  single-pkg-binary plan that v0.3.0 confirmed nonviable.
- **AppImage packaging verified for real, not just updated**: downloaded
  `appimagetool`, worked around this sandbox's lack of FUSE by using
  `--appimage-extract` and running the extracted `AppRun` directly, built
  a genuine `.AppImage` from the portable folder, and confirmed it
  actually executes (`--appimage-extract-and-run --version` printed the
  correct version).
- Windows NSIS and Linux Snap remain updated-but-unbuilt — both need
  platform tooling unavailable in this sandbox (a Windows machine or
  NSIS+Wine; a real Ubuntu/multipass/LXD environment for `snapcraft`,
  which is itself distributed as a snap requiring `snapd`). Documented
  honestly in `installer/README.md`'s status table: 3 of 5 packaging
  targets are now genuinely verified end-to-end (portable folder,
  `.deb`, AppImage); 2 of 5 (NSIS, Snap) are correctly updated but
  unbuilt.

## [0.4.0] — Reliability features: grammar constraints, few-shot prompting, retry ladder, path warnings

Researched what's actually proven to improve small-LLM structured-output
reliability (not assumed) before building anything — see each item's
citation below.

- **Grammar-constrained decoding** (`src/core/grammar.ts`, wired into
  `LlamaRuntime.generate()`). A well-established technique (llama.cpp's
  own GBNF grammar system; see its `grammars/README.md`) that replaces
  probabilistic format compliance with a formal guarantee: the model is
  sampled so it is structurally incapable of producing a newline or
  backtick character, eliminating markdown-fence and multi-line-
  explanation failures by construction rather than relying solely on
  `normalizer.ts`/`extractor.ts` catching them after the fact. **Verified
  against the real, installed llama.cpp grammar parser in this project's
  own build environment** (no GGUF model needed for that — grammar
  compilation is independent of any loaded model) — including confirming
  the validation is meaningful by feeding it a deliberately malformed
  grammar and watching it get correctly rejected. 3 tests
  (`tests/unit/grammar.test.js`) call the real parser, not a mock.
- **Few-shot examples in the prompt** (`src/core/prompt.ts`). Shortened
  the abstract QAX syntax bullet-list — which is literally the text the
  base model was observed echoing back verbatim in real testing (see
  `prompt-echo.ts`) — and replaced most of it with 3 concrete
  request→command examples. In-context examples are better-evidenced
  than abstract rule descriptions for small models following an
  unfamiliar format. The notebook's mirrored copy was kept in sync, and
  `tests/test_notebook_logic.py` now has a dedicated parity check that
  fails if the two ever drift. 6 new tests
  (`tests/unit/prompt.test.js` + notebook parity).
- **Retry / self-repair ladder** (`src/core/engine.ts`). Grammar
  constraints solve format; they can't fix a well-formatted command that
  doesn't match the request. Up to 3 attempts now run, with an
  escalating reminder appended to the prompt on retry — but the ladder
  **never retries past a security block** (a "blocked" verdict is a
  complete, correct answer — retrying would just be fishing for a way
  around it) and **never retries a hard generation error** (a missing
  model file fails identically every time; retrying only adds latency).
  Fully unit-tested via dependency injection with mock generators — 7
  tests (`tests/unit/retry-ladder.test.js`) covering retry-then-succeed,
  give-up-after-max-attempts, no-retry-on-block, and no-retry-on-hard-
  error, all without needing a real model.
- **Local path-sanity warnings** (`src/core/path-sanity.ts`, wired into
  `cli.ts`). A cheap, purely local, non-blocking check: warns (never
  blocks) when a command references a specific file that doesn't appear
  to exist — catching the model hallucinating a filename. Deliberately
  scoped to a narrow allowlist of "consumption" commands (`cat`, `cd`,
  `rm`, `open`, etc.) after catching a real bug in my own first draft: an
  unscoped version would have falsely warned on `mkdir newproject`,
  since the entire point of `mkdir`/`touch` is that the path doesn't
  exist yet. 8 tests (`tests/unit/path-sanity.test.js`) using a real
  temp filesystem, including that exact regression case.
- `cli.ts`'s `--debug` output now also reports total attempt count.

Total test count: 51 → 80 TypeScript tests, plus the existing Python
cross-checks, all passing.

## [0.3.0] — Packaging model fixed: pkg confirmed nonviable, portable build verified for real

- **Major finding:** single-binary packaging via `pkg`/`@yao-pkg/pkg`
  does not work for qaxs. `node-llama-cpp` is ESM-only, and `pkg`
  cannot run any code that dynamically `import()`s an ESM package —
  confirmed by actually building a pkg binary and hitting
  `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`, and independently confirmed
  via multiple unrelated projects (Puppeteer, pinojs/thread-stream,
  webpack-cli) hitting the identical error with pkg. This is a
  structural pkg limitation, not fixable from qaxs's side.
- **Added `scripts/build-portable.sh`**: the correct replacement —
  compiled app + real production `node_modules` + a bundled Node.js
  runtime + a launcher script. Achieves the spec's "no Node.js install
  required" goal through a mechanism that actually works with an
  ESM-only native dependency.
- **Verified rigorously**: `tests/portable-build-smoke.sh` builds the
  real distribution and physically moves the build machine's own
  `node` binary out of the way (not a PATH trick) to confirm the
  bundled copy runs the full pipeline independently, including a real
  native-module load that gets far enough to attempt parsing a
  placeholder GGUF file.
- **A real `.deb` package was built, installed via `dpkg -i`, tested
  with system Node genuinely absent, and cleanly removed** in this
  project's own Ubuntu environment — the most thoroughly verified
  packaging target in this project.
- **Fixed a real bug found via that install**: the portable launcher's
  `dirname "${BASH_SOURCE[0]}"` doesn't follow symlinks, so invoking it
  through the symlink `dpkg` creates at `/usr/local/bin/qaxs` looked
  for sibling files in the wrong directory. Fixed, and
  `tests/portable-build-smoke.sh` now has a dedicated symlink-invocation
  regression check.
- **Fixed:** `ModelManager.ts`'s fine-tuned-model preference logic
  (documented in `models/README.md`) was dead code — `LlamaRuntime.get()`
  never actually called it, so a fine-tuned GGUF dropped into `models/`
  was silently ignored regardless of packaging. Now wired up correctly
  and covered by `tests/unit/model-manager.test.js`.
- **Fixed:** default model path resolution used `__dirname` unconditionally,
  which resolves to a nonexistent virtual path inside a pkg snapshot —
  found while diagnosing the pkg investigation above. Now resolves
  relative to the real executable location when packaged (detected via
  the actual `process.pkg` marker, not an `fs.existsSync` heuristic,
  which was itself found to be unreliable since pkg's virtual filesystem
  shim makes snapshot paths falsely report as existing).
- Verified every `node-llama-cpp` call in `LlamaRuntime.ts` against the
  actual installed package's type definitions; fixed one un-awaited
  `dispose()` call found this way.
- `installer/linux/build-deb.sh` and `installer/linux/debian/postinst`
  updated to package the portable folder instead of a single binary.
  `installer/windows`, `installer/linux/snap`, `installer/linux/build-
  appimage.sh`, and `installer/macos` still reflect the old plan and
  need the same update — see `installer/README.md`'s status table.
- Removed the `@yao-pkg/pkg` devDependency — confirmed nonviable for
  this project, kept out to avoid misleading future contributors.

## [0.2.1] — node-llama-cpp API verified against the real installed package

- Verified every `node-llama-cpp` call in `src/inference/LlamaRuntime.ts`
  (`getLlama`, `loadModel`, `createContext`, `getSequence`,
  `LlamaChatSession` construction, `.prompt()`, and all three `dispose()`
  calls) directly against the actual installed package's TypeScript
  type definitions, not against memory or docs alone.
- **Fixed:** `LlamaContextSequence.dispose()` returns a `Promise<void>`
  and was being called without `await` in the per-request cleanup path —
  harmless in practice for qaxs's one-request-at-a-time usage, but a
  latent race if that ever changed. Now properly awaited.
- Confirmed `getSequence()` is synchronous (returns `LlamaContextSequence`
  directly, not a Promise) — the existing code was already correct here,
  now verified rather than assumed.

## [0.2.0] — Real-world Windows fixes + verified training pipeline

Bugs found via actual Windows testing (cmd.exe, Windows 11):
- **Fixed:** shell misdetection — `PSModulePath` is set by Windows even
  inside plain cmd.exe (not exclusive to PowerShell), so qaxs was
  silently treating cmd.exe sessions as PowerShell. Windows shell
  detection now queries the real parent process via `tasklist` instead.
- **Fixed:** a cmd.exe quoting mismatch (`'foo'` isn't grouped by
  cmd.exe the way it is in bash/PowerShell/QAX) combined with the above
  to route a malformed argv fragment into PowerShell's parser and crash
  it. The extractor now rejects any command starting with an unmatched
  quote character, shell-agnostically, before any adapter sees it —
  verified this doesn't false-positive on legitimate strings like
  `echo "it's fine"`.
- **Fixed:** the background daemon opened a visible console window on
  Windows (`windowsHide: true` was missing from its spawn options).
- **Fixed:** `tests/daemon-smoke.js` depended on the Unix `sleep` binary
  and POSIX-only process-group signals; rewritten to be fully
  cross-platform.
- **Added:** a content-free "please wait" indicator during the first
  model load in a session, so a slow (not hung) first request is never
  mistaken for a crash — never violates the "no internal processing
  shown" rule since it carries no information about what's happening.
- **Added:** prompt-echo detection — the base (pre-fine-tune) model was
  observed regurgitating the QAX syntax-hint block instead of generating
  a command; this is now caught and reported as a distinct, clear
  failure rather than confusing "unable to extract" noise.

Bugs found via the new regression test suite (51 TS tests + Python
cross-checks, none related to the Windows session above):
- **Fixed:** a regex-precedence bug in the directory-creation semantic
  rule (`\bfolder|directory\b` instead of `\b(folder|directory)\b`)
  caused every request merely containing the word "directory" to be
  wrongly flagged, regardless of a create/make verb.
- **Fixed:** QAXAdapter rejected the documented `[ EXPR ]` test-bracket
  shorthand (manual section 10.1) because `"["` was missing from its
  builtins set.
- **Fixed:** QAXAdapter rejected QAX's own documented `name() { ... }`
  function-definition syntax because the first-word sanity check didn't
  recognize that shape.

Training pipeline validated against real, current external sources
(not assumptions) — see `tests/verify_notebook_dependencies.py` and
`tests/test_notebook_logic.py`:
- **Fixed:** a Python f-string syntax error in the notebook's eval cell
  (backslash inside an f-string expression).
- **Fixed:** the same directory-creation regex bug, ported and fixed in
  the notebook's eval rules to keep runtime and eval-time correctness
  checks in sync (verified via a parity test running identical cases
  through both the TS validator and the notebook's Python port).
- **Fixed:** the llama.cpp clone URL (`ggerganov/llama.cpp` transferred
  to `ggml-org/llama.cpp` in Feb 2025 — old URL still redirects, but the
  canonical one is now used).
- **Fixed:** the GGUF quantization step used `make -j GGML_CUDA=0
  llama-quantize`, but llama.cpp's Makefile build was removed entirely
  and replaced by CMake (confirmed by actually cloning and building it
  in this environment — the old command fails immediately with a clear
  "replaced by CMake" error). Now uses the correct `cmake -B build && 
  cmake --build build --target llama-quantize` sequence, and the
  resulting binary path (`build/bin/llama-quantize`) is corrected
  everywhere it's referenced.
- **Fixed:** trl API drift — `SFTTrainer(tokenizer=...)` was renamed to
  `processing_class=...` (old name fully removed in trl 0.16.0+), and
  `dataset_text_field`/`max_seq_length` must live inside `SFTConfig`,
  not as direct `SFTTrainer` kwargs. `max_seq_length` itself was further
  renamed to `max_length` in trl 0.20.0 — critically, the old name isn't
  even an error there, it's silently ignored (confirmed via a real user
  report of stagnant training loss traced to exactly this). Verified the
  fix against unsloth's actual declared trl compatibility range
  (`trl>=0.18.2,<=0.24.0`, confirmed via PyPI metadata), which postdates
  all of the above renames.
- Confirmed via PyPI metadata: `unsloth` is a real, actively-maintained
  package (verified latest version at time of writing). Confirmed via
  web search: `unsloth/Qwen2.5-Coder-0.5B-Instruct` is a real, used base
  model on Hugging Face; Qwen2.5-Coder-0.5B-Instruct is Apache 2.0.
- **New test files:** `tests/unit/*.test.js` (51 cases: normalizer,
  extractor, security, semantic validator, QAXAdapter, shell detection,
  a direct end-to-end regression reproducing the exact Windows argv bug),
  `tests/check_qax_syntax_consistency.py` (keeps the dataset generator
  and QAXAdapter's syntax rules from silently drifting apart),
  `tests/test_notebook_logic.py` (tests the notebook's GPU-independent
  logic live, extracted fresh from the notebook file on every run),
  `tests/verify_notebook_dependencies.py` (checks training dependencies
  against live PyPI metadata rather than hardcoded assumptions).

### Still explicitly unverified (requires a GPU + your own hardware)
- Actual LoRA training convergence and generation quality — nothing in
  this sandbox can run the GPU-dependent cells (no GPU, no Hugging Face
  network access here). Everything GPU-independent in the notebook
  (prompt construction, eval-rule logic, the build commands for
  llama.cpp, the exact library API calls) has been verified for real;
  the training run itself has not, and can't be until you run it in
  Colab. See `models/README.md` and the fine-tuning walkthrough for
  what to check once you do.

## [0.1.0] — Phase 1–3 core pipeline

- Initial project scaffold per `SPEC.md` (full build specification).
- Environment resolver, shell detector (QAX/PowerShell/CMD/Bash/Zsh),
  fixed prompt builder with a QAX-specific syntax hint block.
- Output normalizer: strips conversational prefixes, markdown fences, and
  llama.cpp/ollama inference-metadata lines (`total duration:`, etc.)
  without touching command content.
- Command extractor: rejects on multi-line/ambiguous output rather than
  guessing (spec section 11).
- Deterministic semantic validator: PDF search, recursive search, process
  lookup, port lookup, directory creation, file deletion intent checks.
- Deterministic security policy: three-tier (critical/high/medium) rule
  set covering destructive deletes, disk/partition operations, privilege
  escalation, credential access, remote-payload execution, encoded
  payloads, security-control tampering, and destructive redirection.
- Shell adapters: QAXAdapter (validated directly against the QAX v3.0.0
  user manual's documented syntax — rejects `[[ ]]`, `(( ))` as a
  standalone command, `case/esac`, brace ranges, and bash's
  `function name {}` spelling, none of which QAX supports), plus
  Bash/Zsh/PowerShell/CMD adapters.
- CLI: `qaxs "<request>"`, `qaxs help`, `qaxs --version`/`-v`,
  `qaxs stop`/`qaxs exit`, `--shell`, `--debug`, `--yes`, `--dry-run`
  (dry-run bypasses inference entirely for pipeline testing).
- Session daemon (`src/daemon`): model loaded once and kept resident for
  the lifetime of the shell session that started it. The daemon watches
  its parent shell's pid and unloads the model + deletes its socket the
  moment that shell exits; also self-terminates after 15 minutes idle as
  a safety net. `qaxs stop`/`qaxs exit` tears it down immediately.
  Each generation call is stateless — a fresh session/sequence is created
  and discarded per request; no conversation history persists.
- `npm link`-installable as a genuine global `qaxs` command
  (package.json `bin` field).
- Dataset generator (`training/generate_dataset.py`) producing
  shell/os/request/command JSONL, built from verified QAX v3.0.0 syntax.
- Colab fine-tuning notebook (`training/qaxs_finetune.ipynb`) — LoRA on
  Qwen2.5-Coder-0.5B, GGUF export.

### Known gaps at this version (tracked, not yet closed)
- No real GGUF model has been run against this pipeline yet in this
  environment (network-restricted sandbox; download and first real
  inference run happens on your machine — see `models/README.md`).
- Persistent-daemon mode is a per-shell-session daemon, not yet a single
  long-lived system service shared across all sessions (spec section 18
  allows either; this is the safer default given the "nothing outlives
  the session" requirement).
- Cross-OS installers (`.msi`, `.deb`, `.snap`, AppImage, `.app`) are
  scaffolded as build-ready configs but not yet built+tested on their
  target OSes — see `installer/README.md`.
- Hardware backend auto-detection (CUDA/ROCm/Metal/Vulkan) is not yet
  implemented; `node-llama-cpp` currently uses its own default backend
  selection.
