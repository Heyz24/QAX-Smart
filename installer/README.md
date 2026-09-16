# Packaging status

## Step 0: build the portable distribution (NOT a single pkg binary)

**`@yao-pkg/pkg` (and vercel/pkg before it) was tried and confirmed
non-viable for this project.** `node-llama-cpp` ships as `"type":
"module"` (ESM-only, no CJS fallback), and `pkg` executes bundled code
inside a `vm` context that never wires up Node's dynamic-import
callback — so any dynamic `import()` of an ESM package throws
`ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`, regardless of whether that
package is bundled into the snapshot or kept external on disk. This
isn't a guess: an actual pkg binary of qaxs was built and hit this exact
error, and it's independently confirmed by several unrelated projects
hitting the identical error with pkg (puppeteer#13655,
pinojs/thread-stream#143, among others). See `HANDOFF.md`'s packaging
section for the full investigation.

Use `scripts/build-portable.sh` instead. It produces a folder containing
the compiled app, production `node_modules` (so ESM dynamic import works
exactly like a normal `node script.js` run — because it is one), a real
bundled Node.js runtime binary, and a launcher script:

```
./scripts/build-portable.sh dist-portable/linux-x64    # run ON that OS/arch
```

**Verified rigorously**: `tests/portable-build-smoke.sh` builds the real
distribution, then **physically moves the system's own `node` binary out
of the way** (not a PATH trick) and confirms the bundled copy still runs
the full pipeline, including a real native-module load that gets far
enough to attempt parsing a placeholder GGUF file, and includes a
dedicated symlink-invocation check (see below).

Run `build-portable.sh` once per target OS/arch, on a real machine of
that OS/arch — Node binaries aren't cross-compilable here. For a target
you can't build on directly, download the official Node.js binary for
that platform from nodejs.org's release archive and pass it via
`NODE_BIN_OVERRIDE`.

**One real bug this testing found and fixed**: the launcher script
originally used `dirname "${BASH_SOURCE[0]}"` directly, which does not
follow symlinks. This broke the moment the `.deb` installer symlinked
`/usr/local/bin/qaxs` to the real launcher elsewhere. Fixed to resolve
through symlinks first; `tests/portable-build-smoke.sh` now includes a
dedicated symlink-invocation check so this can't silently regress.

## Per-target status (all five updated to package the portable folder)

| Target | Status |
|---|---|
| Portable folder (any OS, manual launch) | **Verified for real** — built, system Node physically removed, full pipeline confirmed working |
| Linux `.deb` | **Verified for real** — built with `dpkg-deb`, installed via `dpkg -i`, tested with system Node removed, cleanly uninstalled with `dpkg --remove` |
| Linux AppImage | **Verified for real** — built a real AppImage with `appimagetool` (extracted and run directly, since this sandbox has no FUSE), confirmed the resulting `.AppImage` runs (`--appimage-extract-and-run --version` returned the correct version), and now embeds a real 256x256 icon instead of the old empty placeholder |
| Windows NSIS `.exe` | Script updated to package the portable folder (`installer/windows/qaxs-installer.nsi`); **not yet built or tested** — needs an actual Windows machine or NSIS+Wine, neither available in this sandbox |
| Linux Snap | Script updated to package the portable folder (`installer/linux/snap/snapcraft.yaml`); **not yet built or tested** — needs `snapcraft` itself, which isn't installable in this sandbox |
| macOS `.app` | Script updated to package the portable folder (`installer/macos/build-app.sh`); **not yet built or tested** — must run on actual macOS hardware, which this sandbox doesn't have |

Three of five are now genuinely verified end-to-end (portable folder,
`.deb`, AppImage). The remaining two (NSIS, Snap) are updated to the
same proven pattern as `build-deb.sh`/`build-appimage.sh` but need their
respective platform tooling to actually build and test — that's real
remaining work, not a rewrite of anything.

## Windows (`.msi`-equivalent via NSIS)

`installer/windows/qaxs-installer.nsi`. Build with `makensis` on Windows
(or cross-compiled via `mono` + `makensis` on Linux, untested here).
Produces a `.exe` installer, not a `.msi` — NSIS is the pragmatic
choice for PATH-registration logic matching what QAX's own installer
does; switch to WiX if an actual `.msi` is a hard requirement.

## Linux — Snap

`installer/linux/snap/snapcraft.yaml`. Build with `snapcraft` (needs
either a real Ubuntu/multipass/LXD environment or the snapcraft snap
itself — neither available in this sandbox: `snapcraft` itself is
distributed as a snap, which needs `snapd`, which needs a real or
namespace-capable Linux kernel setup this container doesn't have).
Publishing to the Snap Store additionally requires a registered
developer account.

## Linux — AppImage

`installer/linux/build-appimage.sh`. Needs `appimagetool` (downloadable
from GitHub releases — confirmed reachable and working in this sandbox
once extracted with `--appimage-extract`, since FUSE itself isn't
available here to run it the normal way). Uses a real 256x256 icon at
`installer/linux/qaxs.png` (a terminal-prompt glyph) — replaces the
empty placeholder file that shipped through v0.5.0.

## macOS — `.app`

`installer/macos/build-app.sh`. Must run ON macOS (uses macOS-specific
bundle conventions). Unsigned by default — Gatekeeper will block it on
any machine other than the one that built it until you codesign +
notarize with an Apple Developer account, which this script cannot do
for you.

## CI

Done: `.github/workflows/ci.yml` (build + full regression suite, every
push/PR) and `.github/workflows/release.yml` (all 5 packaging targets,
matrixed across real `windows-latest` / `macos-latest` / `macos-15-intel`
/ `ubuntu-latest` runners, triggered on `v*` tags). See the
`[Unreleased]` entry in `CHANGELOG.md` for exactly what was and wasn't
re-verified before this was wired up.

The `deb`, `appimage`, and `macos-app` (bundle-assembly logic only) jobs
mirror steps already proven for real on this machine. The `nsis` and
`snap` jobs are written but **not yet run on a real GitHub Actions
runner** — no Windows machine or snapd/LXD environment was available to
do that from here. Their first real tag-push run is the actual
verification; watch it closely.
