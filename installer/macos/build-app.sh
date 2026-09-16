#!/usr/bin/env bash
# installer/macos/build-app.sh
#
# Packages the PORTABLE distribution (scripts/build-portable.sh) into a
# macOS .app, not a single pkg binary - see HANDOFF.md's "Packaging
# status" section for why pkg was tried and confirmed non-viable for
# this project.
#
# Run on macOS. Requires dist-portable/macos-{x64,arm64}/ already built
# via `./scripts/build-portable.sh dist-portable/macos-<arch>` (run on
# macOS of that arch, or with a downloaded official macOS node binary for
# the other arch passed via NODE_BIN_OVERRIDE).
#
# Produces an unsigned .app; codesign + notarize separately before
# distributing outside your own machine (Gatekeeper will otherwise block
# it) - that requires an Apple Developer account, which is outside what
# this script can do for you.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VERSION="$(node -p "require('$ROOT_DIR/package.json').version")"
ARCH="${1:-arm64}"   # arm64 | x64
PORTABLE_DIR="$ROOT_DIR/dist-portable/macos-$ARCH"
APP_DIR="$ROOT_DIR/dist-installers/QAX-Smart.app"

if [ ! -d "$PORTABLE_DIR" ]; then
  echo "error: $PORTABLE_DIR not found - run ./scripts/build-portable.sh dist-portable/macos-$ARCH first" >&2
  exit 1
fi

rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/Resources/qaxs"

# The whole portable folder (launcher, bundled node runtime,
# node_modules with node-llama-cpp's native binary, license files) goes
# into Resources; Contents/MacOS/qaxs is a thin wrapper so the .app's
# declared CFBundleExecutable can find it via a stable relative path.
cp -r "$PORTABLE_DIR"/. "$APP_DIR/Contents/Resources/qaxs/"

mkdir -p "$APP_DIR/Contents/MacOS"
cat > "$APP_DIR/Contents/MacOS/qaxs" << 'EOF'
#!/usr/bin/env bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../Resources/qaxs" && pwd)"
exec "$DIR/qaxs" "$@"
EOF
chmod +x "$APP_DIR/Contents/MacOS/qaxs"

cat > "$APP_DIR/Contents/Info.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>QAX-Smart</string>
  <key>CFBundleIdentifier</key><string>dev.qax.qaxs</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleExecutable</key><string>qaxs</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
EOF

echo "Built $APP_DIR (unsigned)."
echo "qaxs is a CLI tool, so most users will want the launcher on PATH directly:"
echo "  sudo ln -s \"$APP_DIR/Contents/Resources/qaxs/qaxs\" /usr/local/bin/qaxs"
echo "The .app wrapper above exists mainly so it can carry a signed,"
echo "notarized identity if you choose to distribute it outside a manual install."
