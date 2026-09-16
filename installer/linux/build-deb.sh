#!/usr/bin/env bash
# installer/linux/build-deb.sh
#
# Packages the PORTABLE distribution (scripts/build-portable.sh) into a
# .deb, not a single pkg binary - @yao-pkg/pkg was confirmed non-viable
# for this project (node-llama-cpp is ESM-only; pkg cannot dynamically
# import ESM code under any configuration). See HANDOFF.md for the full
# story and SHIP.md section 4.
#
# Requires: dist-portable/linux-x64/ already built via
# `./scripts/build-portable.sh dist-portable/linux-x64` (run on Linux),
# and `dpkg-deb` (present on any Debian/Ubuntu box - confirmed available,
# and this whole script has been run successfully end-to-end, including
# a real install via `dpkg -i`, in this project's own Ubuntu build
# environment).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VERSION="$(node -p "require('$ROOT_DIR/package.json').version")"
PORTABLE_DIR="$ROOT_DIR/dist-portable/linux-x64"
PKG_ROOT="$ROOT_DIR/dist-installers/deb/qaxs_${VERSION}_amd64"

if [ ! -d "$PORTABLE_DIR" ]; then
  echo "error: $PORTABLE_DIR not found - run ./scripts/build-portable.sh dist-portable/linux-x64 first" >&2
  exit 1
fi

rm -rf "$PKG_ROOT"
mkdir -p "$PKG_ROOT/DEBIAN" "$PKG_ROOT/usr/local/bin" "$PKG_ROOT/usr/local/lib/qaxs"

cp "$ROOT_DIR/installer/linux/debian/control" "$PKG_ROOT/DEBIAN/control"
sed -i "s/^Version:.*/Version: $VERSION/" "$PKG_ROOT/DEBIAN/control"
cp "$ROOT_DIR/installer/linux/debian/postinst" "$PKG_ROOT/DEBIAN/postinst"
chmod 755 "$PKG_ROOT/DEBIAN/postinst"

# The whole portable folder (app, node_modules, bundled node runtime,
# license files, models/ placeholder) goes to a real, fixed location...
cp -r "$PORTABLE_DIR"/. "$PKG_ROOT/usr/local/lib/qaxs/"
# ...and /usr/local/bin/qaxs is a thin symlink to the launcher inside it,
# which is what actually needs to be on PATH.
ln -sf /usr/local/lib/qaxs/qaxs "$PKG_ROOT/usr/local/bin/qaxs"

dpkg-deb --build --root-owner-group "$PKG_ROOT" "$ROOT_DIR/dist-installers/qaxs_${VERSION}_amd64.deb"
echo "Built dist-installers/qaxs_${VERSION}_amd64.deb"
