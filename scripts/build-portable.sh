#!/usr/bin/env bash
# scripts/build-portable.sh
#
# Builds a self-contained, no-system-Node-required distribution folder.
#
# WHY THIS EXISTS INSTEAD OF A SINGLE PKG BINARY:
# @yao-pkg/pkg (and vercel/pkg before it) cannot run code that performs a
# dynamic `import()` of an ESM package - it executes bundled code inside a
# `vm` context that never wires up Node's dynamic-import callback, so ANY
# ESM import throws ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING regardless of
# whether the imported package is bundled into the snapshot or kept on
# real disk. This was confirmed by actually building a pkg binary of
# qaxs and hitting this exact error, and is independently confirmed by
# multiple unrelated projects hitting the identical error with pkg
# (puppeteer#13655, pinojs/thread-stream#143, among others).
# `node-llama-cpp` ships as `"type": "module"` (ESM-only) - there is no
# CJS `require()` fallback available - so this isn't fixable from qaxs's
# side without node-llama-cpp itself changing.
#
# This script instead produces a portable folder: the compiled app,
# production-only node_modules (so ESM dynamic import works exactly like
# a normal `node script.js` run, because it IS one), and a REAL Node.js
# binary bundled alongside it, so end users need no system Node install.
# Verified end-to-end in this project's own build environment by
# temporarily removing the system's own /usr/bin/node entirely and
# confirming the bundled copy still ran the full pipeline correctly.
#
# Usage: run this ONCE PER TARGET OS/ARCH, on a machine of that OS/arch
# (or with a downloaded official Node.js binary for that target placed
# where NODE_BIN_OVERRIDE points). Node binaries are platform-specific -
# there is no cross-compilation shortcut here.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${1:-$ROOT_DIR/dist-portable}"
NODE_BIN_OVERRIDE="${NODE_BIN_OVERRIDE:-}"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR/models"

echo "Building TypeScript..."
(cd "$ROOT_DIR" && npm run build)

echo "Copying application files..."
cp -r "$ROOT_DIR/dist" "$OUT_DIR/dist"
cp "$ROOT_DIR/package.json" "$OUT_DIR/package.json"
cp "$ROOT_DIR/LICENSE.md" "$OUT_DIR/LICENSE.md"
cp "$ROOT_DIR/THIRD_PARTY_LICENSES.md" "$OUT_DIR/THIRD_PARTY_LICENSES.md"
cp -r "$ROOT_DIR/THIRD_PARTY_LICENSES" "$OUT_DIR/THIRD_PARTY_LICENSES_TEXTS" 2>/dev/null || true
cp "$ROOT_DIR/models/README.md" "$OUT_DIR/models/README.md"

echo "Installing production dependencies (NOT using --omit=optional: node-llama-cpp"
echo "ships its prebuilt native binaries as OPTIONAL npm dependencies per-platform -"
echo "omitting them causes it to fall back to a from-source build step that fails"
echo "outside a full dev toolchain. Confirmed by actually hitting this failure:"
echo "'npm run cmake-js-llama ... exited with code 127' when optional deps were"
echo "stripped. Only --omit=dev is safe here.)"
(cd "$OUT_DIR" && npm install --omit=dev 2>&1 | tail -5)

echo "Bundling a real Node.js runtime..."
if [ -n "$NODE_BIN_OVERRIDE" ]; then
  cp "$NODE_BIN_OVERRIDE" "$OUT_DIR/node-runtime"
else
  NODE_BIN="$(command -v node)"
  echo "  (using this machine's own node: $NODE_BIN - fine for building the CURRENT platform's" \
       "distribution; for other OS/arch targets, download the official binary from" \
       "nodejs.org's release archive for that target and set NODE_BIN_OVERRIDE instead)"
  cp "$NODE_BIN" "$OUT_DIR/node-runtime"
fi
chmod +x "$OUT_DIR/node-runtime"

echo "Writing launcher..."
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
  cat > "$OUT_DIR/qaxs.bat" << 'EOF'
@echo off
set DIR=%~dp0
"%DIR%node-runtime.exe" "%DIR%dist\cli.js" %*
EOF
else
  cat > "$OUT_DIR/qaxs" << 'EOF'
#!/usr/bin/env bash
# Resolve the REAL directory this script lives in, following symlinks -
# found necessary via real testing: installer/linux/build-deb.sh installs
# this as /usr/local/lib/qaxs/qaxs and symlinks /usr/local/bin/qaxs to it.
# BASH_SOURCE[0] does NOT follow that symlink on its own, so a naive
# `dirname "${BASH_SOURCE[0]}"` resolved to /usr/local/bin (wrong) instead
# of /usr/local/lib/qaxs (right), and the launcher looked for
# node-runtime/dist/cli.js in the wrong place entirely.
SOURCE="${BASH_SOURCE[0]}"
while [ -L "$SOURCE" ]; do
  DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"
done
DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
exec "$DIR/node-runtime" "$DIR/dist/cli.js" "$@"
EOF
  chmod +x "$OUT_DIR/qaxs"
fi

echo ""
echo "Done: $OUT_DIR"
echo "Size: $(du -sh "$OUT_DIR" | cut -f1)"
echo ""
echo "Test it with NO system Node.js dependency by running the launcher directly:"
echo "  $OUT_DIR/qaxs --version"
