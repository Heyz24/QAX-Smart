#!/usr/bin/env bash
# installer/linux/build-appimage.sh
#
# Packages the PORTABLE distribution (scripts/build-portable.sh) into an
# AppImage, not a single pkg binary - see HANDOFF.md's "Packaging
# status" section for why pkg was tried and confirmed non-viable for
# this project.
#
# Requires: appimagetool on PATH (https://github.com/AppImage/AppImageKit)
# and dist-portable/linux-x64/ already built via
# `./scripts/build-portable.sh dist-portable/linux-x64`.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PORTABLE_DIR="$ROOT_DIR/dist-portable/linux-x64"
APPDIR="$ROOT_DIR/dist-installers/QAXSmart.AppDir"

if [ ! -d "$PORTABLE_DIR" ]; then
  echo "error: $PORTABLE_DIR not found - run ./scripts/build-portable.sh dist-portable/linux-x64 first" >&2
  exit 1
fi

rm -rf "$APPDIR"
mkdir -p "$APPDIR/usr/lib/qaxs"
# The whole portable folder (launcher, bundled node runtime, node_modules
# with node-llama-cpp's native binary, license files) goes in as-is.
cp -r "$PORTABLE_DIR"/. "$APPDIR/usr/lib/qaxs/"

cat > "$APPDIR/AppRun" << 'EOF'
#!/bin/sh
HERE="$(dirname "$(readlink -f "$0")")"
exec "$HERE/usr/lib/qaxs/qaxs" "$@"
EOF
chmod +x "$APPDIR/AppRun"

cat > "$APPDIR/qaxs.desktop" << 'EOF'
[Desktop Entry]
Name=QAX-Smart
Exec=qaxs
Icon=qaxs
Type=Application
Categories=Utility;
Terminal=true
EOF

# 256x256 terminal-prompt icon (installer/linux/qaxs.png) - replaces the
# empty placeholder that shipped in v0.5.0.
cp "$ROOT_DIR/installer/linux/qaxs.png" "$APPDIR/qaxs.png"

appimagetool "$APPDIR" "$ROOT_DIR/dist-installers/QAX-Smart-x86_64.AppImage"
echo "Built dist-installers/QAX-Smart-x86_64.AppImage"
