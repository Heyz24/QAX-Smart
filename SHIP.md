# Shipping QAX-Smart (`qaxs`) — release checklist

This is written for a closed-source, binary-only release under
`LICENSE.md`. Follow it in order; don't skip the model-quality and
license steps just because the build succeeded.

## 0. One-time setup (do this before your first release)

- [ ] Get the base model working end to end on your own machine — this
      sandbox can't reach Hugging Face, so this is the first thing only
      you can do. Follow `models/README.md`.
- [ ] Decide whether v0.1.0 ships with the base Qwen2.5-Coder-0.5B or
      waits for the fine-tune in `training/qaxs_finetune.ipynb`. Given
      QAX has zero pretraining exposure, I'd expect the base model to
      get QAX syntax wrong often enough that shipping it un-fine-tuned
      undersells the "QAX" part of QAX-Smart — but only your own eval
      numbers (section 6 of the notebook) can actually tell you that.
- [ ] Register/confirm you have: an Apple Developer account (macOS
      notarization), a code-signing certificate if you want Windows
      SmartScreen to stop flagging the installer (optional but improves
      trust — unsigned `.exe` installers still work, just warn harder).

## 1. Lock in the version

```
cd qaxs
./scripts/bump-version.sh minor "first shippable build: core pipeline + <base|fine-tuned> model"
```

This updates `package.json`, `VERSION`, and inserts a CHANGELOG.md
section for you to fill in properly. Review the diff before committing.

## 2. Build and smoke-test the TypeScript layer

```
npm install
npm run build
npm link              # sanity-check it behaves as a real global command
qaxs --dry-run 'echo test' "test"
node tests/daemon-smoke.js
npm unlink -g qaxs     # remove the dev link before packaging real binaries
```

If you changed anything in `src/shells/QAXAdapter.ts` or added a new
shell, also regenerate the dataset and re-check `training/` is still in
sync (see HANDOFF.md's "Extending to a new shell" section).

## 3. Get the model file(s) in place

```
models/qwen2.5-coder-0.5b-q8_0.gguf                          # required
models/qaxs-qwen2.5-coder-0.5b-lora-merged-q8_0.gguf         # optional, if fine-tuned
```

Run the eval cell in `training/qaxs_finetune.ipynb` one more time against
whatever GGUF you're about to ship — not the one you trained three
iterations ago.

## 4. Build the portable distribution (one per OS/arch)

**Do not use `pkg`/`@yao-pkg/pkg` for this** — confirmed non-viable for
this project (see `HANDOFF.md`'s packaging section for the full story):
`node-llama-cpp` is ESM-only, and `pkg` cannot run code that dynamically
`import()`s an ESM package under any configuration — it's a documented,
external limitation of `pkg` itself (other unrelated projects hit the
identical `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING` error), not something
fixable from qaxs's side.

Use the portable-folder build instead — verified end-to-end, including
with the target machine's own system Node.js binary genuinely removed
during testing (see `tests/portable-build-smoke.sh`):

```
./scripts/build-portable.sh dist-portable/linux-x64   # run ON that OS/arch
```

Run this once per target OS/arch, on a real machine of that OS/arch (Node
binaries aren't cross-compilable here — for a target you can't build on
directly, download the official Node.js binary for that platform from
nodejs.org's release archive and pass it via `NODE_BIN_OVERRIDE`).

For each resulting folder: run `tests/portable-build-smoke.sh`-equivalent
checks on that machine — confirm `qaxs --version` and a real generation
request both work with that machine's own system Node absent, exactly as
verified in this project's own build environment.

## 5. Build the installers

| OS | Command | Needs |
|---|---|---|
| Windows | `installer/windows/qaxs-installer.nsi` | Windows machine or NSIS+Wine, `dist-portable/win-x64/` folder present |
| Linux (.deb) | `./installer/linux/build-deb.sh` | `dpkg-deb` (confirmed available on standard Ubuntu/Debian), `dist-portable/linux-x64/` folder present |
| Linux (Snap) | `snapcraft` from `installer/linux/snap/` | snapcraft installed, Ubuntu/LXD/multipass |
| Linux (AppImage) | `./installer/linux/build-appimage.sh` | `appimagetool` on PATH |
| macOS | `./installer/macos/build-app.sh arm64` (and again with `x64`) | must run on macOS |

All five now package the **portable-folder distribution** (`dist-portable/<target>/`,
produced by `scripts/build-portable.sh` — see step 4), not a single pkg
binary. The `.deb`/AppImage/Snap/NSIS/macOS scripts were updated
accordingly; `dpkg-deb` and the full `.deb` build were verified for real
in this project's own build environment. AppImage/Snap/NSIS/macOS still
need verification on their actual target platforms (no Windows/macOS/
snapcraft available in that environment) — see `installer/README.md`.

## 6. License files

The portable build (`scripts/build-portable.sh`) already copies
`LICENSE.md` and `THIRD_PARTY_LICENSES.md` into the distribution folder
automatically — this used to be a manual, easy-to-forget step when the
plan was a single pkg binary; it no longer is, since the license files
are ordinary files sitting right next to `qaxs` in the same folder each
installer now packages. Confirm they're present in your built
`dist-portable/<target>/` folder before packaging, as a final check:

```
ls dist-portable/<target>/LICENSE.md dist-portable/<target>/THIRD_PARTY_LICENSES.md
```

Apache 2.0 in particular requires you retain the license text and note
that the shipped model is a fine-tuned derivative if you ship the LoRA
merge rather than the stock weights — a line in your download page or
about screen is enough.

## 7. Codesign + notarize macOS (if distributing outside your own machine)

```
codesign --deep --force --sign "Developer ID Application: <Your Name>" dist-installers/QAX-Smart.app
xcrun notarytool submit dist-installers/QAX-Smart.app.zip --apple-id ... --team-id ... --wait
xcrun stapler staple dist-installers/QAX-Smart.app
```

Skip this only if every recipient can right-click → Open through
Gatekeeper's warning themselves — fine for your own testing, not fine
for a public release.

## 8. Where to actually host downloads

Given the closed-source, binary-only license, GitHub Releases works
fine for distributing compiled binaries even from a private (or public,
binaries-only) repo — GitHub doesn't require the repo contents to be
open source, just that *whatever you push* is what gets served. Your
existing QAX website/CMS project is the more natural long-term home if
you want download pages with proper QAX branding instead of a bare
GitHub Releases page — that's a separate task from this one, not part
of qaxs itself.

## 9. Tag and record the release

```
git tag v0.1.0
git push --tags
```

Update CHANGELOG.md's `[0.1.0]` section (already inserted by the bump
script) with what you actually shipped, including which model file
(base vs. fine-tuned) went out — this matters for diagnosing user
reports later ("which qaxs are they even running").

## 10. After shipping — what to actually watch

- Real user requests that fail semantic/security validation are the
  best raw material for the next `training/generate_dataset.py` pass —
  if `--debug` output shows a pattern of the same rejection, that's a
  new template to add, not just a one-off bug.
- Track daemon memory usage in the wild — the "load once per shell
  session" design (see HANDOFF.md) trades a bit of memory for isolation
  and clean teardown; if that trade-off feels wrong once real usage
  data comes in, that's the place to revisit, not the pipeline logic.
