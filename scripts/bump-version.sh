#!/usr/bin/env bash
# scripts/bump-version.sh <patch|minor|major> ["short summary line"]
#
# Single source of truth is package.json's "version" field. This script:
#   1. Computes the new semver from the bump type.
#   2. Writes it to package.json AND VERSION (kept identical on purpose —
#      VERSION exists so shell scripts/installers can read it without a
#      JSON parser).
#   3. Inserts a new dated section at the top of CHANGELOG.md's history
#      (right after "## [Unreleased]") so a version bump can never ship
#      without a changelog entry to fill in.
#
# It does NOT git-commit or git-tag for you — review the diff first.

set -euo pipefail

BUMP_TYPE="${1:-}"
SUMMARY="${2:-TODO: describe this release}"

if [[ "$BUMP_TYPE" != "patch" && "$BUMP_TYPE" != "minor" && "$BUMP_TYPE" != "major" ]]; then
  echo "usage: scripts/bump-version.sh <patch|minor|major> [\"summary\"]" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG_JSON="$ROOT_DIR/package.json"
VERSION_FILE="$ROOT_DIR/VERSION"
CHANGELOG="$ROOT_DIR/CHANGELOG.md"

CURRENT="$(node -p "require('$PKG_JSON').version")"
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

case "$BUMP_TYPE" in
  patch) PATCH=$((PATCH + 1)) ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
TODAY="$(date +%Y-%m-%d)"

node -e "
  const fs = require('fs');
  const p = require('$PKG_JSON');
  p.version = '$NEW_VERSION';
  fs.writeFileSync('$PKG_JSON', JSON.stringify(p, null, 2) + '\n');
"

echo "$NEW_VERSION" > "$VERSION_FILE"

# Insert new section right after the "## [Unreleased]" marker.
TMP_FILE="$(mktemp)"
awk -v ver="$NEW_VERSION" -v date="$TODAY" -v summary="$SUMMARY" '
  { print }
  /^## \[Unreleased\]/ && !done {
    print ""
    print "## [" ver "] - " date
    print ""
    print "- " summary
    done = 1
  }
' "$CHANGELOG" > "$TMP_FILE"
mv "$TMP_FILE" "$CHANGELOG"

echo "Bumped $CURRENT -> $NEW_VERSION"
echo "Updated: package.json, VERSION, CHANGELOG.md"
echo "Now: fill in the CHANGELOG entry properly, review the diff, then commit + tag v$NEW_VERSION."
